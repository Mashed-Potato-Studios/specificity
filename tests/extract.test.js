// Deterministic extraction over vetted turns.
// Spec: docs/SPEC-V2.md — "Extraction".
import assert from "assert";
import {
  extract,
  rhythm,
  terseness,
  repeatedPhrases,
  projectSpread,
  cleanTurns,
  stripPasted,
  hasPastedBlock,
  MIN_OCCURRENCES,
} from "../src/lib/extract.js";

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

/** A turn at a given local hour, so rhythm tests don't depend on the runner's TZ. */
function at(hour, text, { session = "s1", day = 20, cwd = "/Users/dev/alpha" } = {}) {
  const date = new Date(2026, 6, day, hour, 30, 0);
  return { text, voice: text, ts: date.getTime(), session, cwd, host: "claude-code" };
}

console.log("\nextract: pasted material is not voice");

test("strips fenced code", () => {
  assert.strictEqual(stripPasted("look at this ```const x = 1;``` and fix"), "look at this and fix");
});

test("strips a stack trace line", () => {
  const text = "it throws\n    at Module._compile (node:internal/modules:1:1)\nwhy?";
  assert.ok(!stripPasted(text).includes("Module._compile"));
});

test("detects a pasted block", () => {
  assert.strictEqual(hasPastedBlock("here:\n```\ncode\n```"), true);
  assert.strictEqual(hasPastedBlock("just a normal sentence"), false);
});

console.log("\nextract: redaction runs before anything is kept");

test("a turn containing a credential never reaches extraction", () => {
  const { turns } = cleanTurns([
    { text: "token ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", ts: 1, session: "s1" },
    { text: "just push it", ts: 2, session: "s1" },
  ]);
  assert.deepStrictEqual(turns.map((t) => t.text), ["just push it"]);
});

test("a home path is normalized rather than dropped", () => {
  const { turns } = cleanTurns([{ text: "check /Users/bob/app now", ts: 1, session: "s1" }]);
  assert.strictEqual(turns.length, 1);
  assert.ok(!turns[0].text.includes("bob"));
});

console.log("\nextract: rhythm");

test("finds a pronounced working window", () => {
  const turns = [];
  for (let i = 0; i < 12; i++) turns.push(at(6, `morning work ${i}`, { session: `s${i % 4}` }));
  for (let i = 0; i < 4; i++) turns.push(at(15, `afternoon ${i}`, { session: "s9" }));
  const candidate = rhythm(turns);
  assert.ok(candidate, "expected a rhythm candidate");
  assert.match(candidate.text, /between 6am and 8am/);
  assert.strictEqual(candidate.section, "Rhythm & Context");
});

test("stays silent when work is spread evenly", () => {
  const turns = [];
  for (let hour = 0; hour < 24; hour++) turns.push(at(hour, `t${hour}`));
  assert.strictEqual(rhythm(turns), null);
});

test("stays silent on too little data", () => {
  assert.strictEqual(rhythm([at(6, "a"), at(6, "b")]), null);
});

console.log("\nextract: terseness");

test("reports the bimodal pattern, not an average", () => {
  const turns = [];
  for (let i = 0; i < 6; i++) turns.push(at(9, "approve", { session: `s${i}` }));
  for (let i = 0; i < 8; i++) {
    turns.push(at(10, `I want you to look at the failing test and work out why it is breaking now ${i}`, { session: `s${i}` }));
  }
  const candidate = terseness(turns);
  assert.ok(candidate, "expected a terseness candidate");
  assert.match(candidate.text, /Terse for approvals/);
  assert.match(candidate.evidence[0], /median/);
});

test("stays silent when every turn is short", () => {
  const turns = [];
  for (let i = 0; i < 12; i++) turns.push(at(9, "ok", { session: `s${i}` }));
  assert.strictEqual(terseness(turns), null);
});

console.log("\nextract: repeated phrases");

test("surfaces a phrase that recurs across sessions", () => {
  const turns = [
    at(9, "Continue to next", { session: "s1" }),
    at(9, "continue to next", { session: "s2" }),
    at(9, "Continue to next", { session: "s3" }),
  ];
  const [candidate] = repeatedPhrases(turns);
  assert.ok(candidate);
  assert.strictEqual(candidate.section, "Request Patterns");
  assert.strictEqual(candidate.occurrences, 3);
  assert.strictEqual(candidate.needsInterpretation, true);
});

test("makes no claim about meaning", () => {
  const turns = ["s1", "s2", "s3"].map((s) => at(9, "merge now", { session: s }));
  const [candidate] = repeatedPhrases(turns);
  // The pass counts; the agent interprets. The text must not assert intent.
  assert.match(candidate.text, /recurs as a standalone request/);
  assert.ok(!/means/.test(candidate.text));
});

