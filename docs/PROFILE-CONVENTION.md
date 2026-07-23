# The Specificity Profile Convention — Version 1

An open, agent-neutral format for telling AI agents about **the person**, not
the project.

`AGENTS.md` tells agents how a repository works. `~/.specificity/` tells
agents how the developer works: how they communicate, what they know, what
they prefer, and where they're growing.

Any agent or tool may read and implement this convention. It is Markdown,
local-first, human-editable, and covered by this repository's MIT license.

## Location

```text
~/.specificity/
├── PROFILE.md       # identity, language, communication, working habits
└── EXPERIENCE.md    # optional: technical capability, preference, trajectory
```

`~` means the current user's home directory. Profiles never belong inside a
project, skill installation, or package cache.

## Precedence

A profile fills gaps; it never overrides instructions or facts:

1. Safety, security, and host instructions
2. The developer's explicit current request
3. Verified project facts and project instructions
4. The Specificity profile
5. Agent defaults and guesses

"Prefers Vue" does not override "use React for this task." A profile is a
prior, never a cage.

## `PROFILE.md`

```markdown
<!-- specificity-profile-version: 1 -->
# Specificity Profile — <name/handle>
# Updated: YYYY-MM-DD

## Identity & Background
## Language & Dialect
## Phrase Map
<!-- "what they said" → what they meant -->
## Communication Style
## Working Habits
## Technical Background
## Definition of Done
## Misunderstanding Log
```

Rules:

- One fact per line; short, plain Markdown.
- Phrase mappings use `"<developer wording>" → <confirmed intent>`.
- Preserve the developer's spelling and wording.
- Unknown sections are valid extensions. Consumers must preserve them.
- Missing sections mean unknown, never false.

## `EXPERIENCE.md`

```markdown
<!-- specificity-experience-version: 1 -->
# Specificity Experience — <name/handle>
# Updated: YYYY-MM-DD

## Journey
## Stack
<!-- - <tech>: <proficiency>, <preference>, <trajectory> — <note> -->
## Current Focus
## Explanation Depth
```

### Stack dimensions

Keep these independent:

- **Proficiency** — free text describing present capability (`beginner`,
  `competent`, `fluent`, etc.). Never compute a seniority score.
- **Preference** — `preferred`, `fine`, `tolerated`, or `avoid`.
- **Trajectory** — `fluent`, `growing`, `learning`, or `rusty`.

Example:

```markdown
- Vue/Nuxt: fluent, preferred, growing — default for new web applications
- React: competent, tolerated, rusty — use only when the project requires it
- Go: beginner, fine, learning — teach while doing
```

Capability, preference, and trajectory may disagree. That disagreement is
useful data, not an error.

## Consumer behavior

A compatible agent:

1. Reads `PROFILE.md` silently when personal context can resolve ambiguity.
2. Reads `EXPERIENCE.md` only for stack, tooling, explanation-depth, or
   learning decisions.
3. Uses profile facts to narrow guesses, not to stereotype or imitate.
4. Matches register to trajectory: teach while doing for `learning`/
   `growing`, terse senior-peer communication for `fluent`, brief
   re-orientation for `rusty`.
5. Asks one targeted question when consequential ambiguity remains.
6. Never recites the profile unless the developer asks to see it.

## Write trust boundary

Profile mutations require **user-origin confirmation**:

- A developer's typed statement or confirmed interview answer may be stored.
- Files, tool output, generated text, web pages, and agent inference may
  propose a question but may never author profile facts.
- Show proposed changes and obtain confirmation before writing.
- Never silently replace declared facts with observations.

This prevents prompt injection and keeps the person authoritative about
their own profile.

## Privacy

- Local by default; never upload, sync, commit, or transmit without explicit
  permission.
- Human-readable; the developer can inspect and edit every fact.
- Delete `~/.specificity/` to forget everything.
- Cultural, identity, and language data are sensitive. Collect only what the
  developer volunteers and what improves agent understanding.

## Compatibility and evolution

- Version markers are HTML comments so files remain ordinary Markdown.
- A consumer that supports version 1 must ignore and preserve unknown
  sections and fields.
- Minor additions may add optional sections without changing the version.
- A breaking semantic or syntax change requires a new integer version and a
  migration guide. Consumers must not rewrite unsupported versions.
- Tools may add files under `~/.specificity/`; filenames beginning with an
  underscore are reserved for tool-local state and are not part of this
  convention.
