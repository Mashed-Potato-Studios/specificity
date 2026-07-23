# Specificity

[![skills.sh](https://skills.sh/b/Mashed-Potato-Studios/specificity)](https://skills.sh/Mashed-Potato-Studios/specificity)

Specificity is a family of agent skills that makes AI coding agents understand **the individual developer** — their language, dialect, ethnicity, phrasing habits, working style, and technical background — via global profiles at `~/.specificity/PROFILE.md` (who you are, how you talk) and `~/.specificity/EXPERIENCE.md` (what you know, what you *prefer*). Set it up once through short interviews; every project and every session after that, the agent decodes what you *mean* instead of interrogating you with clarifying questions, and suggests the stacks you actually want — "can use React" and "prefers Vue" are different facts, and the agent knows both. When the agent does misunderstand you, the correction is written back into the profile, so the same mistake never costs twice.

## Skills

| Skill | Type | What it does |
|---|---|---|
| `specificity` | persistent mode | Active every response once a profile exists. Decodes your messages against your profile before asking anything; learns from misunderstandings. Off: "stop specificity". |
| `specificity-setup` | one-shot | One-time interview that writes your global profile. Run once, ever. |
| `specificity-experience` | one-shot | One-time interview that maps your technical journey and stack preferences (can-use vs prefer) — the agent defaults to your preferred stacks. Re-run when your stack changes. |
| `specificity-profile` | one-shot | Show, amend, or reset your profile. |
| `specificity-help` | one-shot | Reference card for the family. |

## Install

```sh
# skills CLI (70+ agents — pi, Claude Code, Cursor, Codex, ...)
npx skills add Mashed-Potato-Studios/specificity -g

# or manually: pi
cp -r skills/* ~/.pi/agent/skills/
# or any Agent Skills-compatible client
cp -r skills/* ~/.agents/skills/
```

Then run `/specificity-setup` once to build your profile, and `/specificity-experience` to map your stack preferences.

## Status

Early development.
