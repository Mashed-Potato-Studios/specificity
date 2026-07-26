// Conformance suite for the storage driver contract, run against every driver.
// Spec: docs/SPEC-V2.md — "Storage driver contract" / "Testing decisions".
//
// A third-party driver can prove itself by running this same suite.
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { memoryDriver, fsDriver, gitDriver } from "../src/lib/store.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function tmp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `specificity-${label}-`));
}

/** Every driver must satisfy this, whoever wrote it. */
async function conformanceSuite(label, makeDriver) {
  console.log(`\nstore: ${label}`);
  const driver = makeDriver();

  await test(`${label}: get returns null for a missing object`, async () => {
    assert.strictEqual(await driver.get("nope"), null);
  });

  await test(`${label}: put then get round-trips bytes`, async () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 255]);
    await driver.put("obj-a", bytes);
    assert.deepStrictEqual(await driver.get("obj-a"), bytes);
  });

  await test(`${label}: put overwrites`, async () => {
    await driver.put("obj-a", Buffer.from("second"));
    assert.strictEqual((await driver.get("obj-a")).toString(), "second");
  });

  await test(`${label}: list returns stored keys`, async () => {
    await driver.put("obj-b", Buffer.from("b"));
    const keys = await driver.list();
    assert.ok(keys.includes("obj-a"));
    assert.ok(keys.includes("obj-b"));
  });

  await test(`${label}: list filters by prefix`, async () => {
    await driver.put("other", Buffer.from("x"));
    assert.deepStrictEqual(await driver.list("obj-"), ["obj-a", "obj-b"]);
  });

  await test(`${label}: delete removes`, async () => {
    await driver.delete("obj-b");
    assert.strictEqual(await driver.get("obj-b"), null);
  });

  await test(`${label}: delete of a missing object is not an error`, async () => {
    await driver.delete("never-existed");
  });

  await test(`${label}: survives binary content unchanged`, async () => {
    const blob = Buffer.alloc(1024);
    for (let i = 0; i < blob.length; i++) blob[i] = i % 256;
    await driver.put("binary", blob);
    assert.deepStrictEqual(await driver.get("binary"), blob);
  });

  await test(`${label}: declares its capabilities`, async () => {
    assert.strictEqual(typeof driver.capabilities.history, "boolean");
  });
}

await conformanceSuite("memory", () => memoryDriver());
await conformanceSuite("fs", () => fsDriver({ root: tmp("fs") }));

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

if (gitAvailable) {
  await conformanceSuite("git", () => gitDriver({ root: tmp("git") }));
} else {
  console.log("\nstore: git — skipped, git not available");
}

console.log("\nstore: history");

await test("fs driver keeps prior versions", async () => {
  const driver = fsDriver({ root: tmp("fs-history"), keepVersions: 3 });
  for (const value of ["one", "two", "three"]) {
    await driver.put("thing", Buffer.from(value));
  }
  // Three writes: the first created it, the next two archived a prior copy.
  assert.strictEqual((await driver.versions("thing")).length, 2);
  assert.strictEqual((await driver.get("thing")).toString(), "three");
});

await test("fs driver prunes beyond the keep limit", async () => {
  const driver = fsDriver({ root: tmp("fs-prune"), keepVersions: 2 });
  for (let i = 0; i < 8; i++) await driver.put("thing", Buffer.from(`v${i}`));
  assert.ok((await driver.versions("thing")).length <= 2);
});

await test("an archived version can be read back", async () => {
  const driver = fsDriver({ root: tmp("fs-readback"), keepVersions: 5 });
  await driver.put("thing", Buffer.from("original"));
  await driver.put("thing", Buffer.from("replacement"));

  const [latest] = await driver.versions("thing");
  assert.strictEqual((await driver.readVersion("thing", latest)).toString(), "original");
});

await test("reading a version that does not exist returns null", async () => {
  const driver = fsDriver({ root: tmp("fs-noversion") });
  assert.strictEqual(await driver.readVersion("thing", "nope"), null);
});

if (gitAvailable) {
  await test("git driver reads an earlier commit back", async () => {
    const driver = gitDriver({ root: tmp("git-readback") });
    await driver.put("thing", Buffer.from("original"));
    await driver.put("thing", Buffer.from("replacement"));

    const versions = await driver.versions("thing");
    assert.strictEqual(versions.length, 2);
    // Newest first, so the older commit holds the original bytes.
    assert.strictEqual((await driver.readVersion("thing", versions[1])).toString(), "original");
  });
}

await test("fs driver leaves no temp files behind", async () => {
  const root = tmp("fs-temp");
  const driver = fsDriver({ root });
  await driver.put("thing", Buffer.from("x"));
  assert.ok(!fs.readdirSync(root).some((f) => f.includes(".tmp-")));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
