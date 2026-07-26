// Redaction: the guarantee the encrypted store rests on.
// Spec: docs/SPEC-V2.md — "Redaction" / "Testing decisions".
//
// Fixture-driven, so a rule regression fails a test rather than leaking silently.
import assert from "assert";
import { scanTurn, summarize, looksLikeSecret, entropy } from "../src/lib/redact.js";

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

console.log("\nredact: credentials must never survive");

// Known-bad strings. Every one of these must drop the whole turn.
const MUST_DROP = {
  "openai key": "here is my key " + ["sk-", "abcdefghijklmnopqrstuvwxyz123456"].join("") + " use it",
  "anthropic key": "export ANTHROPIC_KEY=" + ["sk-", "ant-api03-AAAAAAAAAAAAAAAAAAAAAA"].join(""),
  "github token": "token " + ["ghp", "_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join(""),
  "github fine-grained pat": ["github", "_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ"].join(""),
  "aws key": ["AKIA", "IOSFODNN7EXAMPLE"].join("") + " is the id",
  "google api key": ["AIza", "SyA1234567890abcdefghijklmnopqrstuvw"].join(""),
  "slack token": ["xox", "b-123456789012-abcdefghijklmnopqrstuvwx"].join(""),
  "stripe key": ["sk", "_live_abcdefghijklmnop1234567890"].join(""),
  "npm token": ["npm", "_abcdefghijklmnopqrstuvwxyz0123456789"].join(""),
  "private key block": "-----BEGIN RSA PRIVATE KEY-----\nMIIEow==",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  "bearer token": "curl -H 'Authorization: Bearer abcdef1234567890ABCDEF7890xyz'",
  "connection string": "postgres://admin:hunter2xyz@db.example.com:5432/app",
  "assigned password": 'password = "correct-horse-battery"',
  "assigned api key": "api_key: 8f3a9c2b7e1d4a6f",
};

for (const [label, text] of Object.entries(MUST_DROP)) {
  test(`drops a turn containing a ${label}`, () => {
    const result = scanTurn(text);
    assert.strictEqual(result.action, "drop", `expected drop for ${label}`);
    assert.strictEqual(result.text, null, "dropped turns must carry no text");
  });
}

test("a dropped turn leaks nothing through findings", () => {
  const result = scanTurn("token " + ["ghp", "_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join(""));
  assert.ok(!JSON.stringify(result).includes(["ghp", "_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join("")));
});

test("an unknown high-entropy token is dropped as uncertain", () => {
  const result = scanTurn("use vT7xQ2mLp9RcW4zN8bY6kJ3h as the value");
  assert.strictEqual(result.action, "drop");
});

console.log("\nredact: ordinary developer prose survives");

const MUST_KEEP = [
  "Lets continue to the next",
  "can you check the spec on this and see if you can find it",
  "no just push",
  "I want you to look at the failing test in tests/journal.test.js and fix it",
  "the commit is 9f2c1ab4e7d8c6b5a4f3e2d1c0b9a8f7e6d5c4b3",
  "run npm test and tell me what breaks",
  "why is this returning undefined when the array is empty?",
];

for (const text of MUST_KEEP) {
  test(`keeps: "${text.slice(0, 42)}${text.length > 42 ? "…" : ""}"`, () => {
    assert.strictEqual(scanTurn(text).action, "keep");
  });
}

test("a git SHA is not mistaken for a secret", () => {
  assert.strictEqual(looksLikeSecret("9f2c1ab4e7d8c6b5a4f3e2d1c0b9a8f7e6d5c4b3"), false);
});

test("a long ordinary word is not mistaken for a secret", () => {
  assert.strictEqual(looksLikeSecret("internationalization"), false);
});

// Every one of these was an entropy false positive found in real history.
const REAL_FALSE_POSITIVES = [
  "@docs/superpowers/plans/2026-04-10-accountability-plan.md",
  "screenshots/var/folders/ml/4fcvpgf16nj3ffps71vzmt2h0000gn/T/pi-clipboard-eb5e52.png",
  "node:internal/modules/cjs/loader:1503",
  "monaco-emacs.js?v=c6945e21:4",
  "src/lib/specificity-mode-tracker.js",
];

for (const token of REAL_FALSE_POSITIVES) {
  test(`path-like token is not a secret: ${token.slice(0, 40)}…`, () => {
    assert.strictEqual(looksLikeSecret(token), false);
  });
}

test("a real high-entropy secret is still caught despite a slash", () => {
  assert.strictEqual(looksLikeSecret("aB3/dEf9xY2kLm8QrT5vWz1nPc7"), true);
});

console.log("\nredact: identity is normalized, not dropped");

test("a home path is normalized and the turn is kept", () => {
  const result = scanTurn("look at /Users/vantolbennett/Developer/2026/specificity please");
  assert.strictEqual(result.action, "keep");
  assert.ok(!result.text.includes("vantolbennett"));
  assert.match(result.text, /~\/Developer\/2026\/specificity/);
});

test("a linux home path is normalized", () => {
  assert.match(scanTurn("cd /home/alice/src").text, /~\/src/);
});

test("an email is removed but the turn survives", () => {
  const result = scanTurn("mail me at someone@example.com about it");
  assert.strictEqual(result.action, "keep");
  assert.ok(!result.text.includes("someone@example.com"));
});

test("identity findings name the rule, never the value", () => {
  const result = scanTurn("look at /Users/vantolbennett/x");
  assert.deepStrictEqual(result.findings, [{ rule: "home-path", tier: "identity" }]);
});

test("normalization is lossless for phrasing", () => {
  // The words around the path are what phrasing analysis reads.
  const result = scanTurn("please check /Users/bob/thing and tell me why it fails");
  assert.match(result.text, /^please check .* and tell me why it fails$/);
});

console.log("\nredact: reporting");

test("summary counts without carrying content", () => {
  const results = [
    scanTurn(["ghp", "_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join("")),
    scanTurn("look at /Users/bob/x"),
    scanTurn("just push it"),
  ];
  const summary = summarize(results);
  assert.strictEqual(summary.scanned, 3);
  assert.strictEqual(summary.dropped, 1);
  assert.strictEqual(summary.normalized, 1);
  assert.strictEqual(summary.byRule["home-path"], 1);
  assert.ok(!JSON.stringify(summary).includes("ghp_"));
  assert.ok(!JSON.stringify(summary).includes("bob"));
});

console.log("\nredact: edges");

test("empty and non-string input is safe", () => {
  assert.strictEqual(scanTurn("").action, "keep");
  assert.strictEqual(scanTurn(null).action, "keep");
  assert.strictEqual(scanTurn(undefined).action, "keep");
});

test("entropy of a uniform string is zero", () => {
  assert.strictEqual(entropy("aaaaaaaa"), 0);
});

test("repeated scans give the same answer", () => {
  // Guards against a stateful regex lastIndex bug across calls.
  const text = "look at /Users/bob/x and /Users/bob/y";
  const first = scanTurn(text);
  for (let i = 0; i < 5; i++) {
    assert.deepStrictEqual(scanTurn(text), first);
  }
});

test("every occurrence is normalized, not just the first", () => {
  const result = scanTurn("compare /Users/bob/a with /Users/bob/b");
  assert.ok(!result.text.includes("bob"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
