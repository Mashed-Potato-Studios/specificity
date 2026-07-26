#!/usr/bin/env node
// specificity — Claude Code SessionStart activation hook
//
// Runs on every session start:
//   1. Writes flag file marking specificity active
//   2. Emits specificity ruleset + developer profile as hidden SessionStart context

import { hasProfile } from "./specificity-config.js";
import { getSpecificityInstructions } from "./specificity-instructions.js";
import { setMode, clearMode, writeHookOutput } from "./specificity-runtime.js";

const mode = "active";

// If no profile exists, don't activate — just nudge
if (!hasProfile()) {
  clearMode();
  writeHookOutput("SessionStart", "off",
    "No Specificity profile found. Run `/specificity-setup` to build one — one interview, works globally. Until then, specificity is inactive.");
  process.exit(0);
}

// 1. Write flag file
try {
  setMode(mode);
} catch (e) {
  // Silent fail -- flag is best-effort
}

// 2. Run the observation pass. Measured at ~0.4s over a full history, and
//    cursors make repeat runs milliseconds, so this is cheap enough to do on
//    every session start. It only stages candidates — nothing is written to
//    the profile without the developer answering.
try {
  const { runPass } = await import("../src/lib/pass.js");
  runPass();
} catch (e) {
  // Observation is a bonus, never a reason a session fails to start.
}

// 3. Emit the specificity ruleset + profile context
let output = getSpecificityInstructions();

try {
  writeHookOutput("SessionStart", mode, output);
} catch (e) {
  // Silent fail
}
