// Bridge from the MCP surface to the observation loop.
//
// The pass stages proposals; every surface renders them. This is the surface
// for hosts that take context only through tool calls — no hooks, no skills.
// The loop's rules live in src/lib/proposals.js; nothing is re-implemented here.
import { runPass, readState, writeState } from "../../src/lib/pass.js";
import { dueProposals, loadCandidates, applyVerdict, renderBatch } from "../../src/lib/proposals.js";

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

  // One implementation of the answer semantics, shared with the CLI. These
  // two surfaces had already drifted once: the bridge refused `keep` without a
  // contradiction while the CLI accepted it and recorded an empty tension.
  return applyVerdict(candidate, verdict, { text });
}
