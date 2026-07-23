// Tests for specificity-mcp profile store + server tool list.
// Imports the real module (single source of truth) rather than mirroring regexes.

import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specificity-mcp-test-"));
process.env.SPECIFICITY_PROFILE_DIR = tmpDir;

fs.writeFileSync(
  path.join(tmpDir, "PROFILE.md"),
  `# Specificity Profile — test\n\n## Phrase Map\n"soon come" → low urgency, not immediate\n`
);
fs.writeFileSync(
  path.join(tmpDir, "EXPERIENCE.md"),
  `# Specificity Experience — test\n\n## Stack\n- Vue/Nuxt: fluent, preferred, growing — default\n- React: competent, tolerated, rusty — only if required\n`
);

const {
  parsePhraseMap,
  parseStack,
  validateCorrection,
  applyCorrection,
  readProfile,
  readExperience,
} = await import("../specificity-mcp/lib/profile.js");
const { callTool, TOOLS } = await import("../specificity-mcp/lib/tools.js");

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
function eq(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// --- parsing ---
test("parsePhraseMap reads one entry", () => {
  const p = parsePhraseMap(readProfile());
  eq(p.length, 1);
  eq(p[0].phrase, "soon come");
  if (!p[0].intent.includes("low urgency")) throw new Error("wrong intent");
});

test("parseStack reads two entries, Vue preferred", () => {
  const s = parseStack(readExperience());
  eq(s.length, 2);
  eq(s.find((x) => x.tech === "Vue/Nuxt").preference, "preferred");
});

test("parser tolerates smart quotes and -> arrow", () => {
  const p = parsePhraseMap(`## Phrase Map\n“big up” -> acknowledge / thanks\n`);
  eq(p.length, 1);
  eq(p[0].phrase, "big up");
});

test("parser tolerates hyphen note separator", () => {
  const s = parseStack(`## Stack\n- Go: beginner, fine, learning - teach while doing\n`);
  eq(s.length, 1);
  eq(s[0].tech, "Go");
  eq(s[0].note, "teach while doing");
});

// --- validation ---
test("validateCorrection normalizes a phrase to canonical form", () => {
  const v = validateCorrection("phrase", `“wah gwaan” -> whats up / status check`);
  eq(v.ok, true);
  eq(v.line, `"wah gwaan" → whats up / status check`);
  eq(v.section, "Phrase Map");
});

test("validateCorrection rejects bad preference enum", () => {
  const v = validateCorrection("stack", `- Rust: competent, luvit, learning — nope`);
  eq(v.ok, false);
  if (!/preference must be one of/.test(v.error)) throw new Error("wrong error");
});

test("validateCorrection rejects bad trajectory enum", () => {
  const v = validateCorrection("stack", `- Rust: competent, fine, vibing — nope`);
  eq(v.ok, false);
  if (!/trajectory must be one of/.test(v.error)) throw new Error("wrong error");
});

test("validateCorrection rejects malformed phrase", () => {
  eq(validateCorrection("phrase", "no arrow here").ok, false);
});

// --- append / upsert ---
test("applyCorrection appends a new phrase", () => {
  const r = applyCorrection("phrase", `"nuff" → a lot / plenty`);
  eq(r.ok, true);
  eq(r.action, "appended");
  const p = parsePhraseMap(readProfile());
  eq(p.length, 2);
  if (!p.find((x) => x.phrase === "nuff")) throw new Error("nuff not written");
});

test("applyCorrection updates an existing phrase in place", () => {
  const before = parsePhraseMap(readProfile()).length;
  const r = applyCorrection("phrase", `"soon come" → indefinite / unhurried timing`);
  eq(r.action, "updated");
  const p = parsePhraseMap(readProfile());
  eq(p.length, before, "update must not add a line");
  eq(p.find((x) => x.phrase === "soon come").intent, "indefinite / unhurried timing");
});

test("applyCorrection appends a stack entry with normalized dash", () => {
  const r = applyCorrection("stack", `- Go: beginner, fine, learning - teach while doing`);
  eq(r.ok, true);
  if (!readExperience().includes("Go: beginner, fine, learning — teach while doing")) {
    throw new Error("dash not normalized to em-dash on write");
  }
});

test("applyCorrection creates the section when absent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specificity-mcp-fresh-"));
  const saved = process.env.SPECIFICITY_PROFILE_DIR;
  process.env.SPECIFICITY_PROFILE_DIR = dir;
  try {
    fs.writeFileSync(path.join(dir, "PROFILE.md"), `# Profile\n\n## Identity\nsomeone\n`);
    const r = applyCorrection("phrase", `"seen" → understood / acknowledged`);
    eq(r.ok, true);
    const body = fs.readFileSync(path.join(dir, "PROFILE.md"), "utf8");
    if (!/## Phrase Map/.test(body)) throw new Error("section not created");
    if (!/## Identity[\s\S]*someone/.test(body)) throw new Error("existing section clobbered");
  } finally {
    process.env.SPECIFICITY_PROFILE_DIR = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyCorrection refuses invalid entry (never writes garbage)", () => {
  const before = readExperience();
  const r = applyCorrection("stack", `- X: a, notapref, learning — y`);
  eq(r.ok, false);
  eq(readExperience(), before, "file must be untouched on invalid input");
});

// --- tool dispatch: the handler layer, incl. the trust-boundary gate ---
// callTool is synchronous, so these are real assertions — not a timing race.

test("TOOLS list exposes both learning tools", () => {
  const names = TOOLS.map((t) => t.name);
  if (!names.includes("propose_correction")) throw new Error("missing propose_correction");
  if (!names.includes("apply_correction")) throw new Error("missing apply_correction");
});

test("propose_correction previews but writes nothing", () => {
  const before = readProfile();
  const r = callTool("propose_correction", { type: "phrase", content: `"link me" → send it to me` });
  const out = r.content[0].text;
  if (!out.includes("Nothing has been written")) throw new Error("preview wording missing");
  if (!out.includes(`"link me" → send it to me`)) throw new Error("normalized line not shown");
  eq(readProfile(), before, "propose must not touch the file");
});

test("apply_correction GATE: confirmed:false blocks the write", () => {
  const before = readProfile();
  const r = callTool("apply_correction", { type: "phrase", content: `"link me" → send it to me`, confirmed: false });
  if (!r.content[0].text.includes("Not written")) throw new Error("gate did not refuse");
  eq(readProfile(), before, "unconfirmed apply must not touch the file");
});

test("apply_correction GATE: missing confirmed blocks the write", () => {
  const before = readProfile();
  callTool("apply_correction", { type: "phrase", content: `"link me" → send it to me` });
  eq(readProfile(), before, "apply without confirmed must not touch the file");
});

test("apply_correction with confirmed:true actually writes", () => {
  const r = callTool("apply_correction", { type: "phrase", content: `"link me" → send it to me`, confirmed: true });
  if (!/^(Added|Updated)/.test(r.content[0].text)) throw new Error("expected write confirmation");
  if (!parsePhraseMap(readProfile()).find((p) => p.phrase === "link me")) throw new Error("line not persisted");
});

test("apply_correction with confirmed:true still rejects an invalid entry", () => {
  const before = readExperience();
  const r = callTool("apply_correction", { type: "stack", content: `- X: a, notapref, learning — y`, confirmed: true });
  if (!r.content[0].text.includes("Not written")) throw new Error("invalid entry was not refused");
  eq(readExperience(), before, "invalid confirmed apply must not touch the file");
});

test("get_phrase_intent resolves a known phrase", () => {
  const r = callTool("get_phrase_intent", { phrase: "soon come" });
  if (!r.content[0].text.includes("Intent:")) throw new Error("known phrase not resolved");
});

test("callTool returns a friendly message for an unknown tool", () => {
  if (!callTool("nope", {}).content[0].text.includes("Unknown tool")) throw new Error("no unknown-tool handling");
});

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
