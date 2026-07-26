// Bridge from the MCP surface to the observation loop.
//
// The pass stages proposals; every surface renders them. This is the surface
// for hosts that take context only through tool calls — no hooks, no skills.
// The loop's rules live in src/lib/proposals.js; nothing is re-implemented here.
import { runPass, readState, writeState } from "../../src/lib/pass.js";
import {
  dueProposals,
  loadCandidates,
  accept,
  decline,
  never,
  keepMine,
  renderBatch,
} from "../../src/lib/proposals.js";

export const renderProposalBatch = renderBatch;

/** Run the pass and return the throttled batch. Writes no profile facts. */
export function pendingProposals({ now = Date.now() } = {}) {
  runPass({ now });
  const state = readState();
  const result = dueProposals({ now, lastBatchAt: state.lastBatchAt });

  // Showing a batch starts the cooldown, so a host that asks twice in a
  // session doesn't ask the developer twice.
  if (result.proposals.length) writeState({ ...state, lastBatchAt: now });

  return result;
}

/**
 * Record an answer the developer actually gave.
 * Returns a result rather than throwing so the tool layer stays a thin shell.
 */
export function recordAnswer(key, verdict, text) {
  const candidate = loadCandidates().find((c) => c.key === key);
  if (!candidate) {
    return { ok: false, error: `no pending proposal with key "${key}"` };
  }

  switch (verdict) {
    case "y":
      accept(candidate);
      return { ok: true, message: `Added to ${candidate.section}.` };

    case "edit":
      if (!text || !text.trim()) {
        return { ok: false, error: "'edit' needs the developer's own wording in `text`" };
      }
      accept(candidate, { text: text.trim() });
      return { ok: true, message: `Added to ${candidate.section}, in the developer's words.` };

    case "n":
      decline(candidate);
      return { ok: true, message: "Deferred. It returns only if the evidence doubles." };

    case "never":
      never(candidate);
      return { ok: true, message: "Retired. That suggestion will not come back." };

    case "keep":
      if (!candidate.contradicts) {
        return { ok: false, error: "'keep' applies only to a proposal that disputes a stated fact" };
      }
      keepMine(candidate);
      return {
        ok: true,
        message: "Kept what the developer stated. The disagreement is recorded, not the replacement.",
      };

    default:
      return { ok: false, error: `unknown verdict "${verdict}"` };
  }
}
