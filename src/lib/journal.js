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
export function makeEvent({
  op,
  section,
  sections,
  text,
  factHash: hash,
  machine,
  ts,
  origin,
  evidence,
  facts,
}) {
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
  if (op === "snapshot") {
    event.facts = facts || [];
    if (sections) event.sections = [...sections];
  }

  // Tombstones, confirmations and rejections never carry text. A rejection is
  // "never say this about me again" — storing the wording would leave the
  // suppressed claim sitting in a synced journal forever, which is the same
  // mistake the tombstone rule exists to prevent.
  if (text !== undefined && !["remove", "confirm", "reject"].includes(op)) event.text = text;

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
  // Every section the journal has ever touched. A section that is managed but
  // currently empty must render as empty — otherwise a rendered file that
  // still holds the old bullets would resurrect facts the journal deleted.
  const knownSections = new Set();

  const applyAdd = (hash, source) => {
    // A snapshot replays facts that already carry their dates; a plain event
    // carries only its own ts. Reading just `ts` blanks provenance on every
    // compaction.
    const seenAt = source.ts ?? source.lastSeenAt ?? source.confirmedAt;
    const existing = live.get(hash);
    if (existing) {
      existing.lastSeenAt = seenAt;
      if (source.section) existing.section = source.section;
      return;
    }
    live.set(hash, {
      factHash: hash,
      section: source.section || "Uncategorized",
      text: source.text,
      // Default to the untrusted value. The write trust boundary says agent
      // inference may never author facts, so an event that forgot to declare
      // its origin must not be promoted to confirmed.
      origin: source.origin || "unconfirmed",
      confirmedAt: source.confirmedAt ?? seenAt,
      lastSeenAt: seenAt,
    });
  };

  // Snapshots are a base layer, not a point in the timeline. A snapshot is
  // stamped at the compaction cutoff, which is *later* than the events it
  // folded — so applying it in timestamp order would let it clobber an older
  // event that arrives after compaction, resurrecting deleted facts. Lay the
  // snapshots down first, then replay everything else over them. Tombstones
  // are retained forever precisely so they still win this replay.
  const all = ordered(events);
  const sequence = [...all.filter((e) => e.op === "snapshot"), ...all.filter((e) => e.op !== "snapshot")];

  for (const event of sequence) {
    if (event.section) knownSections.add(event.section);
    switch (event.op) {
      case "snapshot":
        // Sections the folded-away events knew about, so a compacted journal
        // still recognises a section it manages but has since emptied.
        for (const section of event.sections || []) knownSections.add(section);
        for (const fact of event.facts || []) {
          if (fact.section) knownSections.add(fact.section);
          applyAdd(fact.factHash, fact);
        }
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

  return { sections, rejected, facts: live, knownSections };
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
/**
 * Soft cap per section. Twelve sections is already a real context cost; an
 * unbudgeted profile becomes a wall the agent skims, and every marginal fact
 * then costs the good ones attention. When a section is over budget the
 * least-recently-seen facts are dropped from the *rendering* only — the
 * journal still holds them, so nothing is lost and raising the cap restores
 * them.
 */
export const SECTION_BUDGET = 12;

function withinBudget(facts) {
  if (facts.length <= SECTION_BUDGET) return facts;
  return [...facts]
    .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
    .slice(0, SECTION_BUDGET);
}

export function renderProfile(state, { name = "", updated = null, existing = "" } = {}) {
  const prior = splitIntoBlocks(existing);
  const priorHeadings = new Set(prior.blocks.map((b) => b.heading));

  const managed = [...state.sections.keys()].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });

  const date = updated || new Date().toISOString().slice(0, 10);
  const title = name || prior.name;
  const out = [
    "<!-- specificity-profile-version: 1 -->",
    `# Specificity Profile${title ? ` — ${title}` : ""}`,
    `# Updated: ${date}`,
    "",
  ];

  const emitted = new Set();

  // Walk the existing file so its order, prose, sub-headings and comments
  // survive. The convention requires unknown sections and fields to be
  // preserved, and a hand-written note is the developer's own words.
  const known = state.knownSections || new Set(state.sections.keys());

  for (const block of prior.blocks) {
    const facts = state.sections.get(block.heading) || [];

    // A section the journal has never touched is somebody else's — an unknown
    // extension the convention requires us to preserve untouched.
    if (!known.has(block.heading)) {
      out.push(`## ${block.heading}`, ...block.lines, "");
      continue;
    }

    // A managed section renders its journal facts, plus any non-bullet content
    // the developer wrote around them. Stale bullets are dropped: the journal
    // decides which facts are live.
    const preserved = block.lines.filter((l) => !/^[-*]\s+/.test(l) && l.trim() !== "");
    if (facts.length === 0 && preserved.length === 0) {
      emitted.add(block.heading);
      continue;
    }
    out.push(`## ${block.heading}`);
    for (const fact of withinBudget(facts)) out.push(`- ${fact.text}`);
    out.push(...preserved, "");
    emitted.add(block.heading);
  }

  for (const section of managed) {
    if (emitted.has(section) || priorHeadings.has(section)) continue;
    const facts = state.sections.get(section);
    if (!facts || facts.length === 0) continue;
    out.push(`## ${section}`);
    for (const fact of withinBudget(facts)) out.push(`- ${fact.text}`);
    out.push("");
  }

  return out.join("\n");
}

/** Split a profile into its `## ` blocks, keeping every raw line. */
function splitIntoBlocks(markdown) {
  const blocks = [];
  let name = "";
  let current = null;

  for (const line of String(markdown).split("\n")) {
    const title = line.match(/^#\s+Specificity Profile\s*(?:—|--)\s*(.+?)\s*$/);
    if (title) {
      name = title[1];
      continue;
    }
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  // Drop trailing blank lines inside each block; spacing is re-applied on render.
  for (const block of blocks) {
    while (block.lines.length && block.lines[block.lines.length - 1].trim() === "") {
      block.lines.pop();
    }
  }

  return { blocks, name };
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
    sections: state.knownSections,
  });

  const tombstones = old.filter((e) => e.op === "remove" || e.op === "reject");
  return ordered([snapshot, ...tombstones, ...recent]);
}
