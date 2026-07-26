// Tests for v2 crypto: mnemonic, key derivation, envelope, path derivation.
// Spec: docs/SPEC-V2.md — "Key and crypto".
import assert from "assert";
import crypto from "crypto";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToKey,
  encrypt,
  decrypt,
  pathFor,
  ENVELOPE_VERSION,
} from "../src/lib/crypto.js";

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

console.log("\ncrypto: mnemonic");

test("generates 12 words", () => {
  assert.strictEqual(generateMnemonic().split(" ").length, 12);
});

test("generated mnemonics validate", () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(validateMnemonic(generateMnemonic()));
  }
});

test("generated mnemonics differ", () => {
  assert.notStrictEqual(generateMnemonic(), generateMnemonic());
});

test("rejects a word outside the wordlist", () => {
  const words = generateMnemonic().split(" ");
  words[3] = "notaword";
  assert.strictEqual(validateMnemonic(words.join(" ")), false);
});

test("rejects a bad checksum", () => {
  // Swap the last word for a different valid word; checksum should fail
  // for all but a vanishing fraction of substitutions.
  const words = generateMnemonic().split(" ");
  let broken = false;
  for (const candidate of ["abandon", "ability", "able", "about", "above"]) {
    if (candidate === words[11]) continue;
    const attempt = [...words.slice(0, 11), candidate].join(" ");
    if (!validateMnemonic(attempt)) broken = true;
  }
  assert.ok(broken, "expected at least one substitution to fail checksum");
});

test("rejects wrong word counts", () => {
  assert.strictEqual(validateMnemonic("abandon ability able"), false);
  assert.strictEqual(validateMnemonic(""), false);
});

console.log("\ncrypto: key derivation");

// One derivation reused across tests — scrypt at N=2^17 is deliberately slow.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";
const KEY = mnemonicToKey(PHRASE);

test("derives a 32-byte key", () => {
  assert.strictEqual(KEY.length, 32);
});

test("derivation is deterministic (known answer)", () => {
  // Locks the derivation. If this changes, every existing profile is orphaned.
  // PHRASE is the canonical BIP39 all-zero-entropy vector.
  assert.strictEqual(
    KEY.toString("hex"),
    "43a6ab4be54cafd19ff43666d168b8f5608330c4a77a3f451429f904226020dc"
  );
});

test("different phrases derive different keys", () => {
  const other = mnemonicToKey(
    "legal winner thank year wave sausage worth useful legal winner thank yellow"
  );
  assert.notStrictEqual(KEY.toString("hex"), other.toString("hex"));
});

test("normalizes whitespace and case", () => {
  const messy = `  ${PHRASE.toUpperCase().replace(/ /g, "   ")}  `;
  assert.strictEqual(mnemonicToKey(messy).toString("hex"), KEY.toString("hex"));
});

test("refuses an invalid mnemonic", () => {
  assert.throws(() => mnemonicToKey("not a real mnemonic at all"), /mnemonic/i);
});

console.log("\ncrypto: envelope");

const PLAINTEXT = Buffer.from("# Specificity Profile\n- terse for approvals\n");

test("round-trips", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  assert.deepStrictEqual(decrypt(KEY, sealed), PLAINTEXT);
});

test("ciphertext is not plaintext", () => {
  assert.ok(!encrypt(KEY, PLAINTEXT).includes("Specificity Profile"));
});

test("nonce differs per write, so output differs", () => {
  assert.notStrictEqual(
    encrypt(KEY, PLAINTEXT).toString("hex"),
    encrypt(KEY, PLAINTEXT).toString("hex")
  );
});

test("header is readable without the key", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  assert.strictEqual(sealed.subarray(0, 4).toString("ascii"), "SPCF");
  assert.strictEqual(sealed[4], ENVELOPE_VERSION);
});

test("header carries nothing derived from content", () => {
  // Bytes 0-7 are magic + version + KDF params: identical regardless of what
  // is sealed. The nonce that follows must differ, which the next test asserts.
  const a = encrypt(KEY, Buffer.from("short"));
  const b = encrypt(KEY, Buffer.alloc(4096, 0x41));
  assert.deepStrictEqual(a.subarray(0, 8), b.subarray(0, 8));
});

test("nonce differs between envelopes", () => {
  const a = encrypt(KEY, PLAINTEXT).subarray(8, 20);
  const b = encrypt(KEY, PLAINTEXT).subarray(8, 20);
  assert.notDeepStrictEqual(a, b);
});

test("wrong key fails cleanly", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  const wrong = crypto.randomBytes(32);
  assert.throws(() => decrypt(wrong, sealed), /decrypt/i);
});

test("tampered ciphertext is rejected", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  sealed[sealed.length - 20] ^= 0xff;
  assert.throws(() => decrypt(KEY, sealed), /decrypt/i);
});

test("tampered tag is rejected", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  sealed[sealed.length - 1] ^= 0xff;
  assert.throws(() => decrypt(KEY, sealed), /decrypt/i);
});

test("tampered header is rejected", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  sealed[6] ^= 0xff; // inside the KDF params
  assert.throws(() => decrypt(KEY, sealed), /decrypt|header|version/i);
});

test("unknown magic is rejected", () => {
  const junk = Buffer.concat([Buffer.from("XXXX"), crypto.randomBytes(64)]);
  assert.throws(() => decrypt(KEY, junk), /envelope|magic/i);
});

test("future envelope version is refused, not guessed", () => {
  const sealed = encrypt(KEY, PLAINTEXT);
  sealed[4] = 99;
  assert.throws(() => decrypt(KEY, sealed), /version/i);
});

console.log("\ncrypto: path derivation");

test("derives a stable opaque path", () => {
  const a = pathFor(KEY, "PROFILE.md");
  assert.strictEqual(a, pathFor(KEY, "PROFILE.md"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("path reveals no filename", () => {
  assert.ok(!pathFor(KEY, "PROFILE.md").includes("PROFILE"));
});

test("different files derive different paths", () => {
  assert.notStrictEqual(pathFor(KEY, "PROFILE.md"), pathFor(KEY, "EXPERIENCE.md"));
});

test("different keys derive different paths for the same file", () => {
  const other = crypto.randomBytes(32);
  assert.notStrictEqual(pathFor(KEY, "PROFILE.md"), pathFor(other, "PROFILE.md"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
