#!/usr/bin/env node
// specificity — CLI for managing the developer profile
//
// Commands:
//   specificity profile          Show current profile
//   specificity profile reset    Reset (delete) profile + experience
//   specificity key ...          Create, restore or forget the recovery key
//   specificity sync ...         Sync the encrypted profile to your own remote
//   specificity install          Show install instructions
//   specificity version          Show version

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  getProfilePath,
  getExperiencePath,
  getProfileDir,
  hasProfile,
  readProfile,
  readExperience,
} from "../hooks/specificity-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);

function showHelp() {
  console.log(`specificity v${version}

Usage:
  specificity profile          Show current profile and experience
  specificity profile reset    Reset profile and experience files

  specificity key create       Generate a recovery phrase for this profile
  specificity key restore      Restore a key from an existing phrase
  specificity key forget       Remove the key from this machine only
  specificity key status       Show whether this machine holds a key

  specificity sync <location>  Sync to a folder or git repo you own
  specificity pull <location>  Restore this profile onto a new machine

Profile location: ${getProfileDir()}`);
}

function showProfile() {
  if (!hasProfile()) {
    console.log("No profile found. Run /specificity-setup in your agent to build one.");
    process.exit(0);
  }

  console.log("=== PROFILE ===\n");
  console.log(readProfile() || "(empty)");

  const experience = readExperience();
  if (experience) {
    console.log("\n=== EXPERIENCE ===\n");
    console.log(experience);
  }
}

function resetProfile() {
  let removed = 0;
  try { fs.unlinkSync(getProfilePath()); removed++; } catch (e) {}
  try { fs.unlinkSync(getExperiencePath()); removed++; } catch (e) {}
  console.log(`Removed ${removed} file(s). Profile reset. Run /specificity-setup to rebuild.`);
}

function install() {
  console.log("Install via: npx skills add Mashed-Potato-Studios/specificity -g");
  console.log("Or manually copy skills/ into ~/.pi/agent/skills/ or ~/.claude/skills/");
}

/** Pick a driver from a location: a git repo if it looks like one, else a folder. */
async function driverFor(location) {
  const { fsDriver, gitDriver } = await import("./lib/store.js");
  if (!location) {
    console.error("Where to? e.g. specificity sync ~/Dropbox/specificity");
    process.exit(1);
  }
  const target = location.replace(/^~/, os.homedir());
  return fs.existsSync(path.join(target, ".git"))
    ? gitDriver({ root: target })
    : fsDriver({ root: target });
}

async function keyCommand(sub) {
  const identity = await import("./lib/identity.js");

  if (sub === "create") {
    if (identity.loadKey()) {
      console.error("This machine already holds a key. `specificity key forget` first.");
      process.exit(1);
    }
    const { mnemonic } = identity.createIdentity();
    console.log(`
Your recovery phrase — write it down now. It is shown once.

    ${mnemonic}

This phrase is the only way to reach your profile from a machine that does not
already hold the key. It is not stored anywhere: not on disk, not by us.

If you lose the phrase but still have a working machine, run
\`specificity key create\` again after \`key forget\` to re-key from local files.
If you lose the phrase and every machine, the synced copy cannot be recovered.
`);
    return;
  }

  if (sub === "restore") {
    const phrase = process.argv.slice(4).join(" ").trim();
    if (!phrase) {
      console.error('Usage: specificity key restore "<twelve word phrase>"');
      process.exit(1);
    }
    try {
      identity.restoreIdentity(phrase);
      console.log("Key restored. Run `specificity pull <location>` to fetch your profile.");
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }

  if (sub === "forget") {
    console.log(
      identity.forgetKey()
        ? "Key removed from this machine. Your local profile is untouched."
        : "No key on this machine."
    );
    return;
  }

  console.log(
    identity.loadKey()
      ? `This machine holds a key (${identity.machineId()}).`
      : "No key on this machine. Run `specificity key create` or `key restore`."
  );
}

async function syncCommand(location) {
  const { sync } = await import("./lib/sync.js");
  const { loadKey } = await import("./lib/identity.js");

  const result = await sync({ driver: await driverFor(location), key: loadKey() });
  for (const warning of result.warnings) console.warn(`! ${warning}`);

  if (result.status === "ok") {
    console.log(
      `Synced. ${result.pushed} object(s) pushed, ${result.pulled} remote event(s) merged` +
        (result.reconciled ? `, ${result.reconciled} local edit(s) folded in.` : ".")
    );
  }
  process.exit(result.status === "refused" || result.status === "no-key" ? 1 : 0);
}

async function pullCommand(location) {
  const { restore } = await import("./lib/sync.js");
  const { loadKey } = await import("./lib/identity.js");

  const key = loadKey();
  if (!key) {
    console.error('No key on this machine. Run: specificity key restore "<phrase>"');
    process.exit(1);
  }
  try {
    const outcome = await restore({ driver: await driverFor(location), key });
    console.log(
      outcome.status === "restored"
        ? `Restored ${outcome.events} event(s). Your profile is at ${getProfilePath()}.`
        : "Nothing found at that location for this key."
    );
  } catch (err) {
    console.error(`Could not restore: ${err.message}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case "profile":
    if (args[1] === "reset") resetProfile();
    else showProfile();
    break;
  case "key":
    await keyCommand(args[1]);
    break;
  case "sync":
    await syncCommand(args[1]);
    break;
  case "pull":
    await pullCommand(args[1]);
    break;
  case "install":
    install();
    break;
  case "version":
    console.log(version);
    break;
  default:
    showHelp();
}
