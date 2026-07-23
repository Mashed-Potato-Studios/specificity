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

Self-contained — no external skill needed. Three rules, held for the whole
interview:

1. **One question at a time.** Multiple questions at once is bewildering.
2. **Every question ships with a recommended answer** the developer can
   accept with one word or correct. Never an empty prompt.
3. **Facts get looked up, never asked.** Anything observable — OS, shell,
   editors, languages in package.json, dotfiles — you check yourself. Only
   the person can answer questions about the person; everything else is
   your job.

Confirm each answer before moving on. When all sections are done (or
waved off), read the profile back in one pass and get a final "yes" before
writing.

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
specificity' to turn it off. Next: run `/specificity-experience` to teach
it your stack preferences. If you use a language or dialect agents often
misread, run `/specificity-dialect` to review an optional seed pack."
