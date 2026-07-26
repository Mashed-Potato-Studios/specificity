// The confirmation state machine — the loop that turns candidates into facts.
// Spec: docs/SPEC-V2.md — "Confirmation".
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import {
  recordCandidates,
  loadCandidates,
  dueProposals,
  accept,
  decline,
  never,
  keepMine,
  markContradictions,
  renderBatch,
  isDue,
  BATCH_LIMIT,
  WELCOME_BATCH_LIMIT,
  COOLDOWN_MS,
} from "../src/lib/proposals.js";
import { readJournal } from "../src/lib/sync.js";
import { materialize, makeEvent } from "../src/lib/journal.js";

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

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "specificity-proposals-"));

function candidate(overrides = {}) {
  return {
    kind: "rhythm",
    section: "Rhythm & Context",
    text: "Often starts work between 6am and 8am",
    evidence: ["19 of 60 prompts, 4 sessions"],
    occurrences: 19,
    sessions: 4,
    ...overrides,
  };
}

const only = (dir) => loadCandidates(dir)[0];

console.log("\nproposals: the store");

test("records a candidate", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  const stored = only(dir);
  assert.strictEqual(stored.text, "Often starts work between 6am and 8am");
  assert.strictEqual(stored.status, "candidate");
});

test("re-recording updates rather than duplicates", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  recordCandidates([candidate({ occurrences: 25 })], { dir, now: 2000 });
  assert.strictEqual(loadCandidates(dir).length, 1);
  assert.strictEqual(only(dir).occurrences, 25);
});

test("first-seen survives an update", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  recordCandidates([candidate({ occurrences: 30 })], { dir, now: 5000 });
  assert.strictEqual(only(dir).firstSeen, 1000);
});

console.log("\nproposals: nothing is written without an answer");

test("recording a candidate writes no profile fact", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  assert.deepStrictEqual(readJournal(dir), []);
});

test("showing a batch writes no profile fact", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  dueProposals({ dir, now: 2000 });
  assert.deepStrictEqual(readJournal(dir), []);
});

console.log("\nproposals: answers");

test("accept writes the fact as a confirmed observation", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  accept(only(dir), { dir, now: 2000 });

  const facts = materialize(readJournal(dir)).sections.get("Rhythm & Context");
  assert.strictEqual(facts.length, 1);
  assert.strictEqual(facts[0].origin, "confirmed-observation");
  assert.strictEqual(only(dir).status, "confirmed");
});

test("an edited answer is stored as the developer's own words", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  accept(only(dir), { dir, now: 2000, text: "early riser, most days" });

  const facts = materialize(readJournal(dir)).sections.get("Rhythm & Context");
  assert.strictEqual(facts[0].text, "early riser, most days");
  assert.strictEqual(facts[0].origin, "stated", "their wording outranks ours");
});

test("a confirmed candidate is not shown again", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  accept(only(dir), { dir, now: 2000 });
  assert.deepStrictEqual(dueProposals({ dir, now: 3000 }).proposals, []);
});

test("decline keeps the candidate but withholds it", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  decline(only(dir), { dir, now: 2000 });
  assert.strictEqual(isDue(only(dir)), false);
  assert.deepStrictEqual(readJournal(dir), [], "declining writes no fact");
});

test("a declined candidate returns only once evidence doubles", () => {
  const dir = tmp();
  recordCandidates([candidate({ occurrences: 10 })], { dir, now: 1000 });
  decline(only(dir), { dir, now: 2000 });

  recordCandidates([candidate({ occurrences: 15 })], { dir, now: 3000 });
  assert.strictEqual(isDue(only(dir)), false, "15 is not yet double 10");

  recordCandidates([candidate({ occurrences: 20 })], { dir, now: 4000 });
  assert.strictEqual(isDue(only(dir)), true, "20 is double 10");
});

test("never suppresses the class permanently", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  never(only(dir), { dir, now: 2000 });

  recordCandidates([candidate({ occurrences: 999 })], { dir, now: 3000 });
  assert.strictEqual(only(dir).status, "rejected");
  assert.deepStrictEqual(dueProposals({ dir, now: 4000 }).proposals, []);
});

test("a rejection is recorded as data, not a deletion", () => {
  const dir = tmp();
  recordCandidates([candidate()], { dir, now: 1000 });
  never(only(dir), { dir, now: 2000 });
  assert.ok(materialize(readJournal(dir)).rejected.size > 0);
});

console.log("\nproposals: contradictions");

const stated = () =>
  materialize([
    makeEvent({
      op: "add",
      section: "Communication Style",
      text: "Very terse",
      origin: "stated",
      machine: "m1",
      ts: 500,
    }),
  ]);

test("an observation overlapping a stated fact is marked", () => {
  const [marked] = markContradictions(
    [candidate({ section: "Communication Style", text: "Terse for approvals, fuller when defining work", kind: "terseness" })],
    stated()
  );
  assert.ok(marked.contradicts, "expected a contradiction to be detected");
  assert.strictEqual(marked.contradicts.text, "Very terse");
});

test("an unrelated observation is not marked", () => {
  const [marked] = markContradictions([candidate()], stated());
  assert.strictEqual(marked.contradicts, undefined);
});

