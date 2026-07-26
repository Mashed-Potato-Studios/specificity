// specificity-mcp — tool definitions + pure dispatch.
//
// Kept free of the MCP transport so the handler (including the apply_correction
// trust-boundary gate) is unit-testable by direct import, not only over stdio.

import {
  readProfile,
  readExperience,
  getProfilePath,
  getExperiencePath,
  parsePhraseMap,
  parseStack,
  validateCorrection,
  applyCorrection,
} from "./profile.js";
import { pendingProposals, recordAnswer, renderProposalBatch } from "./proposals-bridge.js";

export const TOOLS = [
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
      properties: { phrase: { type: "string", description: "The phrase to look up" } },
      required: ["phrase"],
    },
  },
  {
    name: "get_stack_preference",
    description: "Get the developer's preference for a specific technology or framework",
    inputSchema: {
      type: "object",
      properties: { tech: { type: "string", description: "Technology name (e.g. 'Vue', 'React', 'Go')" } },
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
    description: "STEP 1 of learning: validate a proposed phrase-intent or stack entry and return a normalized preview to SHOW THE DEVELOPER. Writes nothing. After the developer approves, call apply_correction with confirmed:true.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["phrase", "stack"], description: "Whether this is a phrase map or stack correction" },
        content: { type: "string", description: "The proposed entry (e.g. '\"phrase\" → intent' or '- tech: proficiency, preference, trajectory — note')" },
      },
      required: ["type", "content"],
    },
  },
  {
    name: "apply_correction",
    description: "STEP 2 of learning: append (or update) a validated entry to the developer's profile on disk. GATED — only call with confirmed:true AFTER the developer has explicitly approved the exact line from propose_correction. Never set confirmed:true from your own inference; the developer's own words are the only authority for profile writes.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["phrase", "stack"], description: "Whether this is a phrase map or stack correction" },
        content: { type: "string", description: "The exact entry the developer approved" },
        confirmed: { type: "boolean", description: "Must be true. Set only after the developer explicitly approved this line." },
      },
      required: ["type", "content", "confirmed"],
    },
  },
  {
    name: "get_pending_proposals",
    description:
      "Get what Specificity has noticed about the developer and is waiting to ask about. Runs the observation pass and returns the throttled batch — show it to the developer at the END of a session, never mid-task. Returns nothing when throttled or when there is nothing new; that silence is the correct output most sessions. Writes no profile facts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "answer_proposal",
    description:
      "GATED — record the developer's answer to a proposal from get_pending_proposals. Only call with confirmed:true AFTER the developer has explicitly answered. Never infer the answer. 'y' adds the fact, 'n' defers it until the evidence doubles, 'never' retires the suggestion, 'edit' stores the developer's own wording, and 'keep' (contradictions only) leaves what they stated standing while recording the disagreement.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The proposal's key, from get_pending_proposals" },
        verdict: {
          type: "string",
          enum: ["y", "n", "never", "keep", "edit"],
          description: "What the developer answered",
        },
        text: { type: "string", description: "Required for 'edit': the developer's own wording" },
        confirmed: {
          type: "boolean",
          description: "Must be true. Set only after the developer explicitly gave this answer.",
        },
      },
      required: ["key", "verdict", "confirmed"],
    },
  },
];

const text = (t) => ({ content: [{ type: "text", text: t }] });

// Pure dispatch: (toolName, argsObject) -> MCP content result. No transport.
export function callTool(name, args = {}) {
  switch (name) {
    case "get_profile":
      return text(readProfile() || "No profile found. Run /specificity-setup");

    case "get_experience":
      return text(readExperience() || "No experience profile found. Run /specificity-experience");

    case "get_phrase_intent": {
      const match = parsePhraseMap(readProfile()).find(
        (p) => p.phrase.toLowerCase() === String(args.phrase || "").toLowerCase()
      );
      return text(
        match
          ? `Intent: ${match.intent}`
          : `No mapping found for "${args.phrase}". Run /specificity-dialect to add one.`
      );
    }

    case "get_stack_preference": {
      const entry = parseStack(readExperience()).find(
        (s) => s.tech.toLowerCase() === String(args.tech || "").toLowerCase()
      );
      return text(
        entry
          ? `${entry.tech}: ${entry.proficiency}, ${entry.preference}, ${entry.trajectory} — ${entry.note}`
          : `No stack entry for "${args.tech}". Run /specificity-experience to add one.`
      );
    }

    case "get_preferred_stack": {
      const order = ["preferred", "fine", "tolerated", "avoid"];
      const stack = parseStack(readExperience());
      const ranked = order.flatMap((pref) => stack.filter((s) => s.preference === pref));
      return text(ranked.map((s) => `${s.tech}: ${s.preference} (${s.trajectory})`).join("\n"));
    }

    case "propose_correction": {
      const v = validateCorrection(args.type, args.content);
      if (!v.ok) return text(`Invalid ${args.type} entry: ${v.error}`);
      const filePath = args.type === "phrase" ? getProfilePath() : getExperiencePath();
      return text(
        `Proposed ${v.section} entry:\n\n${v.line}\n\n` +
          `SHOW this exact line to the developer. If they approve, call apply_correction ` +
          `with confirmed:true to write it to ${filePath}. Nothing has been written yet.`
      );
    }

    case "apply_correction": {
      if (!args.confirmed) {
        return text(
          "Not written: confirmed is not true. Show the developer the proposed line and only set confirmed:true after they explicitly approve it."
        );
      }
      const result = applyCorrection(args.type, args.content);
      if (!result.ok) return text(`Not written — invalid ${args.type} entry: ${result.error}`);
      const verb = result.action === "updated" ? "Updated" : "Added";
      return text(`${verb} in ${args.type === "phrase" ? "PROFILE.md" : "EXPERIENCE.md"}:\n${result.line}`);
    }

    case "get_pending_proposals": {
      const { proposals, reason } = pendingProposals();
      if (!proposals.length) {
        return text(
          reason === "throttled"
            ? "Nothing to show — the developer was already asked within the last day. Say nothing about this."
            : "Nothing new has been noticed. Say nothing about this."
        );
      }
      return text(
        `${renderProposalBatch(proposals)}\n` +
          `Show this to the developer at the END of the session, not mid-task. ` +
          `Nothing has been written. When they answer, call answer_proposal with ` +
          `confirmed:true and the matching key.\n\n` +
          `Keys: ${proposals.map((p) => p.key).join(", ")}`
      );
    }

    case "answer_proposal": {
      if (!args.confirmed) {
        return text(
          "Not recorded: confirmed is not true. Show the proposal to the developer and only set confirmed:true after they explicitly answer."
        );
      }
      const result = recordAnswer(args.key, args.verdict, args.text);
      return text(result.ok ? result.message : `Not recorded — ${result.error}`);
    }

    default:
      return text(`Unknown tool: ${name}`);
  }
}
