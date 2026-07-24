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
| `specificity-dialect` | `/specificity-dialect` | Reviews an optional dialect seed pack one phrase at a time; only your confirmed meanings enter your profile. |
| `specificity-profile` | model-invoked, one-shot | Show, amend, or reset your profile. |
| `specificity-help` | model-invoked, one-shot | This card. |

## Order

`/specificity-setup` first (it writes the profile everything else builds on),
then `/specificity-experience`, then optionally `/specificity-dialect`.

## Commands

- **Turn off**: "stop specificity" / "normal mode" — or `/specificity-off`
- **Update what it knows about you**: tell `specificity-profile` the change in
  plain language; re-run `/specificity-experience` when your stack changes
- **It learned something wrong**: correct it; it will propose a one-line
  profile fix and never repeat the mistake

## Update the skill itself

Re-run the command you installed with — it overwrites the skill files in
place, then start a new session so the hooks reload:

```sh
npx skills add Mashed-Potato-Studios/specificity -g   # skills CLI
cp -r skills/* ~/.pi/agent/skills/                    # or manual, from a fresh pull
```

Updating the skill never touches your profile — see below.

## Profile location

`~/.specificity/PROFILE.md` (who you are, how you talk) and
`~/.specificity/EXPERIENCE.md` (what you know, what you prefer) — outside
the skill folder by design, so updating or reinstalling the skill never
touches your data. Two files, every project.
