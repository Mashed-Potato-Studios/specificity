// Pull, merge, materialize, push.
// Spec: docs/SPEC-V2.md — "Storage driver contract" / "Merge model".
//
// Failure posture: degrade, never block. A sync problem must never stop the
// agent or destroy the local plaintext, which stays authoritative.
import fs from "fs";
import path from "path";
import { getProfileDir } from "../../hooks/specificity-config.js";
import { encrypt, decrypt, pathFor } from "./crypto.js";
import { machineId } from "./identity.js";
import { mergeJournals, materialize, renderProfile, reconcile, compact } from "./journal.js";

export const JOURNAL_FILE = "_journal.jsonl";
export const PROFILE_FILE = "PROFILE.md";

/**
 * Files that travel, each as its own blob.
 *
 * Only the journal merges — it is the source of truth, and union-merging it is
 * what makes concurrent edits safe. The rest are conveniences derived from or
 * beside it, and are last-writer-wins across machines. `PROFILE.md` is
 * regenerated from the journal on every sync, so shipping it costs nothing and
 * lets a reader see the profile without replaying events.
 */
export const SYNCED_FILES = [PROFILE_FILE, "EXPERIENCE.md", JOURNAL_FILE, "_observations.jsonl"];

export function readJournal(dir = getProfileDir()) {
  const target = path.join(dir, JOURNAL_FILE);
  if (!fs.existsSync(target)) return [];
  return fs
    .readFileSync(target, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // A torn last line must not lose the whole journal.
      }
    })
    .filter(Boolean);
}

export function writeJournal(events, dir = getProfileDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, JOURNAL_FILE);
  // Write-then-rename. The journal is the one file that cannot be rebuilt from
  // anything else, so a crash mid-write must not truncate it.
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temp, events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : ""));
  fs.renameSync(temp, target);
}

/** Parse an encrypted journal blob. Returns null if it is not valid JSONL. */
function parseJournalText(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      return null;
    }
  }
  return events;
}

export function appendEvents(events, dir = getProfileDir()) {
  if (!events.length) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, JOURNAL_FILE),
    events.map((e) => JSON.stringify(e)).join("\n") + "\n"
  );
}

/**
 * Snapshot of what we last wrote to PROFILE.md. Hand-edits are detected by
 * diffing the file against this, never against the journal.
 */
export const SNAPSHOT_FILE = "_materialized.md";

/** Rewrite PROFILE.md from the journal, and record what was written. */
export function materializeToDisk(events, dir = getProfileDir()) {
  const state = materialize(events);
  const target = path.join(dir, PROFILE_FILE);
  // Render against the file already on disk so prose, sub-headings, comments
  // and unknown sections survive — the convention requires consumers to
  // preserve what they don't understand.
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const rendered = renderProfile(state, { existing });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PROFILE_FILE), rendered);
  fs.writeFileSync(path.join(dir, SNAPSHOT_FILE), rendered);
  return state;
}

