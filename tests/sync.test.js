// End-to-end: two machines, one remote, through the real crypto and journal.
// Spec: docs/SPEC-V2.md — "Testing decisions".
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { memoryDriver, fsDriver } from "../src/lib/store.js";
import { createIdentity, restoreIdentity, loadKey, forgetKey, keyPath, machineId } from "../src/lib/identity.js";
import { makeEvent, factHash } from "../src/lib/journal.js";
import { sync, restore, appendEvents, readJournal, PROFILE_FILE } from "../src/lib/sync.js";
import { pathFor } from "../src/lib/crypto.js";

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

const tmp = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `specificity-${label}-`));
const profileOf = (dir) => fs.readFileSync(path.join(dir, PROFILE_FILE), "utf8");

function learn(dir, text, section, ts) {
  appendEvents(
    [makeEvent({ op: "add", section, text, machine: machineId(dir), ts, origin: "confirmed-observation" })],
    dir
  );
}

console.log("\nidentity");

await test("creates a phrase and stores only the derived key", async () => {
  const dir = tmp("id");
  const { mnemonic, key } = createIdentity(dir);
  assert.strictEqual(mnemonic.split(" ").length, 12);
  assert.deepStrictEqual(loadKey(dir), key);
  // The phrase itself must never touch disk.
  const onDisk = fs.readFileSync(keyPath(dir), "utf8");
  assert.ok(!onDisk.includes(mnemonic.split(" ")[0]));
});

await test("key file is owner-only", async () => {
  const dir = tmp("id-perm");
  createIdentity(dir);
  assert.strictEqual(fs.statSync(keyPath(dir)).mode & 0o777, 0o600);
});

await test("machine id is stable and opaque", async () => {
  const dir = tmp("id-machine");
  const id = machineId(dir);
  assert.strictEqual(id, machineId(dir));
  assert.ok(!id.includes(os.hostname()));
});

await test("machine ids differ between installs", async () => {
  assert.notStrictEqual(machineId(tmp("id-a")), machineId(tmp("id-b")));
});

await test("logging out removes the key and leaves the profile", async () => {
  const dir = tmp("id-logout");
  createIdentity(dir);
  fs.writeFileSync(path.join(dir, PROFILE_FILE), "## Rhythm\n- wakes early\n");
  assert.strictEqual(forgetKey(dir), true);
  assert.strictEqual(loadKey(dir), null);
  assert.ok(fs.existsSync(path.join(dir, PROFILE_FILE)));
});

await test("the phrase alone rebuilds the same key elsewhere", async () => {
  const first = tmp("id-1");
  const { mnemonic, key } = createIdentity(first);
  const second = tmp("id-2");
  assert.deepStrictEqual(restoreIdentity(mnemonic, second).key, key);
});

console.log("\nsync: one machine");

await test("first sync pushes an encrypted journal", async () => {
  const dir = tmp("sync-1");
  const { key } = createIdentity(dir);
  const driver = memoryDriver();
  learn(dir, "often starts work between 6-7am", "Rhythm & Context", 1000);

  const result = await sync({ driver, key, dir });
  assert.strictEqual(result.status, "ok");
  assert.ok(result.pushed > 0);

  const blob = await driver.get(pathFor(key, "_journal.jsonl"));
  assert.ok(blob, "journal should be in the remote");
  assert.ok(!blob.toString("utf8").includes("6-7am"), "remote must not hold plaintext");
});

await test("remote object names reveal nothing", async () => {
  const dir = tmp("sync-opaque");
  const { key } = createIdentity(dir);
  const driver = memoryDriver();
  learn(dir, "x", "Rhythm & Context", 1000);
  await sync({ driver, key, dir });

  for (const name of await driver.list()) {
    assert.match(name, /^[0-9a-f]{64}$/);
  }
});

