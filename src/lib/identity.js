// Machine-local identity: the derived key and this install's opaque id.
// Spec: docs/SPEC-V2.md — "Key and crypto" / "Merge model".
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getProfileDir } from "../../hooks/specificity-config.js";
import { generateMnemonic, mnemonicToKey } from "./crypto.js";

export const KEY_FILE = "_key";
export const MACHINE_FILE = "_machine";

const OWNER_ONLY = 0o600;

export function keyPath(dir = getProfileDir()) {
  return path.join(dir, KEY_FILE);
}

/**
 * Store the derived key, never the mnemonic — a stolen key file compromises
 * the remote blob but does not hand over the recovery credential.
 *
 * Mode 600 matches the protection level of the plaintext profile beside it.
 * The key guards the *remote* copy; that is its whole job.
 */
export function saveKey(key, dir = getProfileDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const target = keyPath(dir);
  fs.writeFileSync(target, key.toString("hex"), { mode: OWNER_ONLY });
  fs.chmodSync(target, OWNER_ONLY);
  return target;
}

export function loadKey(dir = getProfileDir()) {
  try {
    return Buffer.from(fs.readFileSync(keyPath(dir), "utf8").trim(), "hex");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Log this machine out. The profile stays; only the key leaves. */
export function forgetKey(dir = getProfileDir()) {
  try {
    fs.unlinkSync(keyPath(dir));
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Opaque per-install id. Enough to dedup and order events and to diagnose
 * sync behaviour; deliberately not a hostname, which would carry employer or
 * personal identity into synced data.
 */
export function machineId(dir = getProfileDir()) {
  const target = path.join(dir, MACHINE_FILE);
  try {
    const existing = fs.readFileSync(target, "utf8").trim();
    if (existing) return existing;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const id = `m-${crypto.randomUUID().slice(0, 12)}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, id, { mode: OWNER_ONLY });
  return id;
}

/**
 * Create a new identity: generate a phrase, derive and store the key.
 * The mnemonic is returned to be shown once and never written to disk.
 */
export function createIdentity(dir = getProfileDir()) {
  const mnemonic = generateMnemonic();
  const key = mnemonicToKey(mnemonic);
  saveKey(key, dir);
  machineId(dir);
  return { mnemonic, key };
}

/** Restore on a machine that has never seen this profile. */
export function restoreIdentity(mnemonic, dir = getProfileDir()) {
  const key = mnemonicToKey(mnemonic);
  saveKey(key, dir);
  machineId(dir);
  return { key };
}