function readSnapshot(dir) {
  try {
    return fs.readFileSync(path.join(dir, SNAPSHOT_FILE), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}

/**
 * Fold any hand-edits of PROFILE.md back into the journal before syncing.
 * The local file always wins that diff.
 */
export function reconcileLocalEdits({ dir = getProfileDir(), ts = Date.now() } = {}) {
  const target = path.join(dir, PROFILE_FILE);
  if (!fs.existsSync(target)) return [];
  const produced = reconcile({
    markdown: fs.readFileSync(target, "utf8"),
    snapshot: readSnapshot(dir),
    machine: machineId(dir),
    ts,
  });
  appendEvents(produced, dir);
  return produced;
}

/**
 * One sync round: reconcile local edits, pull and merge the remote journal,
 * rewrite the profile, push everything back.
 *
 * Never throws for remote problems — returns status and warnings instead.
 */
export async function sync({ driver, key, dir = getProfileDir(), ts = Date.now() } = {}) {
  const warnings = [];
  const result = { status: "ok", warnings, pulled: 0, pushed: 0, reconciled: 0 };

  if (!key) {
    result.status = "no-key";
    warnings.push("No key on this machine. Run `specificity key restore` to sync.");
    return result;
  }

  const reconciled = reconcileLocalEdits({ dir, ts });
  let events = readJournal(dir);
  result.reconciled = reconciled.length;

  // --- pull -----------------------------------------------------------------
  let remoteEvents = [];
  try {
    const blob = await driver.get(pathFor(key, JOURNAL_FILE));
    if (blob) {
      let plaintext;
      try {
        plaintext = decrypt(key, blob);
      } catch (err) {
        // Wrong key or corrupt blob. Refuse — never overwrite local with
        // garbage, never silently re-key.
        result.status = "refused";
        const history = await listVersions({ driver, key });
        result.versions = history;
        warnings.push(
          `Remote profile could not be decrypted (${err.message}). ` +
            `Local profile left untouched; nothing was pushed.` +
            (history.length
              ? ` ${history.length} earlier version(s) are available — ` +
                `run \`specificity rollback <location>\` to recover one.`
              : "")
        );
        return result;
      }
      const parsed = parseJournalText(plaintext.toString("utf8"));
      if (parsed === null) {
        // Decrypted but malformed. Same posture as a bad tag: refuse, keep
        // local intact. It must not fall through to the unreachable branch.
        result.status = "refused";
        warnings.push(
          "Remote journal decrypted but is not valid JSONL. " +
            "Local profile left untouched; nothing was pushed."
        );
        return result;
      }
      remoteEvents = parsed;
      result.pulled = remoteEvents.length;
    }
  } catch (err) {
    result.status = "local-only";
    warnings.push(`Remote unreachable (${err.message}). Working from the local profile.`);
  }

  // --- merge ----------------------------------------------------------------
  // Compaction runs here so the journal cannot grow without bound. Tombstones
  // are retained by compact() regardless of age.
  const merged = compact(mergeJournals(events, remoteEvents), { now: ts, machine: machineId(dir) });
  writeJournal(merged, dir);
  materializeToDisk(merged, dir);

  if (result.status === "local-only") return result;

  // --- push -----------------------------------------------------------------
  try {
    for (const file of SYNCED_FILES) {
      const source = path.join(dir, file);
      if (!fs.existsSync(source)) continue;
      await driver.put(pathFor(key, file), encrypt(key, fs.readFileSync(source)));
      result.pushed++;
    }
  } catch (err) {
    result.status = "local-only";
    warnings.push(`Could not push to remote (${err.message}). Changes are saved locally.`);
  }

  return result;
}

/**
 * Prior versions of the remote journal, newest first, as the failure posture
 * promises. Empty when the driver keeps no history.
 */
export async function listVersions({ driver, key } = {}) {
  if (!driver.capabilities?.history || typeof driver.versions !== "function") return [];
  try {
    return await driver.versions(pathFor(key, JOURNAL_FILE));
  } catch {
    return [];
  }
}

/**
 * Roll the profile back to an earlier remote version.
 *
 * The journal is append-only, so rolling back is *not* a delete: the recovered
 * events are merged with what is already local. A bad merge or a bad
 * observation is undone by restoring the events that predate it, while
 * anything learned since survives.
 */
export async function rollback({ driver, key, dir = getProfileDir(), version = null } = {}) {
  const versions = await listVersions({ driver, key });
  if (!versions.length) return { status: "no-history", versions: [] };

  const target = version || versions[0];
  const blob = await driver.readVersion(pathFor(key, JOURNAL_FILE), target);
  if (!blob) return { status: "not-found", versions, target };

  let events;
  try {
    events = parseJournalText(decrypt(key, blob).toString("utf8"));
  } catch (err) {
    return { status: "undecryptable", versions, target, error: err.message };
  }
  if (events === null) return { status: "corrupt", versions, target };

  const merged = mergeJournals(readJournal(dir), events);
  writeJournal(merged, dir);
  materializeToDisk(merged, dir);

  return { status: "restored", versions, target, recovered: events.length, total: merged.length };
}

/**
 * Restore onto a machine that has never seen this profile: pull, decrypt,
 * materialize. Requires only the phrase-derived key and the backend location.
 */
export async function restore({ driver, key, dir = getProfileDir() } = {}) {
  const blob = await driver.get(pathFor(key, JOURNAL_FILE));
  if (!blob) return { status: "empty", events: 0 };

  const events = parseJournalText(decrypt(key, blob).toString("utf8"));
  if (events === null) {
    throw new Error("remote journal decrypted but is not valid JSONL; nothing was written");
  }

  writeJournal(events, dir);
  materializeToDisk(events, dir);

  // Non-journal files are conveniences; a failure to fetch them is not fatal
  // because the journal already reconstructs the profile.
  for (const file of SYNCED_FILES) {
    if (file === JOURNAL_FILE || file === PROFILE_FILE) continue;
    try {
      const extra = await driver.get(pathFor(key, file));
      if (extra) fs.writeFileSync(path.join(dir, file), decrypt(key, extra));
    } catch {
      /* optional */
    }
  }

  return { status: "restored", events: events.length };
}
