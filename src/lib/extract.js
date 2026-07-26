// The deterministic half of observation: the pass counts, the agent judges.
// Spec: docs/SPEC-V2.md — "Extraction".
//
// Everything here is arithmetic over turns the readers already vetted. Nothing
// infers meaning: request patterns and phrase meanings are the in-session
// agent's job, because regex cannot do semantics at this volume (measured: 2
// friction markers in 60 real turns).
import { scanTurn } from "./redact.js";

/** Precision over recall: a wrong proposal costs trust, a missed one costs nothing. */
export const MIN_OCCURRENCES = 3;
export const MIN_SESSIONS = 2;

/** Pasted material is the developer's message but not their voice. */
export function stripPasted(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{4,}.*$/gm, " ")
    .replace(/^\s*at\s+\S+\(?.*:\d+.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasPastedBlock(text) {
  return /```/.test(text) || /\n\s+at\s+\S+:\d+/.test(text) || text.split("\n").length > 6;
}

/**
 * Redact, then drop anything that isn't usable prose.
 * Redaction runs here — on read, before anything is persisted.
 */
export function cleanTurns(turns) {
  const kept = [];
  const scans = [];
  for (const turn of turns) {
    const scan = scanTurn(turn.text);
    scans.push(scan);
    if (scan.action !== "keep") continue;
    kept.push({ ...turn, text: scan.text, voice: stripPasted(scan.text) });
  }
  return { turns: kept, scans };
}

const words = (text) => text.split(/\s+/).filter(Boolean).length;

/** Local-time hour histogram → a rhythm candidate, if one is pronounced. */
export function rhythm(turns) {
  const dated = turns.filter((t) => t.ts);
  if (dated.length < 10) return null;

  const hours = new Array(24).fill(0);
  for (const turn of dated) hours[new Date(turn.ts).getHours()]++;

  // Best contiguous 2-hour window. Ties break toward the window whose first
  // hour actually has traffic — otherwise a window can be reported as starting
  // an hour before anyone was working.
  let best = { start: 0, count: -1, lead: -1 };
  for (let h = 0; h < 24; h++) {
    const count = hours[h] + hours[(h + 1) % 24];
    if (count > best.count || (count === best.count && hours[h] > best.lead)) {
      best = { start: h, count, lead: hours[h] };
    }
  }

  const share = best.count / dated.length;
  if (share < 0.25) return null;

  const fmt = (h) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
  return {
    kind: "rhythm",
    section: "Rhythm & Context",
    text: `Often starts work between ${fmt(best.start)} and ${fmt((best.start + 2) % 24)}`,
    occurrences: best.count,
    sessions: new Set(dated.map((t) => t.session)).size,
    evidence: [`${best.count} of ${dated.length} prompts fall in that window`],
  };
}

/** Terseness is bimodal or it is nothing: short turns cluster on procedural asks. */
export function terseness(turns) {
  if (turns.length < 10) return null;

  const lengths = turns.map((t) => words(t.voice)).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  const short = turns.filter((t) => words(t.voice) <= 8);
  if (short.length < MIN_OCCURRENCES) return null;

  const shortShare = short.length / turns.length;
  if (shortShare < 0.1 || median <= 8) return null;

  return {
    kind: "terseness",
    section: "Communication Style",
    text: `Terse for approvals and continuations, fuller when defining work`,
    occurrences: short.length,
    sessions: new Set(short.map((t) => t.session)).size,
    evidence: [
      `median ${median} words overall, but ${short.length} of ${turns.length} turns are 8 words or fewer`,
      ...short.slice(0, 2).map((t) => `e.g. "${t.voice}"`),
    ],
  };
}

/** Repeated short turns: counted here, interpreted by the agent. */
export function repeatedPhrases(turns) {
  const groups = new Map();
  for (const turn of turns) {
    const voice = turn.voice;
    if (!voice || words(voice) > 8) continue;
    const key = voice.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(turn);
  }

  const out = [];
  for (const [key, group] of groups) {
    const sessions = new Set(group.map((t) => t.session)).size;
    if (group.length < MIN_OCCURRENCES || sessions < MIN_SESSIONS) continue;
    out.push({
      kind: "repeated-phrase",
      section: "Request Patterns",
      // Deliberately not a claim about meaning — the agent supplies that.
      text: `"${group[0].voice}" recurs as a standalone request`,
      occurrences: group.length,
      sessions,
      evidence: [`${group.length} times across ${sessions} sessions`],
      needsInterpretation: true,
      phrase: group[0].voice,
      key,
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences);
}

/** Which projects the developer actually works in. */
export function projectSpread(turns) {
  const counts = new Map();
  for (const turn of turns) {
    if (!turn.cwd) continue;
    const project = turn.cwd.split("/").filter(Boolean).pop();
    if (!project) continue;
    counts.set(project, (counts.get(project) || 0) + 1);
  }
  if (counts.size < 2) return null;

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const top = ranked.slice(0, 3);
  if (top[0][1] / total < 0.2) return null;

  return {
    kind: "project-spread",
    section: "Rhythm & Context",
    text: `Works mainly across ${top.map(([name]) => name).join(", ")}`,
    occurrences: top[0][1],
    sessions: new Set(turns.map((t) => t.session)).size,
    evidence: [ranked.slice(0, 5).map(([name, n]) => `${name} ${n}`).join(", ")],
  };
}

/**
 * Run every deterministic extractor and keep only what clears the bar.
 * Candidates are proposals-in-waiting, never facts.
 */
export function extract(rawTurns) {
  const { turns, scans } = cleanTurns(rawTurns);
  const usable = turns.filter((t) => t.voice && !hasPastedBlock(t.text));

  const candidates = [
    rhythm(usable),
    terseness(usable),
    projectSpread(usable),
    ...repeatedPhrases(usable),
  ].filter(Boolean);

  const cleared = candidates.filter(
    (c) => c.occurrences >= MIN_OCCURRENCES && c.sessions >= Math.min(MIN_SESSIONS, 1) + 0
  );

  return { candidates: cleared, scanned: rawTurns.length, usable: usable.length, scans };
}