test("a contradiction needs double the evidence before it is shown", () => {
  const dir = tmp();
  const contradicting = candidate({
    kind: "terseness",
    section: "Communication Style",
    text: "Terse for approvals only",
    occurrences: 4,
    contradicts: { factHash: "abc", text: "Very terse" },
  });
  recordCandidates([contradicting], { dir, now: 1000 });
  assert.strictEqual(isDue(only(dir)), false, "4 is below the doubled bar");

  recordCandidates([{ ...contradicting, occurrences: 8 }], { dir, now: 2000 });
  assert.strictEqual(isDue(only(dir)), true);
});

test("accepting a contradiction replaces the disputed fact", () => {
  const dir = tmp();
  const events = [
    makeEvent({ op: "add", section: "Communication Style", text: "Very terse", origin: "stated", machine: "m1", ts: 500 }),
  ];
  fs.writeFileSync(path.join(dir, "_journal.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

  recordCandidates(
    [candidate({
      kind: "terseness",
      section: "Communication Style",
      text: "Terse for approvals only",
      occurrences: 10,
      contradicts: { factHash: events[0].factHash, text: "Very terse" },
    })],
    { dir, now: 1000 }
  );
  accept(only(dir), { dir, now: 2000 });

  const facts = materialize(readJournal(dir)).sections.get("Communication Style").map((f) => f.text);
  assert.deepStrictEqual(facts, ["Terse for approvals only"]);
});

test("keep mine leaves the stated fact and records the tension", () => {
  const dir = tmp();
  const events = [
    makeEvent({ op: "add", section: "Communication Style", text: "Very terse", origin: "stated", machine: "m1", ts: 500 }),
  ];
  fs.writeFileSync(path.join(dir, "_journal.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

  recordCandidates(
    [candidate({
      kind: "terseness",
      section: "Communication Style",
      text: "Terse for approvals only",
      occurrences: 10,
      contradicts: { factHash: events[0].factHash, text: "Very terse" },
    })],
    { dir, now: 1000 }
  );
  keepMine(only(dir), { dir, now: 2000 });

  const facts = materialize(readJournal(dir)).sections.get("Communication Style").map((f) => f.text);
  assert.deepStrictEqual(facts, ["Very terse"], "the declared fact must stand");
  assert.ok(only(dir).tension, "the tension must be recorded, not discarded");
  assert.strictEqual(only(dir).tension.declared, "Very terse");
});

console.log("\nproposals: throttle");

const many = (n) =>
  Array.from({ length: n }, (_, i) =>
    candidate({ kind: `k${i}`, text: `observation number ${i}`, occurrences: 10 + i })
  );

test("the first batch is a larger welcome batch", () => {
  const dir = tmp();
  recordCandidates(many(20), { dir, now: 1000 });
  const { proposals, isFirstRun } = dueProposals({ dir, now: 2000 });
  assert.strictEqual(isFirstRun, true);
  assert.strictEqual(proposals.length, WELCOME_BATCH_LIMIT);
});

test("later batches are capped at three", () => {
  const dir = tmp();
  recordCandidates(many(20), { dir, now: 1000 });
  const { proposals } = dueProposals({ dir, now: 2000, lastBatchAt: 1000 - COOLDOWN_MS });
  assert.strictEqual(proposals.length, BATCH_LIMIT);
});

test("nothing is shown inside the cooldown", () => {
  const dir = tmp();
  recordCandidates(many(5), { dir, now: 1000 });
  const { proposals, reason } = dueProposals({ dir, now: 2000, lastBatchAt: 1500 });
  assert.deepStrictEqual(proposals, []);
  assert.strictEqual(reason, "throttled");
});

test("ordinary proposals come before contradictions", () => {
  const dir = tmp();
  recordCandidates(
    [
      candidate({ kind: "contradiction", text: "disputes something", occurrences: 50, contradicts: { factHash: "x", text: "old" } }),
      candidate({ kind: "plain", text: "an ordinary one", occurrences: 5 }),
    ],
    { dir, now: 1000 }
  );
  const { proposals } = dueProposals({ dir, now: 2000 });
  assert.strictEqual(proposals[0].text, "an ordinary one");
});

console.log("\nproposals: render");

test("renders claim, evidence and answers", () => {
  const out = renderBatch([
    { section: "Rhythm & Context", text: "Often starts work between 6am and 8am", evidence: ["19 of 60 prompts, 4 sessions"], occurrences: 19 },
  ]);
  assert.match(out, /Rhythm & Context/);
  assert.match(out, /19 of 60 prompts/);
  assert.match(out, /\[y\] add {2}\[n\] no {2}\[e\] edit {2}\[never\]/);
});

test("a contradiction renders differently and is marked", () => {
  const out = renderBatch([
    {
      section: "Communication Style",
      text: "Terse for approvals only",
      evidence: ["median 32.5 words"],
      occurrences: 10,
      contradicts: { text: "Very terse" },
    },
  ]);
  assert.match(out, /disputes a fact you stated/);
  assert.match(out, /You said: "Very terse"/);
  assert.match(out, /\[k\] keep mine/);
  assert.ok(!out.includes("[n] no"), "a contradiction is not a yes/no question");
});

test("an empty batch renders nothing", () => {
  assert.strictEqual(renderBatch([]), "");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
