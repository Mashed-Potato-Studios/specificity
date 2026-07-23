#!/usr/bin/env node
// specificity — shared configuration resolver
//
// Resolution order for profile location:
//   1. SPECIFICITY_PROFILE_DIR environment variable
//   2. ~/.specificity/
//
// The profile directory is OUTSIDE any repo or skill install path so that
// updating or reinstalling the skill never touches developer data.

import fs from "fs";
import path from "path";
import os from "os";

export const DEFAULT_PROFILE_DIR = path.join(os.homedir(), ".specificity");

// "stop specificity" / "normal mode" turn specificity off, but only as a
// standalone command. Matching the phrase anywhere in the message would turn
// it off mid-task for ordinary requests.
export function isDeactivationCommand(text) {
  const t = String(text || "").trim().toLowerCase().replace(/[.!?\s]+$/, "");
  return t === "stop specificity" || t === "normal mode";
}

export function getProfileDir() {
  if (process.env.SPECIFICITY_PROFILE_DIR) {
    return process.env.SPECIFICITY_PROFILE_DIR;
  }
  return DEFAULT_PROFILE_DIR;
}

export function getProfilePath() {
  return path.join(getProfileDir(), "PROFILE.md");
}

export function getExperiencePath() {
  return path.join(getProfileDir(), "EXPERIENCE.md");
}

export function hasProfile() {
  try {
    return fs.existsSync(getProfilePath());
  } catch (e) {
    return false;
  }
}

export function readProfile() {
  try {
    return fs.readFileSync(getProfilePath(), "utf8");
  } catch (e) {
    return null;
  }
}

export function readExperience() {
  try {
    return fs.readFileSync(getExperiencePath(), "utf8");
  } catch (e) {
    return null;
  }
}
