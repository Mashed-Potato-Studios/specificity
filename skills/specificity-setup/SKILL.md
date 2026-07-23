---
name: specificity-setup
description: One-time interview that builds your global Specificity profile — language, dialect, habits, phrasing patterns, tech background — so every project understands you. Run once.
argument-hint: "Run once, takes ~10 minutes, works on every project after"
disable-model-invocation: true
license: MIT
---

# Specificity Setup

Build the developer's profile through one interview, then write it to
`~/.specificity/PROFILE.md` — a user-data location outside any repo or skill
folder, so it survives skill updates and works on every host. Global: one
setup, every project understands them.

If a profile already exists, show it and ask: fresh interview, or amend
specific sections?

## Interview protocol

From `/grilling`: **one question at a time**, always with a **recommended
answer** the developer can accept or correct. Facts you can observe (OS,
shell, editors in the repo, languages in package.json) get **looked up, not
asked**. Never ask a question whose answer is sitting in their dotfiles or
current project.

## Interview sections

Walk these in order. Skip any the developer waves off.

1. **Identity & background** — name/handle, where they're from, ethnicity and
   cultural background (this shapes language; ask respectfully, skip on any
   hesitation). *Recommended: "Jamaican, English + Patois."*
2. **Language & dialect** — languages spoken, dialect, how they actually type
   to an AI (formal? stream of consciousness? patois mid-sentence?).
3. **Phrase Map** — the core. Ask for real examples: "What are things you've
   said to an AI that it got wrong?" Record as `"phrase" → intent`. Seed
   with their answers, e.g. `"sort it out" → fix it completely, don't ask
   follow-ups`, `"soon come" → low urgency, not immediate`.
4. **Communication style** — terse or verbose, bullet or prose, how they
   signal urgency, how they say something's wrong, tolerance for questions
   (how many is too many before it gets annoying?).
5. **Working habits** — solo/team, hours, commit style, planning tolerance
   ("just build it" vs "plan first"), how they review AI output.
6. **Technical background** — self-taught/CS degree/bootcamp, years, primary
   stack, strongest and weakest areas. Look up what's inferable; ask only
   the rest.
7. **Definition of done** — what "finished" means to them: tests? types?
   deployed? "it runs on my machine"?

## Write the profile

Write PROFILE.md with exactly this skeleton, filled from the interview:

```markdown
# Specificity Profile — <name/handle>
# Updated: <date>. Setup once; grows via the specificity loop.

## Identity & Background
## Language & Dialect
## Phrase Map
<!-- "what they said" → what they meant -->
## Communication Style
## Working Habits
## Technical Background
## Definition of Done
## Misunderstanding Log
<!-- appended by the specificity skill when it gets something wrong -->
```

Every entry is one line. No prose paragraphs — this file is read every
session, so it's an index, not a memoir.

## Finish

Tell the developer: "Profile written. Specificity is now active in every
project. It updates itself when it misunderstands you — say 'stop
specificity' to turn it off."
