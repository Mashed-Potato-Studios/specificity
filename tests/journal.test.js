// Tests for the append-only journal, materialization and merge.
// Spec: docs/SPEC-V2.md — "Merge model".
import assert from "assert";
import {
  factHash,
  makeEvent,
  mergeJournals,
  materialize,
  renderProfile,
  parseProfile,
  reconcile,
  compact,
  SECTION_BUDGET,
} from "../src/lib/journal.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

const LAPTOP = "m-laptop";
const DESKTOP = "m-desktop";

function add(text, section, machine, ts) {
  return makeEvent({ op: "add", section, text, machine, ts, origin: "stated" });
}
function remove(text, machine, ts) {
  return makeEvent({ op: "remove", text, machine, ts });
}
function facts(events, section) {
  const m = materialize(events);
  return (m.sections.get(section) || []).map((f) => f.text);
}

console.log("\njournal: events");

test("an event has a stable id and required fields", () => {
  const e = add("terse for approvals", "Communication Style", LAPTOP, 1);
  assert.ok(e.id);
  assert.strictEqual(e.op, "add");
  assert.strictEqual(e.machine, LAPTOP);
  assert.strictEqual(e.factHash, factHash("terse for approvals"));
});

test("ids are unique per event", () => {
  const a = add("x", "S", LAPTOP, 1);
  const b = add("x", "S", LAPTOP, 1);
  assert.notStrictEqual(a.id, b.id);
});

test("a tombstone carries the hash but never the text", () => {
  const e = remove("something private about me", LAPTOP, 5);
  assert.strictEqual(e.factHash, factHash("something private about me"));
  assert.strictEqual(e.text, undefined);
  assert.ok(!JSON.stringify(e).includes("private"));
});

test("a rejection carries the hash but never the text", () => {
  const e = makeEvent({ op: "reject", text: "starts work at dawn", machine: LAPTOP, ts: 4 });
  assert.strictEqual(e.factHash, factHash("starts work at dawn"));
  assert.strictEqual(e.text, undefined);
  assert.ok(!JSON.stringify(e).includes("dawn"));
});

test("rejects an unknown op", () => {
  assert.throws(() => makeEvent({ op: "frobnicate", machine: LAPTOP }), /op/i);
});

console.log("\njournal: materialization");

test("an add makes a fact live", () => {
  assert.deepStrictEqual(facts([add("wakes early", "Rhythm", LAPTOP, 1)], "Rhythm"), [
    "wakes early",
  ]);
});

test("a remove suppresses it", () => {
  const events = [add("wakes early", "Rhythm", LAPTOP, 1), remove("wakes early", LAPTOP, 2)];
  assert.deepStrictEqual(facts(events, "Rhythm"), []);
});

test("a later add revives a removed fact", () => {
  const events = [
    add("wakes early", "Rhythm", LAPTOP, 1),
    remove("wakes early", LAPTOP, 2),
    add("wakes early", "Rhythm", LAPTOP, 3),
  ];
  assert.deepStrictEqual(facts(events, "Rhythm"), ["wakes early"]);
});

test("an amend replaces the text", () => {
  const events = [
    add("very terse", "Communication Style", LAPTOP, 1),
    makeEvent({
      op: "amend",
      section: "Communication Style",
      factHash: factHash("very terse"),
      text: "terse for approvals, fuller when defining work",
      machine: LAPTOP,
      ts: 2,
    }),
  ];
  assert.deepStrictEqual(facts(events, "Communication Style"), [
    "terse for approvals, fuller when defining work",
  ]);
});

test("confirm updates last-seen without duplicating the fact", () => {
  const events = [
    add("wakes early", "Rhythm", LAPTOP, 1),
    makeEvent({ op: "confirm", factHash: factHash("wakes early"), machine: LAPTOP, ts: 9 }),
  ];
  const m = materialize(events);
  assert.strictEqual(m.sections.get("Rhythm").length, 1);
  assert.strictEqual(m.sections.get("Rhythm")[0].lastSeenAt, 9);
});

