---
name: specificity-experience
description: Interview that maps the developer's technical experience and stack preferences — what they've used, what they're good at, what they PREFER — into a global profile the agent uses to bias every framework/library suggestion. Run once, or when your stack changes.
argument-hint: "Run once after setup, re-run when your stack changes"
disable-model-invocation: true
license: MIT
---

# Specificity Experience

Map the developer's technical journey and stack preferences through one
interview, then write it to `~/.specificity/EXPERIENCE.md`.

Why this exists: "can use React" and "prefers Vue" are different facts. An
agent that only knows capability will keep suggesting the wrong stack. This
profile records both, so suggestions default to what the developer actually
wants to work in.

If EXPERIENCE.md already exists, show it and ask: fresh interview, or amend
one stack?

## Interview protocol

Same three rules as `/specificity-setup`, held for the whole interview:

1. **One question at a time.**
2. **Every question ships with a recommended answer.**
3. **Facts get looked up, never asked** — package.json, Gemfile, go.mod,
   Cargo.toml, and git history in current and recent projects tell you most
   of the stack list. Confirm what's found; ask only what's missing.

Confirm each answer before moving on. Read the final profile back in one
pass and get a "yes" before writing.

## Interview sections

1. **Journey** — the timeline, in order: first language/framework → shifts →
   now. Keep each stop to one line. *Recommended shape: "React (first) →
   Vue/Nuxt → backend, current focus."*
2. **Stack table** — for each language/framework/tool they mention or you
   find, three separate ratings:
   - **proficiency** — how good they are at it today
   - **preference** — `preferred` (default to this), `fine` (will use
     happily), `tolerated` (can, would rather not), `avoid` (don't suggest)
   - **trajectory** — `fluent` (solid, staying), `growing` (actively
     improving), `learning` (new, wants to get good), `rusty` (was fluent,
     hasn't touched it)

   Ask the preference AND trajectory questions explicitly for anything
   they're merely competent in — capability and desire misalign exactly
   there, and that's where agents go wrong.
3. **Current focus** — what they're actively getting better at right now.
   Suggestions should stretch toward this, not away from it.
4. **Explanation depth** — how much explanation do they want: skip basics?
   explain trade-offs only? talk like a senior peer? One line.

## Write the profile

Write `~/.specificity/EXPERIENCE.md` with exactly this skeleton:

```markdown
<!-- specificity-experience-version: 1 -->
# Specificity Experience — <name/handle>
# Updated: <date>. Re-run /specificity-experience when your stack changes.

## Journey
<!-- one line per stop, in order -->

## Stack
<!-- - <tech>: <proficiency>, <preferred|fine|tolerated|avoid>, <fluent|growing|learning|rusty> — <note> -->

## Current Focus

## Explanation Depth
```

One line per entry. This file is read at decision time — an index, not a
memoir.

## Finish

Tell the developer: "Experience profile written. The agent now defaults to
your preferred stacks and only suggests tolerated ones with a reason. It
updates itself when you correct it mid-session — say 'I prefer X' and it
will offer to record it."
