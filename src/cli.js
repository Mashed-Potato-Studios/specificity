#!/usr/bin/env node
// specificity — CLI for managing the developer profile
//
// Commands:
//   specificity profile          Show current profile
//   specificity profile reset    Reset (delete) profile + experience
//   specificity install          Show install instructions
//   specificity version          Show version

import fs from "fs";
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
  specificity install          Show install instructions
  specificity version          Show version

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

const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case "profile":
    if (args[1] === "reset") resetProfile();
    else showProfile();
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