test("provenance records origin and dates", () => {
  const m = materialize([add("wakes early", "Rhythm", LAPTOP, 1)]);
  const fact = m.sections.get("Rhythm")[0];
  assert.strictEqual(fact.origin, "stated");
  assert.strictEqual(fact.confirmedAt, 1);
});

test("a rejected candidate class is retrievable and is not a profile fact", () => {
  const events = [makeEvent({ op: "reject", text: "starts work at dawn", machine: LAPTOP, ts: 4 })];
  const m = materialize(events);
  assert.strictEqual(m.sections.size, 0);
  assert.ok(m.rejected.has(factHash("starts work at dawn")));
});

console.log("\njournal: merge");

test("union is order-independent", () => {
  const a = [add("from laptop", "Rhythm", LAPTOP, 1)];
  const b = [add("from desktop", "Rhythm", DESKTOP, 2)];
  assert.deepStrictEqual(
    facts(mergeJournals(a, b), "Rhythm").sort(),
    facts(mergeJournals(b, a), "Rhythm").sort()
  );
});

test("both machines keep what they learned", () => {
  const a = [add("from laptop", "Rhythm", LAPTOP, 1)];
  const b = [add("from desktop", "Rhythm", DESKTOP, 2)];
  assert.deepStrictEqual(facts(mergeJournals(a, b), "Rhythm").sort(), [
    "from desktop",
    "from laptop",
  ]);
});

test("merge is idempotent", () => {
  const a = [add("x", "S", LAPTOP, 1), add("y", "S", DESKTOP, 2)];
  assert.strictEqual(mergeJournals(a, a).length, 2);
  assert.strictEqual(mergeJournals(a, a, a).length, 2);
});

test("a stale machine cannot resurrect a deleted fact", () => {
  // Laptop added at t=1 and still holds it. Desktop deleted at t=5.
  const stale = [add("old habit", "Rhythm", LAPTOP, 1)];
  const current = [add("old habit", "Rhythm", LAPTOP, 1), remove("old habit", DESKTOP, 5)];
  assert.deepStrictEqual(facts(mergeJournals(stale, current), "Rhythm"), []);
});

test("ordering is deterministic when timestamps tie", () => {
  const a = [add("x", "S", DESKTOP, 7)];
  const b = [remove("x", LAPTOP, 7)];
  assert.deepStrictEqual(facts(mergeJournals(a, b), "S"), facts(mergeJournals(b, a), "S"));
});

console.log("\njournal: markdown round trip");

const MD = `<!-- specificity-profile-version: 1 -->
# Specificity Profile — test

## Rhythm & Context
- often starts work between 6-7am

## Anti-patterns
- asking several questions at once
- explaining things they already know
`;

test("parses sections and facts", () => {
  const parsed = parseProfile(MD);
  assert.deepStrictEqual(parsed.get("Rhythm & Context"), ["often starts work between 6-7am"]);
  assert.strictEqual(parsed.get("Anti-patterns").length, 2);
});

test("renders only sections that have content", () => {
  const events = [add("often starts work between 6-7am", "Rhythm & Context", LAPTOP, 1)];
  const out = renderProfile(materialize(events));
  assert.ok(out.includes("## Rhythm & Context"));
  assert.ok(!out.includes("## Anti-patterns"));
});

test("render then parse preserves facts", () => {
  const events = [
    add("often starts work between 6-7am", "Rhythm & Context", LAPTOP, 1),
    add("asking several questions at once", "Anti-patterns", LAPTOP, 2),
  ];
  const parsed = parseProfile(renderProfile(materialize(events)));
  assert.deepStrictEqual(parsed.get("Rhythm & Context"), ["often starts work between 6-7am"]);
  assert.deepStrictEqual(parsed.get("Anti-patterns"), ["asking several questions at once"]);
});

console.log("\njournal: hand-edit reconciliation");

const SNAPSHOT = "## Rhythm\n- wakes early\n";