test("respects the precision bar: too few occurrences", () => {
  const turns = ["s1", "s2"].map((s) => at(9, "push it", { session: s }));
  assert.deepStrictEqual(repeatedPhrases(turns), []);
});

test("respects the precision bar: all in one session", () => {
  const turns = [1, 2, 3, 4].map(() => at(9, "push it", { session: "s1" }));
  assert.deepStrictEqual(repeatedPhrases(turns), []);
});

test("ignores long turns", () => {
  const turns = ["s1", "s2", "s3"].map((s) =>
    at(9, "this is a much longer request that goes well beyond the short threshold", { session: s })
  );
  assert.deepStrictEqual(repeatedPhrases(turns), []);
});

console.log("\nextract: project spread");

test("ranks the projects actually worked in", () => {
  const turns = [
    ...Array.from({ length: 6 }, (_, i) => at(9, `a${i}`, { cwd: "/Users/dev/alpha", session: "s1" })),
    ...Array.from({ length: 3 }, (_, i) => at(9, `b${i}`, { cwd: "/Users/dev/beta", session: "s2" })),
  ];
  const candidate = projectSpread(turns);
  assert.ok(candidate);
  assert.match(candidate.text, /alpha/);
  assert.match(candidate.text, /beta/);
});

test("a project directory that looks sensitive is left out", () => {
  const turns = [
    ...Array.from({ length: 6 }, (_, i) => at(9, `a${i}`, { cwd: "/Users/dev/alpha", session: "s1" })),
    ...Array.from({ length: 4 }, (_, i) => at(9, `c${i}`, { cwd: "/Users/dev/gamma", session: "s3" })),
    ...Array.from({ length: 6 }, (_, i) =>
      at(9, `b${i}`, { cwd: "/Users/dev/someone@example.com", session: "s2" })
    ),
  ];
  const candidate = projectSpread(turns);
  assert.ok(candidate, "the clean projects should still produce a candidate");
  assert.match(candidate.text, /alpha/);
  assert.ok(!candidate.text.includes("example.com"), "an email-shaped directory leaked");
  assert.ok(!JSON.stringify(candidate.evidence).includes("example.com"));
});

test("stays silent with a single project", () => {
  const turns = [at(9, "x"), at(9, "y")];
  assert.strictEqual(projectSpread(turns), null);
});

console.log("\nextract: end to end");

test("produces candidates that all clear the bar", () => {
  const turns = [];
  for (let i = 0; i < 12; i++) turns.push(at(6, "approve", { session: `s${i}`, cwd: "/Users/dev/alpha" }));
  for (let i = 0; i < 8; i++) {
    turns.push(at(7, `please look into the failing integration test and explain what broke ${i}`, {
      session: `s${i}`,
      cwd: "/Users/dev/beta",
    }));
  }
  const { candidates } = extract(turns);
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.ok(candidate.occurrences >= MIN_OCCURRENCES, `${candidate.kind} below the bar`);
    assert.ok(candidate.section, `${candidate.kind} has no target section`);
    assert.ok(candidate.evidence.length > 0, `${candidate.kind} has no evidence`);
  }
});

test("evidence never carries a secret", () => {
  const turns = [];
  for (let i = 0; i < 12; i++) {
    turns.push(at(6, "sk-abcdefghijklmnopqrstuvwxyz123456", { session: `s${i}` }));
  }
  const { candidates } = extract(turns);
  assert.ok(!JSON.stringify(candidates).includes("sk-abcdefghijklmnop"));
});

test("the session bar applies to the statistical extractors too", () => {
  // A single long session can produce plenty of occurrences. Without the
  // sessions half of the bar, rhythm and terseness would propose from it.
  const turns = [];
  for (let i = 0; i < 20; i++) turns.push(at(6, `approve ${i}`, { session: "only-one" }));
  for (let i = 0; i < 10; i++) {
    turns.push(at(7, `please look at the failing integration test and explain what broke ${i}`, { session: "only-one" }));
  }
  const { candidates } = extract(turns);
  assert.deepStrictEqual(candidates, [], "one session must not clear the bar");
});

test("two sessions do clear it", () => {
  const turns = [];
  for (let i = 0; i < 20; i++) turns.push(at(6, `approve ${i}`, { session: `s${i % 2}` }));
  for (let i = 0; i < 10; i++) {
    turns.push(at(7, `please look at the failing integration test and explain what broke ${i}`, { session: `s${i % 2}` }));
  }
  assert.ok(extract(turns).candidates.length > 0);
});

test("an empty corpus yields nothing and does not throw", () => {
  const { candidates } = extract([]);
  assert.deepStrictEqual(candidates, []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
