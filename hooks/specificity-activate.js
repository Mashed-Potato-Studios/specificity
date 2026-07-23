#!/usr/bin/env node
// specificity — Claude Code SessionStart activation hook
//
// Runs on every session start:
//   1. Writes flag file marking specificity active
//   2. Emits specificity ruleset + developer profile as hidden SessionStart context

const { hasProfile } = require('./specificity-config');
const { getSpecificityInstructions } = require('./specificity-instructions');
const { setMode, clearMode, writeHookOutput } = require('./specificity-runtime');

const mode = 'active';

// If no profile exists, don't activate — just nudge
if (!hasProfile()) {
  clearMode();
  writeHookOutput('SessionStart', 'off',
    'No Specificity profile found. Run `/specificity-setup` to build one — one interview, works globally. Until then, specificity is inactive.');
  process.exit(0);
}

// 1. Write flag file
try {
  setMode(mode);
} catch (e) {
  // Silent fail -- flag is best-effort
}

// 2. Emit the specificity ruleset + profile context
let output = getSpecificityInstructions();

try {
  writeHookOutput('SessionStart', mode, output);
} catch (e) {
  // Silent fail
}
