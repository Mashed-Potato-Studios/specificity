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
import { execFileSync } from "child_process";
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

  specificity review           Show what has been noticed about you
  specificity review redactions  What was stripped (counts only)
  specificity pending          Pending proposals as JSON (for agents)
  specificity answer <key> <y|n|never|k|edit "text">
                               Record your answer to a proposal

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

// Everything a profile is made of. Deleting only PROFILE.md leaves the journal,
// which rebuilds the profile verbatim on the next sync — so reset must take the
// journal and the materialized snapshot too, or it doesn't forget anything.
const PROFILE_STATE_FILES = [
  "_journal.jsonl",
  "_materialized.md",
  "_observations.jsonl",
];

function resetProfile() {
  const dir = getProfileDir();
  const targets = [getProfilePath(), getExperiencePath(), ...PROFILE_STATE_FILES.map((f) => path.join(dir, f))];

  let removed = 0;
  for (const target of targets) {
    try {
      fs.unlinkSync(target);
      removed++;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  console.log(`Removed ${removed} file(s). Profile reset. Run /specificity-setup to rebuild.`);

  if (fs.existsSync(path.join(dir, "_key"))) {
    console.log(
      "\nNote: this machine still holds your key, and any copy you synced to a\n" +
        "remote is still there. `specificity key forget` removes the key; the\n" +
        "remote copy has to be deleted where it lives."
    );
  }
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
  if (!fs.existsSync(path.join(target, ".git"))) return fsDriver({ root: target });

  // A git checkout only syncs between machines if it actually talks to its
  // remote, so wire one up when the repo has one.
  let remote = null;
  try {
    remote = execFileSync("git", ["remote"], { cwd: target, encoding: "utf8" })
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean)[0] || null;
  } catch {
    /* not fatal: a local-only repo still works as a versioned folder */
  }
  return gitDriver({ root: target, remote });
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

async function reviewCommand(sub) {
  const { runPass, readState, writeState } = await import("./lib/pass.js");
  const proposals = await import("./lib/proposals.js");

  if (sub === "redactions") {
    const { redaction } = readState();
    if (!redaction) {
      console.log("No pass has run yet.");
      return;
    }
    // Counts and rule names only — printing the match would recreate the leak.
    console.log(`Scanned ${redaction.scanned} turn(s): ${redaction.dropped} dropped, ${redaction.normalized} normalized.`);
    for (const [rule, count] of Object.entries(redaction.byRule)) {
      console.log(`  ${rule}: ${count}`);
    }
    return;
  }

  const result = runPass();
  const state = readState();

  for (const q of result.quarantined) {
    console.warn(`! reader "${q.reader}" quarantined: ${q.reason}`);
  }

  const { proposals: batch, reason } = proposals.dueProposals({ lastBatchAt: state.lastBatchAt });
  if (!batch.length) {
    console.log(
      reason === "throttled"
        ? "Nothing to review right now — already asked in the last day."
        : `Nothing new to review. Scanned ${result.scanned} turn(s) from your history.`
    );
    return;
  }

  console.log(proposals.renderBatch(batch));
  console.log(
    "Nothing has been written to your profile. Answering happens in your agent,\n" +
      "or run this again after your next session."
  );
  writeState({ ...state, lastBatchAt: Date.now() });
}

/**
 * Record the developer's answer to a proposal.
 * Every path from a candidate to the profile runs through here, and every one
 * of them requires an answer the developer actually gave.
 */
async function answerCommand(key, verdict, rest) {
  const proposals = await import("./lib/proposals.js");

  const candidate = proposals.loadCandidates().find((c) => c.key === key);
  if (!candidate) {
    console.error(`No pending proposal with key "${key}". Run \`specificity review\` first.`);
    process.exit(1);
  }

  switch (verdict) {
    case "y":
    case "yes":
    case "add":
      proposals.accept(candidate);
      console.log(`Added to ${candidate.section}.`);
      break;
    case "e":
    case "edit": {
      const text = rest.join(" ").trim();
      if (!text) {
        console.error('Usage: specificity answer <key> edit "your wording"');
        process.exit(1);
      }
      proposals.accept(candidate, { text });
      console.log(`Added to ${candidate.section}, in your words.`);
      break;
    }
    case "n":
    case "no":
      proposals.decline(candidate);
      console.log("Left it. You'll only see it again if the evidence doubles.");
      break;
    case "never":
      proposals.never(candidate);
      console.log("Won't suggest that again.");
      break;
    case "k":
    case "keep":
      proposals.keepMine(candidate);
      console.log("Kept what you said. Noted that the observation disagrees.");
      break;
    default:
      console.error("Verdict must be one of: y, n, never, k, edit");
      process.exit(1);
  }
}

/** Machine-readable pending proposals, for an agent to render in-session. */
async function pendingCommand() {
  const { runPass, readState } = await import("./lib/pass.js");
  const { dueProposals } = await import("./lib/proposals.js");

  runPass();
  const { proposals, reason } = dueProposals({ lastBatchAt: readState().lastBatchAt });
  console.log(JSON.stringify({ reason, proposals }, null, 2));
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
  case "review":
    await reviewCommand(args[1]);
    break;
  case "pending":
    await pendingCommand();
    break;
  case "answer":
    await answerCommand(args[1], args[2], args.slice(3));
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
