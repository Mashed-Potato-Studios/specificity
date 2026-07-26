// Secret and identity redaction, applied on read before anything is persisted.
// Spec: docs/SPEC-V2.md — "Redaction".
//
// Fail closed: when in doubt, drop. A lost candidate costs nothing; a leaked
// credential is unrecoverable.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const RULESET = JSON.parse(fs.readFileSync(path.join(HERE, "redaction-rules.json"), "utf8"));

export const RULESET_VERSION = RULESET.version;

// Rules are written in the portable form the public rulesets use, which allows
// a leading (?i). JS has no inline flags, so translate it to a real flag.
const RULES = RULESET.rules.map((rule) => {
  const caseInsensitive = rule.pattern.startsWith("(?i)");
  return {
    ...rule,
    regex: new RegExp(
      caseInsensitive ? rule.pattern.slice(4) : rule.pattern,
      caseInsensitive ? "gi" : "g"
    ),
  };
});

/** Shannon entropy in bits per character. */
export function entropy(text) {
  if (!text.length) return 0;
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * A long, high-entropy, unbroken token is treated as a credential even when no
 * rule names it. Deliberately conservative about what counts: real prose and
 * hex hashes shouldn't trip it, but anything that looks like a random secret
 * should.
 */
const HIGH_ENTROPY_MIN_LENGTH = 24;
const HIGH_ENTROPY_BITS = 4.0;

/**
 * Paths and URLs are long, mixed-case and full of digits, so they trip an
 * entropy test while being exactly the ordinary prose we must keep. Named
 * credential rules already cover secrets that appear inside a URL
 * (connection-string) or an assignment, so skipping these here does not open a
 * hole — it stops the heuristic from eating the corpus.
 */
function isPathLike(token) {
  return /^[~./]/.test(token) || token.includes("://") || token.includes("\\");
}

export function looksLikeSecret(token) {
  if (token.length < HIGH_ENTROPY_MIN_LENGTH) return false;
  if (isPathLike(token)) return false;
  if (/^[0-9a-f]+$/i.test(token)) return false; // hashes, ids, git SHAs
  if (/^[0-9]+$/.test(token)) return false;
  if (!/[0-9]/.test(token) || !/[A-Za-z]/.test(token)) return false;
  return entropy(token) >= HIGH_ENTROPY_BITS;
}

/**
 * Scan one turn of the developer's own words.
 *
 * Returns `{ action, text, findings }`:
 *  - action "drop" — a credential was found. The whole turn is discarded from
 *    quoting *and* counting, so nothing derived from it can survive. Dropping
 *    rather than masking the span is deliberate: a partially-redacted turn
 *    still surrounds the secret with identifying context, and span-redaction
 *    trusts the matcher to have found every occurrence.
 *  - action "keep" — text is returned with identity spans normalized.
 *
 * `findings` names rules only, never matched content.
 */
export function scanTurn(input) {
  const findings = [];
  let text = String(input ?? "");

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    if (rule.tier !== "credential") continue;
    if (rule.regex.test(text)) {
      findings.push({ rule: rule.name, tier: "credential" });
      return { action: "drop", text: null, findings };
    }
  }

  // Identity spans are normalized before the entropy sweep, so a home path is
  // already collapsed to `~/...` and cannot be mistaken for a random token.
  const identityFindings = [];
  for (const rule of RULES) {
    if (rule.tier !== "identity") continue;
    rule.regex.lastIndex = 0;
    if (rule.regex.test(text)) {
      rule.regex.lastIndex = 0;
      text = text.replace(rule.regex, rule.replacement ?? "[redacted]");
      identityFindings.push({ rule: rule.name, tier: "identity" });
    }
  }

  for (const token of text.split(/\s+/)) {
    if (looksLikeSecret(token)) {
      findings.push({ rule: "high-entropy-token", tier: "credential" });
      return { action: "drop", text: null, findings };
    }
  }

  findings.push(...identityFindings);
  return { action: "keep", text, findings };
}

/** Aggregate counts for `specificity redactions` — rule names, never content. */
export function summarize(results) {
  const summary = { scanned: 0, dropped: 0, normalized: 0, byRule: {} };
  for (const result of results) {
    summary.scanned++;
    if (result.action === "drop") summary.dropped++;
    else if (result.findings.length) summary.normalized++;
    for (const finding of result.findings) {
      summary.byRule[finding.rule] = (summary.byRule[finding.rule] || 0) + 1;
    }
  }
  return summary;
}
