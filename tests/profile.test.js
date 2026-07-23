// Tests for specificity profile config
import fs from "fs";
import path from "path";
import os from "os";
import assert from "assert";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specificity-test-"));
process.env.SPECIFICITY_PROFILE_DIR = tmpDir;

// Re-import config after setting env
const config = await import("../hooks/specificity-config.js");

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

test("getProfileDir returns env override", () => {
  assert.strictEqual(config.getProfileDir(), tmpDir);
});

test("hasProfile returns false when no profile exists", () => {
  assert.strictEqual(config.hasProfile(), false);
});

test("hasProfile returns true after writing profile", () => {
  fs.writeFileSync(config.getProfilePath(), "# Test Profile\n");
  assert.strictEqual(config.hasProfile(), true);
});

test("readProfile returns file contents", () => {
  const content = config.readProfile();
  assert.strictEqual(content, "# Test Profile\n");
});

test("readProfile returns null for missing file", () => {
  fs.unlinkSync(config.getProfilePath());
  assert.strictEqual(config.readProfile(), null);
});

test("isDeactivationCommand matches exact phrases", () => {
  assert.strictEqual(config.isDeactivationCommand("stop specificity"), true);
  assert.strictEqual(config.isDeactivationCommand("normal mode"), true);
  assert.strictEqual(config.isDeactivationCommand("stop specificity."), true);
});

test("isDeactivationCommand rejects partial matches", () => {
  assert.strictEqual(config.isDeactivationCommand("stop specificity mode"), false);
  assert.strictEqual(config.isDeactivationCommand("can you stop specificity"), false);
  assert.strictEqual(config.isDeactivationCommand("add a normal mode toggle"), false);
});

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
