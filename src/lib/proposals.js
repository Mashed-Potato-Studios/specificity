// The candidate store and the confirmation state machine.
// Spec: docs/SPEC-V2.md — "Confirmation".
//
// Nothing here ever writes a profile fact on its own. Every path to the journal
// runs through an explicit developer answer; that is the product's core promise.
import fs from "fs";
import path from "path";
import { getProfileDir } from "../../hooks/specificity-config.js";
import { factHash, makeEvent, materialize } from "./journal.js";
import { appendEvents, readJournal, materializeToDisk } from "./sync.js";
import { machineId } from "./identity.js";

export const OBSERVATIONS_FILE = "_observations.jsonl";

export const BATCH_LIMIT = 3;
export const WELCOME_BATCH_LIMIT = 8;
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** A contradiction must clear roughly double the ordinary evidence bar. */
export const CONTRADICTION_MULTIPLIER = 2;

const observationsPath = (dir) => path.join(dir, OBSERVATIONS_FILE);

export function loadCandidates(dir = getProfileDir()) {
  const target = observationsPath(dir);
  if (!fs.existsSync(target)) return [];

  // Append-only log: later records supersede earlier ones for the same key, so
  // a rejection is recorded rather than deleted.
  const byKey = new Map();
  for (const line of fs.readFileSync(target, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      byKey.set(record.key, { ...(byKey.get(record.key) || {}), ...record });
    } catch {
      /* torn line */
    }
  }
  return [...byKey.values()];
}

function append(record, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(observationsPath(dir), JSON.stringify(record) + "\n");
}

/** Stable identity for a candidate, so re-runs update rather than duplicate. */
export function candidateKey(candidate) {
  return `${candidate.kind}:${candidate.key || factHash(candidate.text)}`;
}

/**
 * Mark candidates that dispute something the developer already stated.
 *
 * Overlap on content words is a heuristic, deliberately: the cost of a missed
 * contradiction is an ordinary proposal, while the cost of a false one is the
 * tool arguing with someone about themselves.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "when", "with", "that", "they", "their", "work", "works",
  "working", "often", "mainly", "across", "between", "starts", "most", "some",
]);

const contentWords = (text) =>
  text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));

export function markContradictions(candidates, state) {
  const live = [...(state?.facts?.values?.() || [])];

  return candidates.map((candidate) => {
    const mine = new Set(contentWords(candidate.text));

    for (const fact of live) {
      if (fact.section !== candidate.section) continue;
      if (fact.text.toLowerCase() === candidate.text.toLowerCase()) continue;

      const shared = contentWords(fact.text).filter((w) => mine.has(w));
      // One distinctive word is enough. Declared facts are short ("Very
      // terse"), so demanding two overlaps would miss the case this exists
      // for — and a missed contradiction is worse than a marked one: it adds
      // a near-duplicate fact instead of offering to replace the old one.
      const distinctive = shared.some((w) => w.length >= 5);
      if (distinctive || shared.length >= 2) {
        return { ...candidate, contradicts: { factHash: fact.factHash, text: fact.text } };
      }
    }
    return candidate;
  });
}

/** Fold freshly extracted candidates into the store. */
export function recordCandidates(candidates, { dir = getProfileDir(), now = Date.now() } = {}) {
  const existing = new Map(loadCandidates(dir).map((c) => [c.key, c]));
  const recorded = [];

  // Rejections live in the journal, which merges across machines. The local
  // candidate store is last-writer-wins, so consulting only it would let
  // another machine's push resurrect a class the developer silenced for good.
  const rejected = materialize(readJournal(dir)).rejected;

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const prior = existing.get(key);

    // `never` is permanent: the whole pattern class stays suppressed.
    if (prior?.status === "rejected") continue;
    if (rejected.has(factHash(candidate.text))) continue;

    const record = {
      key,
      kind: candidate.kind,
      section: candidate.section,
      text: candidate.text,
      evidence: (candidate.evidence || []).slice(0, 3),
      occurrences: candidate.occurrences,
      sessions: candidate.sessions,
      needsInterpretation: candidate.needsInterpretation || false,
      contradicts: candidate.contradicts || null,
      firstSeen: prior?.firstSeen ?? now,
      lastSeen: now,
      status: prior?.status === "confirmed" ? "confirmed" : "candidate",
      declinedAt: prior?.declinedAt ?? null,
      declinedAtOccurrences: prior?.declinedAtOccurrences ?? null,
    };

    append(record, dir);
    recorded.push(record);
  }
  return recorded;
}

/** Is this candidate allowed to be shown right now? */
export function isDue(candidate) {
  if (candidate.status === "rejected" || candidate.status === "confirmed") return false;

  // "Not now" means exactly that: it returns only once evidence has doubled.
  if (candidate.declinedAtOccurrences != null) {
    return candidate.occurrences >= candidate.declinedAtOccurrences * 2;
  }

  if (candidate.contradicts) {
    return candidate.occurrences >= 3 * CONTRADICTION_MULTIPLIER;
  }
  return true;
}

/**
 * The batch to show, honouring the throttle.
 * Scanning is free; attention is not.
 */