await test("materializes the profile from the journal", async () => {
  const dir = tmp("sync-materialize");
  const { key } = createIdentity(dir);
  learn(dir, "often starts work between 6-7am", "Rhythm & Context", 1000);
  await sync({ driver: memoryDriver(), key, dir });

  assert.match(profileOf(dir), /## Rhythm & Context/);
  assert.match(profileOf(dir), /- often starts work between 6-7am/);
});

console.log("\nsync: a second machine");

await test("restores a profile from phrase alone", async () => {
  const laptop = tmp("m-laptop");
  const { mnemonic, key } = createIdentity(laptop);
  const driver = fsDriver({ root: tmp("remote") });
  learn(laptop, "often starts work between 6-7am", "Rhythm & Context", 1000);
  await sync({ driver, key, dir: laptop });

  // A machine that has never seen this profile.
  const desktop = tmp("m-desktop");
  const restored = restoreIdentity(mnemonic, desktop);
  const outcome = await restore({ driver, key: restored.key, dir: desktop });

  assert.strictEqual(outcome.status, "restored");
  assert.match(profileOf(desktop), /- often starts work between 6-7am/);
});

await test("both machines keep what they learned offline", async () => {
  const driver = fsDriver({ root: tmp("remote-merge") });
  const laptop = tmp("merge-laptop");
  const { mnemonic, key } = createIdentity(laptop);
  const desktop = tmp("merge-desktop");
  const { key: key2 } = restoreIdentity(mnemonic, desktop);

  learn(laptop, "prefers mornings", "Rhythm & Context", 1000);
  await sync({ driver, key, dir: laptop });
  await sync({ driver, key: key2, dir: desktop });

  // Both learn while apart.
  learn(laptop, "terse for approvals", "Communication Style", 2000);
  learn(desktop, "asks for recommendations first", "Interaction Preferences", 2100);

  await sync({ driver, key, dir: laptop });
  await sync({ driver, key: key2, dir: desktop });
  await sync({ driver, key, dir: laptop });

  for (const dir of [laptop, desktop]) {
    const text = profileOf(dir);
    assert.match(text, /prefers mornings/, `${dir} lost the first fact`);
    assert.match(text, /terse for approvals/, `${dir} lost the laptop's fact`);
    assert.match(text, /asks for recommendations first/, `${dir} lost the desktop's fact`);
  }
});

await test("a deletion propagates and is not resurrected", async () => {
  const driver = fsDriver({ root: tmp("remote-delete") });
  const laptop = tmp("del-laptop");
  const { mnemonic, key } = createIdentity(laptop);
  const desktop = tmp("del-desktop");
  const { key: key2 } = restoreIdentity(mnemonic, desktop);

  learn(laptop, "wakes early", "Rhythm & Context", 1000);
  await sync({ driver, key, dir: laptop });
  await sync({ driver, key: key2, dir: desktop });
  assert.match(profileOf(desktop), /wakes early/);

  // Laptop forgets it.
  appendEvents(
    [makeEvent({ op: "remove", factHash: factHash("wakes early"), machine: machineId(laptop), ts: 3000 })],
    laptop
  );
  await sync({ driver, key, dir: laptop });

  // Desktop still holds the old fact locally, then syncs.
  await sync({ driver, key: key2, dir: desktop });
  assert.ok(!profileOf(desktop).includes("wakes early"), "deleted fact came back");

  // And the tombstone never carries the text.
  const journal = readJournal(desktop);
  const tombstone = journal.find((e) => e.op === "remove");
  assert.ok(tombstone);
  assert.ok(!JSON.stringify(tombstone).includes("wakes early"));
});

await test("a hand edit wins and survives a sync", async () => {
  const driver = fsDriver({ root: tmp("remote-edit") });
  const dir = tmp("edit-machine");
  const { key } = createIdentity(dir);
  learn(dir, "very terse", "Communication Style", 1000);
  await sync({ driver, key, dir });

  // Developer edits the file directly.
  fs.writeFileSync(
    path.join(dir, PROFILE_FILE),
    "## Communication Style\n- terse for approvals, fuller when defining work\n"
  );
  const result = await sync({ driver, key, dir, ts: 2000 });

  assert.ok(result.reconciled >= 1, "hand edit should produce events");
  const text = profileOf(dir);
  assert.match(text, /terse for approvals, fuller when defining work/);
  assert.ok(!text.includes("- very terse"), "hand-deleted fact should stay gone");
});

console.log("\nsync: failure posture");

await test("an unreachable remote degrades to local-only and does not throw", async () => {
  const dir = tmp("fail-unreachable");
  const { key } = createIdentity(dir);
  learn(dir, "wakes early", "Rhythm & Context", 1000);

  const broken = {
    ...memoryDriver(),
    async get() {
      throw new Error("ENOTFOUND remote.example");
    },
  };

  const result = await sync({ driver: broken, key, dir });
  assert.strictEqual(result.status, "local-only");
  assert.match(result.warnings[0], /unreachable/i);
  assert.match(profileOf(dir), /wakes early/, "local profile must still materialize");
});

await test("a push failure keeps local changes and warns", async () => {
  const dir = tmp("fail-push");
  const { key } = createIdentity(dir);
  learn(dir, "wakes early", "Rhythm & Context", 1000);

  const driver = memoryDriver();
  driver.put = async () => {
    throw new Error("EACCES");
  };

  const result = await sync({ driver, key, dir });
  assert.strictEqual(result.status, "local-only");
  assert.match(profileOf(dir), /wakes early/);
});

await test("an undecryptable remote is refused, local left untouched", async () => {
  const dir = tmp("fail-corrupt");
  const { key } = createIdentity(dir);
  learn(dir, "wakes early", "Rhythm & Context", 1000);
  const driver = memoryDriver();
  await sync({ driver, key, dir });
  const before = profileOf(dir);

  // Someone else's blob, or a corrupted one.
  await driver.put(pathFor(key, "_journal.jsonl"), Buffer.from("SPCF\x01not a real envelope"));

  const result = await sync({ driver, key, dir });
  assert.strictEqual(result.status, "refused");
  assert.match(result.warnings[0], /could not be decrypted/i);
  assert.strictEqual(profileOf(dir), before, "local profile must be untouched");
});

await test("a wrong key is refused rather than merged", async () => {
  const dir = tmp("fail-wrongkey");
  const { key } = createIdentity(dir);
  const driver = memoryDriver();
  learn(dir, "wakes early", "Rhythm & Context", 1000);
  await sync({ driver, key, dir });

  const other = tmp("fail-wrongkey-2");
  const { key: wrongKey } = createIdentity(other);
  // Point the wrong key at the right object path.
  await driver.put(
    pathFor(wrongKey, "_journal.jsonl"),
    await driver.get(pathFor(key, "_journal.jsonl"))
  );

  const result = await sync({ driver, key: wrongKey, dir: other });
  assert.strictEqual(result.status, "refused");
});

console.log("\nsync: rollback");

await test("a bad observation can be rolled back", async () => {
  const driver = fsDriver({ root: tmp("remote-rollback") });
  const dir = tmp("rollback-machine");
  const { key } = createIdentity(dir);

  learn(dir, "wakes early", "Rhythm & Context", 1000);
  await sync({ driver, key, dir });

  // A later sync writes something the developer regrets.
  learn(dir, "hates mornings", "Rhythm & Context", 2000);
  await sync({ driver, key, dir });
  assert.match(profileOf(dir), /hates mornings/);

  const { listVersions, rollback } = await import("../src/lib/sync.js");
  const versions = await listVersions({ driver, key });
  assert.ok(versions.length >= 1, "expected an earlier version to exist");

  const result = await rollback({ driver, key, dir, version: versions[versions.length - 1] });
  assert.strictEqual(result.status, "restored");
  assert.match(profileOf(dir), /wakes early/, "the recovered event should be back");
});

await test("rollback merges rather than replaces, so later learning survives", async () => {
  const driver = fsDriver({ root: tmp("remote-rollback-merge") });
  const dir = tmp("rollback-merge-machine");
  const { key } = createIdentity(dir);

  learn(dir, "first fact", "Rhythm & Context", 1000);
  await sync({ driver, key, dir });
  learn(dir, "second fact", "Rhythm & Context", 2000);
  await sync({ driver, key, dir });

  const { listVersions, rollback } = await import("../src/lib/sync.js");
  const versions = await listVersions({ driver, key });
  await rollback({ driver, key, dir, version: versions[versions.length - 1] });

  // The journal is append-only: recovering old events must not delete new ones.
  const text = profileOf(dir);
  assert.match(text, /first fact/);
  assert.match(text, /second fact/, "rollback must not discard later learning");
});

await test("a backend with no history says so rather than pretending", async () => {
  const dir = tmp("rollback-nohistory");
  const { key } = createIdentity(dir);
  const { rollback } = await import("../src/lib/sync.js");
  const result = await rollback({ driver: memoryDriver(), key, dir });
  assert.strictEqual(result.status, "no-history");
});

await test("a corrupt remote points at the recovery path", async () => {
  const driver = fsDriver({ root: tmp("remote-corrupt-offer") });
  const dir = tmp("corrupt-offer-machine");
  const { key } = createIdentity(dir);
  learn(dir, "wakes early", "Rhythm & Context", 1000);
  await sync({ driver, key, dir });
  await sync({ driver, key, dir });

  await driver.put(pathFor(key, "_journal.jsonl"), Buffer.from("SPCF\x01garbage"));
  const result = await sync({ driver, key, dir });

  assert.strictEqual(result.status, "refused");
  assert.match(result.warnings[0], /rollback/, "the warning should offer the recovery path");
});

await test("no key means no sync, with a clear message", async () => {
  const dir = tmp("fail-nokey");
  const result = await sync({ driver: memoryDriver(), key: null, dir });
  assert.strictEqual(result.status, "no-key");
  assert.match(result.warnings[0], /restore/i);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