test("a hand-added line becomes a stated event", () => {
  const edited = "## Rhythm\n- wakes early\n- prefers mornings for hard problems\n";
  const produced = reconcile({ markdown: edited, snapshot: SNAPSHOT, machine: LAPTOP, ts: 10 });
  assert.strictEqual(produced.length, 1);
  assert.strictEqual(produced[0].op, "add");
  assert.strictEqual(produced[0].origin, "stated");
  assert.strictEqual(produced[0].text, "prefers mornings for hard problems");
});

test("a hand-deleted line becomes a tombstone", () => {
  const produced = reconcile({ markdown: "## Rhythm\n", snapshot: SNAPSHOT, machine: LAPTOP, ts: 10 });
  assert.strictEqual(produced.length, 1);
  assert.strictEqual(produced[0].op, "remove");
  assert.strictEqual(produced[0].text, undefined);
});

test("the local file wins: reconciled edits survive materialization", () => {
  const events = [add("wakes early", "Rhythm", LAPTOP, 1)];
  const edited = "## Rhythm\n- prefers mornings\n";
  const merged = mergeJournals(
    events,
    reconcile({ markdown: edited, snapshot: SNAPSHOT, machine: LAPTOP, ts: 10 })
  );
  assert.deepStrictEqual(facts(merged, "Rhythm"), ["prefers mornings"]);
});

test("no edit produces no events", () => {
  const events = [add("wakes early", "Rhythm", LAPTOP, 1)];
  const out = renderProfile(materialize(events));
  assert.deepStrictEqual(reconcile({ markdown: out, snapshot: out, machine: LAPTOP, ts: 10 }), []);
});

test("a fact learned since the last write is not mistaken for a deletion", () => {
  // The journal knows something the file hasn't been rewritten with yet.
  const stale = "## Rhythm\n- wakes early\n";
  const produced = reconcile({ markdown: stale, snapshot: stale, machine: LAPTOP, ts: 10 });
  assert.deepStrictEqual(produced, []);
});

console.log("\njournal: compaction");

const DAY = 86400000;

test("old events fold into a snapshot", () => {
  const now = 400 * DAY;
  const events = [
    add("ancient fact", "Rhythm", LAPTOP, 1 * DAY),
    add("recent fact", "Rhythm", LAPTOP, now - 1 * DAY),
  ];
  const out = compact(events, { now, maxAgeDays: 90 });
  assert.ok(out.length < events.length + 1);
  assert.ok(out.some((e) => e.op === "snapshot"));
  assert.deepStrictEqual(facts(out, "Rhythm").sort(), ["ancient fact", "recent fact"]);
});

test("tombstones are retained forever", () => {
  const now = 400 * DAY;
  const events = [
    add("forgotten", "Rhythm", LAPTOP, 1 * DAY),
    remove("forgotten", LAPTOP, 2 * DAY),
  ];
  const out = compact(events, { now, maxAgeDays: 90 });
  assert.ok(out.some((e) => e.op === "remove" && e.factHash === factHash("forgotten")));
});

test("a stale machine still cannot resurrect after compaction", () => {
  const now = 400 * DAY;
  const compacted = compact(
    [add("forgotten", "Rhythm", LAPTOP, 1 * DAY), remove("forgotten", DESKTOP, 2 * DAY)],
    { now, maxAgeDays: 90 }
  );
  const stale = [add("forgotten", "Rhythm", LAPTOP, 1 * DAY)];
  assert.deepStrictEqual(facts(mergeJournals(compacted, stale), "Rhythm"), []);
});

test("compaction does not change what is live", () => {
  const now = 400 * DAY;
  const events = [
    add("a", "S", LAPTOP, 1 * DAY),
    add("b", "S", LAPTOP, 2 * DAY),
    remove("a", LAPTOP, 3 * DAY),
    add("c", "S", DESKTOP, now - DAY),
  ];
  assert.deepStrictEqual(
    facts(compact(events, { now, maxAgeDays: 90 }), "S").sort(),
    facts(events, "S").sort()
  );
});