export function dueProposals({ dir = getProfileDir(), now = Date.now(), lastBatchAt = null } = {}) {
  const all = loadCandidates(dir);
  const due = all.filter(isDue);
  if (!due.length) return { proposals: [], reason: "nothing new" };

  const isFirstRun = lastBatchAt == null;
  if (!isFirstRun && now - lastBatchAt < COOLDOWN_MS) {
    return { proposals: [], reason: "throttled" };
  }

  // Contradictions last: an ordinary proposal is a cheaper ask.
  due.sort((a, b) => Number(!!a.contradicts) - Number(!!b.contradicts) || b.occurrences - a.occurrences);

  return {
    proposals: due.slice(0, isFirstRun ? WELCOME_BATCH_LIMIT : BATCH_LIMIT),
    reason: isFirstRun ? "welcome" : "due",
    isFirstRun,
  };
}

function setStatus(key, patch, dir, now) {
  append({ key, lastSeen: now, ...patch }, dir);
}

/** `y` — write the fact. The only path from candidate to profile. */
export function accept(candidate, { dir = getProfileDir(), now = Date.now(), text = null } = {}) {
  const events = [
    makeEvent({
      op: "add",
      section: candidate.section,
      // `e` (reworded) stores the developer's own words, which outrank ours.
      text: text || candidate.text,
      origin: text ? "stated" : "confirmed-observation",
      evidence: candidate.evidence,
      machine: machineId(dir),
      ts: now,
    }),
  ];
  if (candidate.contradicts?.factHash) {
    events.push(
      makeEvent({ op: "remove", factHash: candidate.contradicts.factHash, machine: machineId(dir), ts: now })
    );
  }
  appendEvents(events, dir);
  // Rewrite the profile immediately. An accepted fact the agent can't read
  // until the next sync isn't accepted from the developer's point of view.
  materializeToDisk(readJournal(dir), dir);
  setStatus(candidate.key, { status: "confirmed" }, dir, now);
  return events;
}

/** `n` — not now. The candidate survives; evidence must double to return. */
export function decline(candidate, { dir = getProfileDir(), now = Date.now() } = {}) {
  setStatus(
    candidate.key,
    { status: "candidate", declinedAt: now, declinedAtOccurrences: candidate.occurrences },
    dir,
    now
  );
}

/** `never` — suppress the class permanently. A rejection is data, not a deletion. */
export function never(candidate, { dir = getProfileDir(), now = Date.now() } = {}) {
  setStatus(candidate.key, { status: "rejected", rejectedAt: now }, dir, now);
  appendEvents(
    [makeEvent({ op: "reject", text: candidate.text, machine: machineId(dir), ts: now })],
    dir
  );
}

/** `k` — keep mine. The declared fact stands; the tension is recorded, not lost. */
export function keepMine(candidate, { dir = getProfileDir(), now = Date.now() } = {}) {
  setStatus(
    candidate.key,
    {
      status: "candidate",
      declinedAt: now,
      declinedAtOccurrences: candidate.occurrences,
      tension: { observed: candidate.text, declared: candidate.contradicts?.text || null, at: now },
    },
    dir,
    now
  );
}

/**
 * Apply a verdict to a candidate. The single place any surface turns an answer
 * into an action — the CLI, the MCP bridge and anything later all route here,
 * so the trust boundary and the answer semantics cannot drift between them.
 */
export function applyVerdict(candidate, verdict, { text = null, dir = getProfileDir(), now = Date.now() } = {}) {
  switch (verdict) {
    case "y":
    case "yes":
    case "add":
      accept(candidate, { dir, now });
      return { ok: true, message: `Added to ${candidate.section}.` };

    case "e":
    case "edit":
      if (!text || !text.trim()) {
        return { ok: false, error: "'edit' needs the developer's own wording" };
      }
      accept(candidate, { dir, now, text: text.trim() });
      return { ok: true, message: `Added to ${candidate.section}, in your words.` };

    case "n":
    case "no":
      decline(candidate, { dir, now });
      return { ok: true, message: "Left it. It returns only if the evidence doubles." };

    case "never":
      never(candidate, { dir, now });
      return { ok: true, message: "Won't suggest that again." };

    case "k":
    case "keep":
      if (!candidate.contradicts) {
        return { ok: false, error: "'keep' applies only to a proposal that disputes a stated fact" };
      }
      keepMine(candidate, { dir, now });
      return { ok: true, message: "Kept what you said. The disagreement is recorded." };

    default:
      return { ok: false, error: `unknown verdict "${verdict}"` };
  }
}

/** Render a batch the way the prototype settled on: claim, count, one quote. */
export function renderBatch(proposals) {
  if (!proposals.length) return "";
  const lines = [`Specificity noticed ${proposals.length} thing${proposals.length === 1 ? "" : "s"}:`, ""];

  proposals.forEach((proposal, index) => {
    const number = index + 1;
    if (proposal.contradicts) {
      lines.push(`${number}. ${proposal.section}  ⚠ disputes a fact you stated`);
      lines.push(`   You said: "${proposal.contradicts.text}"`);
      lines.push(`   Observed: ${proposal.evidence[0] || `${proposal.occurrences} times`}`);
      lines.push(`   Suggest: "${proposal.text}"`);
      lines.push(`   [y] replace  [k] keep mine  [e] edit`);
    } else {
      lines.push(`${number}. ${proposal.section}`);
      // Some claims quote a phrase already; don't quote the quote.
      lines.push(`   ${proposal.text.startsWith('"') ? proposal.text : `"${proposal.text}"`}`);
      lines.push(`   ${proposal.evidence[0] || `${proposal.occurrences} occurrences`}`);
      lines.push(`   [y] add  [n] no  [e] edit  [never]`);
    }
    lines.push("");
  });

  return lines.join("\n");
}
