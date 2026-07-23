// Tests for specificity hooks
import fs from "fs";
import path from "path";
import os from "os";
import assert from "assert";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specificity-hooks-test-"));
process.env.SPECIFICITY_PROFILE_DIR = tmpDir;

const config = await import("../hooks/specificity-config.js");
const runtime = await import("../hooks/specificity-runtime.js");

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

test("readMode returns null when no state file", () => {
  assert.strictEqual(runtime.readMode(), null);
});

test("setMode writes state file", () => {
  runtime.setMode("active");
  assert.strictEqual(runtime.readMode(), "active");
});

test("clearMode removes state file", () => {
  runtime.setMode("active");
  runtime.clearMode();
  assert.strictEqual(runtime.readMode(), null);
});

test("writeHookOutput does not throw for native Claude", () => {
  let output = "";
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { output += s; };
  try {
    runtime.writeHookOutput("SessionStart", "active", "test context");
    assert.ok(output.includes("test context"));
  } finally {
    process.stdout.write = origWrite;
  }
});

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
