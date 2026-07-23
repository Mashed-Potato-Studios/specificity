#!/usr/bin/env node
// specificity — shared configuration resolver
//
// Resolution order for profile location:
//   1. SPECIFICITY_PROFILE_DIR environment variable
//   2. ~/.specificity/
//
// The profile directory is OUTSIDE any repo or skill install path so that
// updating or reinstalling the skill never touches developer data.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.specificity');

// "stop specificity" / "normal mode" turn specificity off, but only as a
// standalone command. Matching the phrase anywhere in the message would turn
// it off mid-task for ordinary requests.
function isDeactivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
  return t === 'stop specificity' || t === 'normal mode';
}

function getProfileDir() {
  if (process.env.SPECIFICITY_PROFILE_DIR) {
    return process.env.SPECIFICITY_PROFILE_DIR;
  }
  return DEFAULT_PROFILE_DIR;
}

function getProfilePath() {
  return path.join(getProfileDir(), 'PROFILE.md');
}

function getExperiencePath() {
  return path.join(getProfileDir(), 'EXPERIENCE.md');
}

function hasProfile() {
  try {
    return fs.existsSync(getProfilePath());
  } catch (e) {
    return false;
  }
}

function readProfile() {
  try {
    return fs.readFileSync(getProfilePath(), 'utf8');
  } catch (e) {
    return null;
  }
}

function readExperience() {
  try {
    return fs.readFileSync(getExperiencePath(), 'utf8');
  } catch (e) {
    return null;
  }
}

module.exports = {
  DEFAULT_PROFILE_DIR,
  getProfileDir,
  getProfilePath,
  getExperiencePath,
  hasProfile,
  readProfile,
  readExperience,
  isDeactivationCommand,
};
