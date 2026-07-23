// specificity-mcp — profile store: read, parse, validate, append.
//
// Single source of truth for the on-disk format defined in
// docs/PROFILE-CONVENTION.md. The reader is deliberately TOLERANT (accepts
// smart/straight quotes, ->/→, em-dash/en-dash/hyphen note separators) so an
// LLM-authored line is never silently dropped; the validator is STRICT and
// the writer NORMALIZES to the canonical form, so what lands on disk is always
// convention-clean regardless of how it was typed.

import fs from "fs";
import path from "path";
import os from "os";

const PREFERENCES = ["preferred", "fine", "tolerated", "avoid"];
const TRAJECTORIES = ["fluent", "growing", "learning", "rusty"];

export function getProfileDir() {
  return process.env.SPECIFICITY_PROFILE_DIR || path.join(os.homedir(), ".specificity");
}
export function getProfilePath() {
  return path.join(getProfileDir(), "PROFILE.md");
}
export function getExperiencePath() {
  return path.join(getProfileDir(), "EXPERIENCE.md");
}

function read(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}
export const readProfile = () => read(getProfilePath());
export const readExperience = () => read(getExperiencePath());

// --- parsing (tolerant) ---------------------------------------------------

export function parseSection(content, sectionName) {
  if (!content) return null;
  // Anchor the header to line start via (?:^|\n) so `### X` or a mid-line
  // `## X` inside prose can't be mistaken for the `## X` section header —
  // matching upsertLine's own anchored section detection. NB: no `m` flag,
  // so `$` in the section-end lookahead stays end-of-string, not end-of-line.
  const regex = new RegExp(`(?:^|\\n)## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

// Accepts straight ("...") or smart (“...”) quotes and -> or → arrows.
const PHRASE_RE = /["“]([^"”]+)["”]\s*(?:→|->)\s*(.+)/;

export function parsePhraseMap(content) {
  const section = parseSection(content, "Phrase Map");
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => {
      const m = line.match(PHRASE_RE);
      return m ? { phrase: m[1].trim(), intent: m[2].trim() } : null;
    })
    .filter(Boolean);
}

// Accepts em-dash (—), en-dash (–), or a spaced hyphen ( - ) before the note.
const STACK_RE = /^-\s+(.+?):\s+([^,]+?),\s+([^,]+?),\s+(.+?)\s+(?:—|–|-)\s+(.+)$/;

export function parseStack(content) {
  const section = parseSection(content, "Stack");
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => {
      const m = line.match(STACK_RE);
      if (!m) return null;
      return {
        tech: m[1].trim(),
        proficiency: m[2].trim(),
        preference: m[3].trim(),
        trajectory: m[4].trim(),
        note: m[5].trim(),
      };
    })
    .filter(Boolean);
}

// --- validation (strict) + normalization ----------------------------------

// A phrase correction may be given as a full `"phrase" → intent` line, or the
// caller may pass phrase/intent already split — we accept the line form here.
export function validatePhrase(content) {
  const m = String(content).match(PHRASE_RE);
  if (!m) {
    return { ok: false, error: 'Expected: "<what they said>" → <what they meant>' };
  }
  const phrase = m[1].trim();
  const intent = m[2].trim();
  if (!phrase || !intent) {
    return { ok: false, error: "Both the phrase and its intent must be non-empty." };
  }
  return { ok: true, key: phrase.toLowerCase(), line: `"${phrase}" → ${intent}` };
}

export function validateStack(content) {
  const m = String(content).match(STACK_RE);
  if (!m) {
    return {
      ok: false,
      error: "Expected: - <tech>: <proficiency>, <preference>, <trajectory> — <note>",
    };
  }
  const [tech, proficiency, preference, trajectory, note] = [m[1], m[2], m[3], m[4], m[5]].map((s) => s.trim());
  if (!PREFERENCES.includes(preference)) {
    return { ok: false, error: `preference must be one of ${PREFERENCES.join(", ")} (got "${preference}")` };
  }
  if (!TRAJECTORIES.includes(trajectory)) {
    return { ok: false, error: `trajectory must be one of ${TRAJECTORIES.join(", ")} (got "${trajectory}")` };
  }
  return {
    ok: true,
    key: tech.toLowerCase(),
    line: `- ${tech}: ${proficiency}, ${preference}, ${trajectory} — ${note}`,
  };
}

// Validate a correction of either kind. Returns
// { ok, error?, section, line, key }.
export function validateCorrection(type, content) {
  if (type === "phrase") {
    return { section: "Phrase Map", ...validatePhrase(content) };
  }
  if (type === "stack") {
    return { section: "Stack", ...validateStack(content) };
  }
  return { ok: false, error: `Unknown correction type "${type}" (expected "phrase" or "stack").` };
}

// --- append / upsert -------------------------------------------------------

// Atomic write: the profile is the user's only, un-backed-up copy, so never
// leave it half-written. Write a sibling temp file then rename (atomic on the
// same filesystem) so a crash mid-write can't truncate it.
function writeAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

// Upsert one canonical line into a section. If an entry with the same key
// already exists it is replaced (add-or-update); otherwise the line is
// appended at the end of the section. Creates the section if absent.
// keyOf(existingLine) -> normalized key string, so we can detect duplicates.
function upsertLine(filePath, section, line, key, keyOf) {
  const original = read(filePath) ?? "";
  const lines = original.split("\n");

  const headerIdx = lines.findIndex((l) => new RegExp(`^##\\s+${section}\\s*$`, "i").test(l));

  if (headerIdx === -1) {
    const prefix = original.trim().length ? original.replace(/\n*$/, "") + "\n\n" : "";
    writeAtomic(filePath, `${prefix}## ${section}\n${line}\n`);
    return { action: "created-section", line };
  }

  // Section body runs until the next "## " header or EOF.
  let end = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }

  // Replace an existing entry with the same key.
  for (let i = headerIdx + 1; i < end; i++) {
    const k = keyOf(lines[i]);
    if (k !== null && k === key) {
      lines[i] = line;
      writeAtomic(filePath, lines.join("\n"));
      return { action: "updated", line };
    }
  }

  // Insert after the last non-empty line of the section.
  let insertAt = headerIdx + 1;
  for (let i = headerIdx + 1; i < end; i++) {
    if (lines[i].trim().length) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, line);
  writeAtomic(filePath, lines.join("\n"));
  return { action: "appended", line };
}

// Write a validated correction to disk. Caller MUST have obtained user
// confirmation first — this is the write side of the trust boundary.
// Returns { ok, action?, line?, error? }.
export function applyCorrection(type, content) {
  const v = validateCorrection(type, content);
  if (!v.ok) return { ok: false, error: v.error };

  if (type === "phrase") {
    const result = upsertLine(getProfilePath(), "Phrase Map", v.line, v.key, (l) => {
      const m = l.match(PHRASE_RE);
      return m ? m[1].trim().toLowerCase() : null;
    });
    return { ok: true, ...result };
  }

  const result = upsertLine(getExperiencePath(), "Stack", v.line, v.key, (l) => {
    const m = l.match(STACK_RE);
    return m ? m[1].trim().toLowerCase() : null;
  });
  return { ok: true, ...result };
}
