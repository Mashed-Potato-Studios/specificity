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
import { mergeJournals, materialize, renderProfile, reconcile } from "./journal.js";

export const JOURNAL_FILE = "_journal.jsonl";
export const PROFILE_FILE = "PROFILE.md";

/** Files that travel, each as its own blob so append-only data union-merges. */
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
  fs.writeFileSync(
    path.join(dir, JOURNAL_FILE),
    events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "")
  );
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
  const rendered = renderProfile(state);
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
        warnings.push(
          `Remote profile could not be decrypted (${err.message}). ` +
            `Local profile left untouched; nothing was pushed.`
        );
        return result;
      }
      remoteEvents = plaintext
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      result.pulled = remoteEvents.length;
    }
  } catch (err) {
    result.status = "local-only";
    warnings.push(`Remote unreachable (${err.message}). Working from the local profile.`);
  }

  // --- merge ----------------------------------------------------------------
  const merged = mergeJournals(events, remoteEvents);
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
 * Restore onto a machine that has never seen this profile: pull, decrypt,
 * materialize. Requires only the phrase-derived key and the backend location.
 */
export async function restore({ driver, key, dir = getProfileDir() } = {}) {
  const blob = await driver.get(pathFor(key, JOURNAL_FILE));
  if (!blob) return { status: "empty", events: 0 };

  const events = decrypt(key, blob)
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

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
