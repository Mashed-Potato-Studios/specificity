---
name: specificity-profile
description: Show, amend, or reset your Specificity developer profile. Use when the user says "show my profile", "update my specificity profile", "that's not how I talk", or wants to see what the AI knows about them.
license: MIT
---

# Specificity Profile

Manage the developer's profile at `~/.specificity/PROFILE.md`. One-shot:
read, show, or edit, then stop.

## Modes

- **No argument / "show"** → print the profile as-is. Missing → point to
  `/specificity-setup`. Nothing else.
- **Amend** → the developer states a change in plain language ("I don't say
  that anymore", "add: my 'quick' means under an hour"). Apply it to the
  right section in the profile's one-line-entry style. Show the diff, wait
  for confirmation, write.
- **"reset"** → confirm explicitly, then delete PROFILE.md. Setup must be
  re-run.

## Rules

- One-line entries only, in the existing section format. No prose paragraphs.
- Never delete the Misunderstanding Log on amend — it's the record of what
  the profile learned. Offer "clear log" as an explicit separate action.
- Changes take effect immediately; no restart needed.
