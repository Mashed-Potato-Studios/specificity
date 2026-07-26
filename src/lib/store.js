// Storage drivers and the contract they satisfy.
// Spec: docs/SPEC-V2.md — "Storage driver contract".
//
// Four operations, no locking and no compare-and-swap. That is deliberate: a
// git repo, a synced folder, a bucket and a future hosted service can all
// satisfy it without emulating semantics they lack. Divergence is expected and
// resolved by the journal, not prevented here.
import fs from "fs";
import path from "path";
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
  };
}

let versionSeq = 0;
const nextSeq = () => String(versionSeq++).padStart(6, "0");

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
export function gitDriver({ root, remote = null, commitMessage = "specificity: sync" }) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  const ensureRepo = () => {
    fs.mkdirSync(root, { recursive: true });
    if (!fs.existsSync(path.join(root, ".git"))) git("init", "--quiet");
  };

  return {
    name: "git",
    capabilities: { history: true },

    async get(key) {
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
      if (remote) git("push", "--quiet", remote, "HEAD");
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
    },

    async versions(key) {
      try {
        return git("log", "--format=%H", "--", key).split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}
