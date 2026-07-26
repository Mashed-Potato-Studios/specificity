// Storage drivers and the contract they satisfy.
// Spec: docs/SPEC-V2.md — "Storage driver contract".
//
// The required contract is four operations — get, put, list, delete — with no
// locking and no compare-and-swap. That is deliberate: a git repo, a synced
// folder, a bucket and a future hosted service can all satisfy it without
// emulating semantics they lack. Divergence is expected and resolved by the
// journal, not prevented here.
//
// `capabilities`, `versions()` and `readVersion()` are OPTIONAL. A driver that
// omits them is fully conformant; the core checks `capabilities.history`
// before offering rollback and degrades cleanly when it is absent. They exist
// to serve the failure posture's "offer the previous version where the driver
// has history".
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";

/** Bumped only when the driver interface itself changes. */
export const CONTRACT_VERSION = 1;

/** In-memory driver. Ships for tests and as the reference implementation. */
export function memoryDriver() {
  const objects = new Map();
  return {
    name: "memory",
    capabilities: { history: false },
    async get(key) {
      return objects.has(key) ? Buffer.from(objects.get(key)) : null;
    },
    async put(key, bytes) {
      objects.set(key, Buffer.from(bytes));
    },
    async list(prefix = "") {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

/**
 * Filesystem driver — covers Dropbox, iCloud, Syncthing, a NAS, a mounted
 * drive. Keeps the last N versions so a bad observation can be rolled back.
 */
export function fsDriver({ root, keepVersions = 10 }) {
  const resolve = (key) => path.join(root, key);
  const versionsDir = path.join(root, ".versions");

  return {
    name: "fs",
    capabilities: { history: true },

    async get(key) {
      try {
        return fs.readFileSync(resolve(key));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },

    async put(key, bytes) {
      fs.mkdirSync(root, { recursive: true });
      const target = resolve(key);

      if (fs.existsSync(target)) {
        fs.mkdirSync(versionsDir, { recursive: true });
        // Timestamp plus a counter: two writes in the same millisecond must not
        // collapse into one archived version.
        const stamp = `${Date.now()}`.padStart(14, "0");
        fs.copyFileSync(target, path.join(versionsDir, `${key}.${stamp}.${nextSeq()}`));
        prune(versionsDir, key, keepVersions);
      }

      // Write-then-rename so a crash mid-write can't leave a half object.
      const temp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(temp, bytes);
      fs.renameSync(temp, target);
    },

    async list(prefix = "") {
      if (!fs.existsSync(root)) return [];
      return fs
        .readdirSync(root)
        .filter((f) => f.startsWith(prefix) && !f.startsWith(".") && !f.includes(".tmp-"))
        .sort();
    },

    async delete(key) {
      try {
        fs.unlinkSync(resolve(key));
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    },

    async versions(key) {
      if (!fs.existsSync(versionsDir)) return [];
      return fs
        .readdirSync(versionsDir)
        .filter((f) => f.startsWith(`${key}.`))
        .sort()
        .reverse();
    },

    /** Read an archived version back. Without this, history is unreachable. */
    async readVersion(key, version) {
      try {
        return fs.readFileSync(path.join(versionsDir, version));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },
  };
}

// Counter plus process entropy: the counter alone is per-process, so two
// processes writing in the same millisecond would still collide.
let versionSeq = 0;
const nextSeq = () =>
  `${String(versionSeq++).padStart(6, "0")}-${crypto.randomBytes(3).toString("hex")}`;

function prune(versionsDir, key, keep) {
  const kept = fs
    .readdirSync(versionsDir)
    .filter((f) => f.startsWith(`${key}.`))
    .sort();
  for (const stale of kept.slice(0, Math.max(0, kept.length - keep))) {
    fs.unlinkSync(path.join(versionsDir, stale));
  }
}

/**
 * Git driver — version history and credential handling for free, via the
 * user's existing setup. Shells out rather than taking a dependency.
 */
export function gitDriver({ root, remote = null, branch = "HEAD", commitMessage = "specificity: sync" }) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  const ensureRepo = () => {
    fs.mkdirSync(root, { recursive: true });
    if (!fs.existsSync(path.join(root, ".git"))) git("init", "--quiet");
  };

  /**
   * Pull before reading. Without this the driver only ever sees its own
   * working tree, so two machines sharing a repo would never see each other —
   * which is the entire point of choosing git.
   */
  const refresh = () => {
    if (!remote) return;
    try {
      git("fetch", "--quiet", remote);
      git("merge", "--quiet", "--ff-only", "FETCH_HEAD");
    } catch {
      // Diverged or unreachable. The journal merges at a higher layer, so a
      // failed fast-forward is not fatal: we read what we have and push after.
    }
  };

  return {
    name: "git",
    capabilities: { history: true },

    async get(key) {
      refresh();
      try {
        return fs.readFileSync(path.join(root, key));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },

    async put(key, bytes) {
      ensureRepo();
      fs.writeFileSync(path.join(root, key), bytes);
      git("add", "--", key);
      // Nothing staged means nothing changed — not an error.
      try {
        git("commit", "--quiet", "-m", commitMessage, "--", key);
      } catch {
        /* no-op: identical content */
      }
      if (remote) git("push", "--quiet", remote, branch);
    },

    async list(prefix = "") {
      if (!fs.existsSync(root)) return [];
      return fs
        .readdirSync(root)
        .filter((f) => f.startsWith(prefix) && !f.startsWith("."))
        .sort();
    },

    async delete(key) {
      const target = path.join(root, key);
      if (!fs.existsSync(target)) return;
      git("rm", "--quiet", "--", key);
      try {
        git("commit", "--quiet", "-m", `${commitMessage} (delete)`);
      } catch {
        /* no-op */
      }
      // Match put: a delete that never reaches the remote isn't a delete.
      if (remote) git("push", "--quiet", remote, branch);
    },

    async versions(key) {
      try {
        return git("log", "--format=%H", "--", key).split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },

    async readVersion(key, version) {
      try {
        return execFileSync("git", ["show", `${version}:${key}`], {
          cwd: root,
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch {
        return null;
      }
    },
  };
}
