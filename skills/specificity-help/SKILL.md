---
name: specificity-help
description: Reference card for the Specificity skill family — what each skill does, how to set up, turn off, and update. Use when the user says "specificity help", "/specificity-help", or asks how Specificity works.
license: MIT
---

# Specificity — Help

One-shot display. Print this card, stop.

## What it is

Specificity makes the AI understand **you** — your language, dialect,
phrasing habits, and background — so it decodes what you mean instead of
interrogating you. Set up once, globally. Works in every project after.

## Skills

| Skill | Invocation | Does |
|---|---|---|
| `specificity` | model-invoked, persistent | Active every response once a profile exists. Decodes your messages against your profile before asking anything; biases stack suggestions to your preferences. Learns from corrections. |
| `specificity-setup` | `/specificity-setup` | One-time interview → writes your global profile. Run once, ever. |
| `specificity-experience` | `/specificity-experience` | One-time interview → maps your technical journey and stack preferences (can-use vs prefer). Re-run when your stack changes. |
| `specificity-profile` | model-invoked, one-shot | Show, amend, or reset your profile. |
| `specificity-help` | model-invoked, one-shot | This card. |

## Commands

- **Turn off**: "stop specificity" / "normal mode"
- **Update**: tell `specificity-profile` the change in plain language
- **It learned something wrong**: correct it; it will propose a one-line
  profile fix and never repeat the mistake

## Profile location

`~/.specificity/PROFILE.md` (who you are, how you talk) and
`~/.specificity/EXPERIENCE.md` (what you know, what you prefer) — outside
the skill folder by design, so updating or reinstalling the skill never
touches your data. Two files, every project.
