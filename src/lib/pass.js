// The opportunistic pass: read, extract, record. No daemon.
// Spec: docs/SPEC-V2.md — "Runtime: there is no daemon".
//
// A full cold scan of 50MB of transcript history measured 0.41s, so nothing
// needs to watch append-only files. This runs at session start and on demand.
import fs from "fs";
import path from "path";
import { getProfileDir } from "../../hooks/specificity-config.js";
import { readAll } from "./readers.js";
import { extract } from "./extract.js";
import { recordCandidates, markContradictions } from "./proposals.js";
import { readJournal } from "./sync.js";
import { materialize } from "./journal.js";
import { summarize } from "./redact.js";

export const STATE_FILE = "_pass.json";

export function readState(dir = getProfileDir()) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), "utf8"));
  } catch {
    return { cursors: {}, lastRunAt: null, lastBatchAt: null, quarantined: [] };
  }
}

export function writeState(state, dir = getProfileDir()) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

/**
 * One pass. Cheap enough to run on every session start; the throttle that
 * matters is on *proposing*, not on scanning.
 */
export function runPass({ dir = getProfileDir(), now = Date.now(), roots = {}, readers } = {}) {
  const state = readState(dir);

  const previouslyQuarantined = state.quarantined || [];
  const { turns, quarantined, cursors } = readAll({
    ...(readers ? { readers } : {}),
    roots,
    cursors: state.cursors,
    quarantine: previouslyQuarantined,
  });

  // Sticky, and reported once: a reader that broke stays broken until someone
  // looks at it, and the developer hears about it the first time only.
  const knownBroken = new Set(previouslyQuarantined.map((q) => q.reader));
  const newlyQuarantined = quarantined.filter((q) => !knownBroken.has(q.reader));
  const allQuarantined = [...previouslyQuarantined, ...newlyQuarantined];

  const { candidates, scanned, usable, scans } = extract(turns);
  const marked = markContradictions(candidates, materialize(readJournal(dir)));
  const recorded = recordCandidates(marked, { dir, now });

  writeState(
    { ...state, cursors, lastRunAt: now, quarantined: allQuarantined, redaction: summarize(scans) },
    dir
  );

  return {
    scanned,
    usable,
    candidates: recorded.length,
    // Only the new ones are surfaced; the rest are on record, not news.
    quarantined: newlyQuarantined,
    redaction: summarize(scans),
  };
}