console.log("\njournal: regressions");

test("a snapshot never clobbers an event that arrives after compaction", () => {
  // A snapshot is stamped at the cutoff, which is later than the events it
  // folded. An older tombstone arriving afterwards must still win.
  const now = 400 * DAY;
  const compacted = compact([add("wakes early", "Rhythm", LAPTOP, 1 * DAY)], {
    now,
    maxAgeDays: 90,
  });
  const late = [remove("wakes early", DESKTOP, 2 * DAY)];
  assert.deepStrictEqual(facts(mergeJournals(compacted, late), "Rhythm"), []);
});

test("compaction preserves provenance dates", () => {
  const now = 400 * DAY;
  const out = compact([add("wakes early", "Rhythm", LAPTOP, 5 * DAY)], { now, maxAgeDays: 90 });
  const fact = materialize(out).sections.get("Rhythm")[0];
  assert.strictEqual(fact.confirmedAt, 5 * DAY);
  assert.strictEqual(fact.origin, "stated");
});

test("compaction remembers which sections it manages", () => {
  const now = 400 * DAY;
  const out = compact(
    [add("wakes early", "Rhythm", LAPTOP, 1 * DAY), remove("wakes early", LAPTOP, 2 * DAY)],
    { now, maxAgeDays: 90 }
  );
  assert.ok(materialize(out).knownSections.has("Rhythm"));
});

test("an event with no declared origin is not promoted to confirmed", () => {
  const bare = makeEvent({ op: "add", section: "S", text: "x", machine: LAPTOP, ts: 1 });
  assert.strictEqual(materialize([bare]).sections.get("S")[0].origin, "unconfirmed");
});

console.log("\njournal: rendering preserves what it doesn't own");

test("an unknown section is preserved untouched", () => {
  const state = materialize([add("wakes early", "Rhythm", LAPTOP, 1)]);
  const existing = "## Rhythm\n- wakes early\n\n## Someone Else's Section\n- their fact\n";
  const out = renderProfile(state, { existing });
  assert.match(out, /## Someone Else's Section/);
  assert.match(out, /- their fact/);
});

test("prose and comments inside a managed section survive", () => {
  const state = materialize([add("wakes early", "Rhythm", LAPTOP, 1)]);
  const existing = "## Rhythm\n<!-- a note to myself -->\n- wakes early\nfree prose line\n";
  const out = renderProfile(state, { existing });
  assert.match(out, /<!-- a note to myself -->/);
  assert.match(out, /free prose line/);
});

test("an emptied managed section drops its stale bullets", () => {
  const state = materialize([
    add("wakes early", "Rhythm", LAPTOP, 1),
    remove("wakes early", LAPTOP, 2),
  ]);
  const out = renderProfile(state, { existing: "## Rhythm\n- wakes early\n" });
  assert.ok(!out.includes("wakes early"));
});

test("a section over budget renders only its most recent facts", () => {
  const events = [];
  for (let i = 0; i < 20; i++) events.push(add(`fact number ${i}`, "Phrase Map", LAPTOP, i));
  const out = renderProfile(materialize(events));
  const bullets = out.split("\n").filter((l) => l.startsWith("- "));
  assert.strictEqual(bullets.length, SECTION_BUDGET);
  assert.ok(out.includes("fact number 19"), "newest should survive the budget");
  assert.ok(!out.includes("fact number 0"), "oldest should be trimmed");
});

test("the budget trims the rendering, never the journal", () => {
  const events = [];
  for (let i = 0; i < 20; i++) events.push(add(`fact number ${i}`, "Phrase Map", LAPTOP, i));
  assert.strictEqual(materialize(events).sections.get("Phrase Map").length, 20);
});

test("the profile name is carried through", () => {
  const state = materialize([add("wakes early", "Rhythm", LAPTOP, 1)]);
  const out = renderProfile(state, { existing: "# Specificity Profile — vantol\n## Rhythm\n" });
  assert.match(out, /# Specificity Profile — vantol/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
