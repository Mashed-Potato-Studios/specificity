#!/usr/bin/env node
// specificity — UserPromptSubmit hook to track activation state
// Inspects user input for /specificity commands and writes mode to flag file

import { hasProfile, isDeactivationCommand } from "./specificity-config.js";
import { clearMode, isQoder, readMode, setMode, writeHookOutput } from "./specificity-runtime.js";
import { getSpecificityInstructions } from "./specificity-instructions.js";

let input = "";
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    const data = JSON.parse(input.replace(/^\uFEFF/, ""));
    const prompt = (data.prompt || "").trim().toLowerCase();

    let modeSwitched = false;
    let deactivated = false;

    // Match /specificity commands
    if (/^[/@$]specificity/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, "/");

      if (cmd === "/specificity-setup" || cmd === "/specificity:specificity-setup") {
        // setup writes the profile — activate after
        if (hasProfile()) {
          setMode("active");
          modeSwitched = true;
          writeHookOutput("UserPromptSubmit", "active",
            "SPECIFICITY MODE ACTIVE — profile loaded. The agent now understands you across all projects.");
        }
        return;
      }

      if (cmd === "/specificity-off" || cmd === "/specificity:off") {
        clearMode();
        deactivated = true;
        writeHookOutput("UserPromptSubmit", "off", "SPECIFICITY MODE OFF");
        return;
      }
    }

    // Detect deactivation
    if (!modeSwitched && !deactivated && isDeactivationCommand(prompt)) {
      clearMode();
      deactivated = true;
      writeHookOutput("UserPromptSubmit", "off", "SPECIFICITY MODE OFF");
    }

    // Qoder has no SessionStart event, so UserPromptSubmit does double duty:
    // activate on first prompt (if no flag exists yet), then inject on every prompt.
    if (isQoder && !deactivated) {
      let currentMode = readMode();
      if (!currentMode && hasProfile()) {
        setMode("active");
        currentMode = "active";
      }
      if (currentMode && currentMode !== "off") {
        const header = modeSwitched
          ? "SPECIFICITY MODE ACTIVE — profile loaded.\n\n"
          : "";
        writeHookOutput("UserPromptSubmit", currentMode, header + getSpecificityInstructions());
      }
    }
  } catch (e) {
    // Silent fail
  }
}

process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", finish);
process.stdin.on("error", () => { finish(); process.exit(0); });
setTimeout(() => { finish(); process.exit(0); }, 1000).unref();
