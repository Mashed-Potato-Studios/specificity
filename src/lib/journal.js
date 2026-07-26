// The append-only journal: source of truth for every profile change.
// Spec: docs/SPEC-V2.md — "Merge model".
//
// Merging is set union by event id, so two machines that both learned while
// offline both keep what they learned. Nothing is written over, only appended.
import crypto from "crypto";

const OPS = new Set(["add", "remove", "amend", "confirm", "reject", "snapshot"]);

/** Identity of a fact is its normalized text. Whitespace and case don't matter. */
export function factHash(text) {
  return crypto
    .createHash("sha256")
    .update(String(text).trim().replace(/\s+/g, " ").toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * Build a journal event.
 *
 * A `remove` is a tombstone: it carries the fact's hash and never its text,
 * so "forget this about me" doesn't leave the forgotten thing sitting in a
 * synced journal forever.
 */
export function makeEvent({ op, section, text, factHash: hash, machine, ts, origin, evidence, facts }) {
  if (!OPS.has(op)) throw new Error(`unknown op: ${op}`);
  if (!machine) throw new Error("event requires a machine id");

  const event = {
    id: crypto.randomUUID(),
    ts: ts ?? Date.now(),
    machine,
    op,
  };

  if (hash || text !== undefined) event.factHash = hash || factHash(text);
  if (section) event.section = section;
  if (origin) event.origin = origin;
  if (evidence) event.evidence = evidence;
  if (op === "snapshot") event.facts = facts || [];

  // Tombstones and confirmations never carry text.
  if (text !== undefined && op !== "remove" && op !== "confirm") event.text = text;

  return event;
}

/** Deterministic order: timestamp, then machine, then id. */
function ordered(events) {
  return [...events].sort(
    (a, b) =>
      a.ts - b.ts ||
      String(a.machine).localeCompare(String(b.machine)) ||
      String(a.id).localeCompare(String(b.id))
  );
}

/** Union any number of journals by event id. Idempotent and commutative. */
export function mergeJournals(...journals) {
  const byId = new Map();
  for (const journal of journals) {
    for (const event of journal || []) byId.set(event.id, event);
  }
  return ordered(byId.values());
}

/**
 * Fold the journal into current state: live facts by section, rejected
 * candidate classes, and the provenance riding on each fact.
 */
export function materialize(events) {
  const live = new Map(); // factHash -> fact
  const rejected = new Set();

  const applyAdd = (hash, { section, text, ts, origin }) => {
    const existing = live.get(hash);
    if (existing) {
      existing.lastSeenAt = ts;
      if (section) existing.section = section;
      return;
    }
    live.set(hash, {
      factHash: hash,
      section: section || "Uncategorized",
      text,
      origin: origin || "confirmed-observation",
      confirmedAt: ts,
      lastSeenAt: ts,
    });
  };

  for (const event of ordered(events)) {
    switch (event.op) {
      case "snapshot":
        for (const fact of event.facts || []) applyAdd(fact.factHash, fact);
        break;
      case "add":
        applyAdd(event.factHash, event);
        break;
      case "remove":
        live.delete(event.factHash);
        break;
      case "amend": {
        const previous = live.get(event.factHash);
        live.delete(event.factHash);
        applyAdd(factHash(event.text), {
          section: event.section || previous?.section,
          text: event.text,
          ts: event.ts,
          origin: event.origin || "stated",
        });
        break;
      }
      case "confirm": {
        const fact = live.get(event.factHash);
        if (fact) fact.lastSeenAt = event.ts;
        break;
      }
      case "reject":
        rejected.add(event.factHash);
        break;
    }
  }

  const sections = new Map();
  for (const fact of live.values()) {
    if (!sections.has(fact.section)) sections.set(fact.section, []);
    sections.get(fact.section).push(fact);
  }

  return { sections, rejected, facts: live };
}

/** Order sections as the convention lists them; unknown ones keep their order. */
const SECTION_ORDER = [
  "Identity & Background",
  "Language & Dialect",
  "Phrase Map",
  "Communication Style",
  "Interaction Preferences",
  "Request Patterns",
  "Working Habits",
  "Rhythm & Context",
  "Anti-patterns",
  "Technical Background",
  "Definition of Done",
  "Misunderstanding Log",
];

/**
 * Render materialized state as the human-readable profile.
 * A section with no facts is omitted entirely — convention v1 says a missing
 * section means unknown, and an empty heading would imply "none".
 */
export function renderProfile(state, { name = "", updated = null } = {}) {
  const names = [...state.sections.keys()].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });

  const date = updated || new Date().toISOString().slice(0, 10);
  const out = [
    "<!-- specificity-profile-version: 1 -->",
    `# Specificity Profile${name ? ` — ${name}` : ""}`,
    `# Updated: ${date}`,
    "",
  ];

  for (const section of names) {
    const facts = state.sections.get(section);
    if (!facts || facts.length === 0) continue;
    out.push(`## ${section}`);
    for (const fact of facts) out.push(`- ${fact.text}`);
    out.push("");
  }

  return out.join("\n");
}

/** Read a profile back into sections of plain fact lines. */
export function parseProfile(markdown) {
  const sections = new Map();
  let current = null;

  for (const line of String(markdown).split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+?)\s*$/);
    if (bullet && current) sections.get(current).push(bullet[1]);
  }

  return sections;
}

/**
 * Diff a hand-edited profile against the **last materialized snapshot** and
 * return the events that account for the difference.
 *
 * The comparison must be against the snapshot, not against the journal. A fact
 * the journal has learned but that has not been written to the file yet is new
 * learning, not a hand deletion — and a fact tombstoned in the journal but
 * still present in a stale file is not a hand re-add. Diffing against the
 * journal silently deletes new facts and resurrects deleted ones.
 *
 * The local file always wins this diff: a developer editing their own profile
 * in a text editor is the most authoritative input the system has.
 */
export function reconcile({ markdown, snapshot = "", machine, ts = Date.now() }) {
  const onDisk = parseProfile(markdown);
  const wasWritten = parseProfile(snapshot);
  const produced = [];

  const snapshotHashes = new Set();
  for (const lines of wasWritten.values()) {
    for (const text of lines) snapshotHashes.add(factHash(text));
  }

  const diskHashes = new Set();
  for (const [section, lines] of onDisk) {
    for (const text of lines) {
      const hash = factHash(text);
      diskHashes.add(hash);
      if (!snapshotHashes.has(hash)) {
        produced.push(makeEvent({ op: "add", section, text, machine, ts, origin: "stated" }));
      }
    }
  }

  for (const hash of snapshotHashes) {
    if (!diskHashes.has(hash)) {
      produced.push(makeEvent({ op: "remove", factHash: hash, machine, ts }));
    }
  }

  return produced;
}

/**
 * Fold events older than the window into a single snapshot.
 *
 * Tombstones are kept forever regardless of age: a machine that has been
 * offline for a year must still not be able to resurrect a deleted fact.
 */
export function compact(events, { now = Date.now(), maxAgeDays = 90, machine = "compactor" } = {}) {
  const cutoff = now - maxAgeDays * 86400000;
  const all = ordered(events);
  const old = all.filter((e) => e.ts < cutoff);
  const recent = all.filter((e) => e.ts >= cutoff);
  if (old.length === 0) return all;

  const state = materialize(old);
  const snapshot = makeEvent({
    op: "snapshot",
    machine,
    ts: cutoff,
    facts: [...state.facts.values()],
  });

  const tombstones = old.filter((e) => e.op === "remove" || e.op === "reject");
  return ordered([snapshot, ...tombstones, ...recent]);
}
