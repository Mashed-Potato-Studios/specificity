#!/usr/bin/env node
// specificity-mcp — MCP server exposing the developer profile as tools
//
// Hosts that can only receive context via tools (no hooks) can query the
// profile on-demand. Also provides structured access for any agent that
// prefers tool calls over raw context injection.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import os from "os";

const PROFILE_DIR = process.env.SPECIFICITY_PROFILE_DIR || path.join(os.homedir(), ".specificity");
const PROFILE_PATH = path.join(PROFILE_DIR, "PROFILE.md");
const EXPERIENCE_PATH = path.join(PROFILE_DIR, "EXPERIENCE.md");

const { version } = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

const server = new Server(
  { name: "specificity-mcp", version },
  { capabilities: { tools: {} } }
);

function readProfile() {
  try {
    return fs.readFileSync(PROFILE_PATH, "utf8");
  } catch {
    return null;
  }
}

function readExperience() {
  try {
    return fs.readFileSync(EXPERIENCE_PATH, "utf8");
  } catch {
    return null;
  }
}

function parseSection(content, sectionName) {
  if (!content) return null;
  const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |\\n## |$)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function parsePhraseMap(content) {
  const section = parseSection(content, "Phrase Map");
  if (!section) return [];
  return section
    .split("\n")
    .filter((line) => line.includes("→"))
    .map((line) => {
      const match = line.match(/"([^"]+)"\s*→\s*(.+)/);
      return match ? { phrase: match[1], intent: match[2].trim() } : null;
    })
    .filter(Boolean);
}

function parseStack(content) {
  const section = parseSection(content, "Stack");
  if (!section) return [];
  return section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const match = line.match(/^- (.+?): (.+?), (.+?), (.+) — (.+)$/);
      if (!match) return null;
      return {
        tech: match[1],
        proficiency: match[2],
        preference: match[3],
        trajectory: match[4],
        note: match[5],
      };
    })
    .filter(Boolean);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_profile",
      description: "Get the full developer profile (who they are, how they talk, preferences)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_experience",
      description: "Get the developer's technical experience and stack preferences",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_phrase_intent",
      description: "Look up how a specific phrase or dialect expression maps to intent",
      inputSchema: {
        type: "object",
        properties: {
          phrase: { type: "string", description: "The phrase to look up" },
        },
        required: ["phrase"],
      },
    },
    {
      name: "get_stack_preference",
      description: "Get the developer's preference for a specific technology or framework",
      inputSchema: {
        type: "object",
        properties: {
          tech: { type: "string", description: "Technology name (e.g. 'Vue', 'React', 'Go')" },
        },
        required: ["tech"],
      },
    },
    {
      name: "get_preferred_stack",
      description: "Get all technologies ranked by preference (preferred first)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "propose_correction",
      description: "Propose adding or updating a phrase-intent mapping or stack entry. Returns the proposed change for user confirmation before writing.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["phrase", "stack"],
            description: "Whether this is a phrase map or stack correction",
          },
          content: {
            type: "string",
            description: "The proposed entry (e.g. '\"phrase\" → intent' or 'tech: proficiency, preference, trajectory — note')",
          },
        },
        required: ["type", "content"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const profile = readProfile();
  const experience = readExperience();

  switch (request.params.name) {
    case "get_profile":
      return {
        content: [{ type: "text", text: profile || "No profile found. Run /specificity-setup" }],
      };

    case "get_experience":
      return {
        content: [{ type: "text", text: experience || "No experience profile found. Run /specificity-experience" }],
      };

    case "get_phrase_intent": {
      const phrase = request.params.arguments.phrase;
      const phrases = parsePhraseMap(profile);
      const match = phrases.find(
        (p) => p.phrase.toLowerCase() === phrase.toLowerCase()
      );
      if (match) {
        return {
          content: [{ type: "text", text: `Intent: ${match.intent}` }],
        };
      }
      return {
        content: [{ type: "text", text: `No mapping found for "${phrase}". Run /specificity-dialect to add one.` }],
      };
    }

    case "get_stack_preference": {
      const tech = request.params.arguments.tech;
      const stack = parseStack(experience);
      const entry = stack.find(
        (s) => s.tech.toLowerCase() === tech.toLowerCase()
      );
      if (entry) {
        return {
          content: [{
            type: "text",
            text: `${tech}: ${entry.proficiency}, ${entry.preference}, ${entry.trajectory} — ${entry.note}`,
          }],
        };
      }
      return {
        content: [{ type: "text", text: `No stack entry for "${tech}". Run /specificity-experience to add one.` }],
      };
    }

    case "get_preferred_stack": {
      const stack = parseStack(experience);
      const ranked = stack
        .filter((s) => s.preference === "preferred")
        .concat(stack.filter((s) => s.preference === "fine"))
        .concat(stack.filter((s) => s.preference === "tolerated"))
        .concat(stack.filter((s) => s.preference === "avoid"));
      return {
        content: [{
          type: "text",
          text: ranked.map((s) => `${s.tech}: ${s.preference} (${s.trajectory})`).join("\n"),
        }],
      };
    }

    case "propose_correction": {
      const { type, content } = request.params.arguments;
      const filePath = type === "phrase" ? PROFILE_PATH : EXPERIENCE_PATH;
      const section = type === "phrase" ? "Phrase Map" : "Stack";

      // Check if profile exists
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `No ${type === "phrase" ? "profile" : "experience"} file found. Run /specificity-setup first.` }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `Proposed ${type} correction for ${section} in ${filePath}:\n\n${content}\n\nThis is a proposed change only. To apply it, confirm with the developer and append the line to the appropriate section. The profile is never auto-updated without explicit confirmation.`,
        }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
