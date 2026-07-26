// Key derivation and envelope encryption for the portable profile.
// Spec: docs/SPEC-V2.md — "Key and crypto". Node stdlib only, by design:
// this is the path a user must be able to audit, so it carries no dependencies.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** BIP39 English wordlist, vendored as data (public domain). */
export const WORDLIST = fs
  .readFileSync(path.join(HERE, "wordlist-en.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean);

if (WORDLIST.length !== 2048) {
  throw new Error(`wordlist must hold 2048 words, found ${WORDLIST.length}`);
}

const WORD_INDEX = new Map(WORDLIST.map((w, i) => [w, i]));

/**
 * Fixed application salt. Safe because the mnemonic already carries 128 bits of
 * entropy — the same rationale BIP39 uses. It is what lets the phrase alone
 * rebuild the key on a machine that has never seen the profile: there is no
 * salt to fetch first, so no chicken-and-egg with the remote blob.
 */
const KDF_SALT = "specificity-v2";
const KDF = { N: 2 ** 17, r: 8, p: 1 };
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

const MAGIC = "SPCF";
export const ENVELOPE_VERSION = 1;
/** magic(4) + version(1) + log2N(1) + r(1) + p(1) + nonce(12) */
const HEADER_BYTES = 4 + 1 + 1 + 1 + 1 + NONCE_BYTES;

/** Generate a 12-word recovery phrase (128 bits of entropy + 4-bit checksum). */
export function generateMnemonic() {
  const entropy = crypto.randomBytes(16);
  const checksum = crypto.createHash("sha256").update(entropy).digest()[0] >> 4;

  // 128 entropy bits + 4 checksum bits = 132 bits = 12 words of 11 bits.
  let bits = "";
  for (const byte of entropy) bits += byte.toString(2).padStart(8, "0");
  bits += checksum.toString(2).padStart(4, "0");

  const words = [];
  for (let i = 0; i < 12; i++) {
    words.push(WORDLIST[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
  }
  return words.join(" ");
}

/** Normalize a phrase for comparison and derivation: NFKD, lowercase, single-spaced. */
export function normalizeMnemonic(mnemonic) {
  return String(mnemonic).normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}

/** True if the phrase is 12 known words with a valid checksum. */
export function validateMnemonic(mnemonic) {
  const words = normalizeMnemonic(mnemonic).split(" ").filter(Boolean);
  if (words.length !== 12) return false;

  let bits = "";
  for (const word of words) {
    const index = WORD_INDEX.get(word);
    if (index === undefined) return false;
    bits += index.toString(2).padStart(11, "0");
  }

  const entropy = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);

  const expected = crypto.createHash("sha256").update(entropy).digest()[0] >> 4;
  return parseInt(bits.slice(128, 132), 2) === expected;
}

/**
 * Derive the 32-byte encryption key from a recovery phrase.
 * Deterministic: same phrase, same key, on any machine, forever.
 */
export function mnemonicToKey(mnemonic) {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("invalid mnemonic: not 12 known words with a valid checksum");
  }
  return crypto.scryptSync(normalizeMnemonic(mnemonic), KDF_SALT, KEY_BYTES, {
    ...KDF,
    // 128 * N * r, plus headroom. Node's 32MB default is far too small for N=2^17.
    maxmem: 256 * KDF.N * KDF.r,
  });
}

/** Seal plaintext into a versioned envelope. Header carries no user data. */
export function encrypt(key, plaintext) {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const header = Buffer.concat([
    Buffer.from(MAGIC, "ascii"),
    Buffer.from([ENVELOPE_VERSION, Math.log2(KDF.N), KDF.r, KDF.p]),
    nonce,
  ]);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  // The header is authenticated, so tampering with the version or KDF
  // parameters fails the tag rather than silently changing how we decrypt.
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

/** Open an envelope. Throws rather than returning anything questionable. */
export function decrypt(key, envelope) {
  if (!Buffer.isBuffer(envelope) || envelope.length < HEADER_BYTES + TAG_BYTES) {
    throw new Error("not a Specificity envelope: too short");
  }
  if (envelope.subarray(0, 4).toString("ascii") !== MAGIC) {
    throw new Error("not a Specificity envelope: bad magic");
  }
  const version = envelope[4];
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`unsupported envelope version ${version}`);
  }

  const header = envelope.subarray(0, HEADER_BYTES);
  const nonce = envelope.subarray(HEADER_BYTES - NONCE_BYTES, HEADER_BYTES);
  const body = envelope.subarray(HEADER_BYTES, envelope.length - TAG_BYTES);
  const tag = envelope.subarray(envelope.length - TAG_BYTES);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    // Wrong key, tampered body, or tampered header — indistinguishable, and
    // deliberately so. Never return partial plaintext.
    throw new Error("could not decrypt: wrong key or corrupt data");
  }
}

/**
 * Object path for a file in the remote. The store sees opaque names, so it
 * cannot tell the profile from the journal, nor attribute objects to a person.
 */
export function pathFor(key, filename) {
  return crypto
    .createHash("sha256")
    .update(key)
    .update(Buffer.from(filename, "utf8"))
    .digest("hex");
}
