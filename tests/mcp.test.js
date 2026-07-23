// Tests for specificity-mcp server
// Note: MCP SDK is in specificity-mcp/node_modules, so we test the server
// by spawning it and checking its tool list, plus test parsing logic directly.

import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specificity-mcp-test-"));
process.env.SPECIFICITY_PROFILE_DIR = tmpDir;

// Create test profile
fs.writeFileSync(
  path.join(tmpDir, "PROFILE.md"),
  `# Specificity Profile — test\n\n## Phrase Map\n"soon come" → low urgency, not immediate\n`
);
fs.writeFileSync(
  path.join(tmpDir, "EXPERIENCE.md"),
  `# Specificity Experience — test\n\n## Stack\n- Vue/Nuxt: fluent, preferred, growing — default\n- React: competent, tolerated, rusty — only if required\n`
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

// Test phrase map parsing (mirrors the logic in index.js)
test("Phrase map parsing works", () => {
  const profile = fs.readFileSync(path.join(tmpDir, "PROFILE.md"), "utf8");
  const section = profile.match(/## Phrase Map\n([\s\S]*?)(?=\n## |\n## |$)/i);
  const phrases = section[1]
    .split("\n")
    .filter((line) => line.includes("→"))
    .map((line) => {
      const match = line.match(/"([^"]+)"\s*→\s*(.+)/);
      return match ? { phrase: match[1], intent: match[2].trim() } : null;
    })
    .filter(Boolean);
  test("Phrase map has 1 entry", () => {
    if (phrases.length !== 1) throw new Error(`Expected 1 phrase, got ${phrases.length}`);
  });
  test("Phrase map entry is correct", () => {
    if (phrases[0].phrase !== "soon come") throw new Error("Wrong phrase");
    if (!phrases[0].intent.includes("low urgency")) throw new Error("Wrong intent");
  });
});

// Test stack parsing
test("Stack parsing works", () => {
  const experience = fs.readFileSync(path.join(tmpDir, "EXPERIENCE.md"), "utf8");
  const section = experience.match(/## Stack\n([\s\S]*?)(?=\n## |\n## |$)/i);
  const stack = section[1]
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const match = line.match(/^- (.+?): (.+?), (.+?), (.+) — (.+)$/);
      return match ? { tech: match[1], proficiency: match[2], preference: match[3], trajectory: match[4], note: match[5] } : null;
    })
    .filter(Boolean);
  test("Stack has 2 entries", () => {
    if (stack.length !== 2) throw new Error(`Expected 2 stack entries, got ${stack.length}`);
  });
  test("Vue is preferred", () => {
    const vue = stack.find((s) => s.tech === "Vue/Nuxt");
    if (!vue || vue.preference !== "preferred") throw new Error("Vue should be preferred");
  });
});

// Test MCP server starts and lists tools
test("MCP server lists tools", (done) => {
  const serverPath = path.join(process.cwd(), "specificity-mcp", "index.js");
  const child = spawn("node", [serverPath], {
    env: { ...process.env, SPECIFICITY_PROFILE_DIR: tmpDir },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
    // MCP servers send JSON-RPC messages; look for tool list
    if (output.includes("get_profile") && output.includes("get_phrase_intent")) {
      child.kill();
      test("Server exposes get_profile tool", () => {
        if (!output.includes("get_profile")) throw new Error("Missing get_profile");
      });
      test("Server exposes get_phrase_intent tool", () => {
        if (!output.includes("get_phrase_intent")) throw new Error("Missing get_phrase_intent");
      });
      test("Server exposes get_stack_preference tool", () => {
        if (!output.includes("get_stack_preference")) throw new Error("Missing get_stack_preference");
      });
      test("Server exposes propose_correction tool", () => {
        if (!output.includes("propose_correction")) throw new Error("Missing propose_correction");
      });
      done();
    }
  });

  child.on("error", (err) => {
    done(new Error(`Server failed to start: ${err.message}`));
  });

  // Timeout after 3 seconds
  setTimeout(() => {
    if (!output.includes("get_profile")) {
      child.kill();
      done(new Error("Server did not list tools in time"));
    }
  }, 3000);
}, 5000);

// Cleanup
setTimeout(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}, 1000);
