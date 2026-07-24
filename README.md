# Specificity

[![skills.sh](https://skills.sh/b/Mashed-Potato-Studios/specificity)](https://skills.sh/Mashed-Potato-Studios/specificity)

Specificity is a family of agent skills that makes AI coding agents understand **the individual developer** — their language, dialect, ethnicity, phrasing habits, working style, and technical background — via global profiles at `~/.specificity/PROFILE.md` (who you are, how you talk) and `~/.specificity/EXPERIENCE.md` (what you know, what you *prefer*). Set it up once through short interviews; every project and every session after that, the agent decodes what you *mean* instead of interrogating you with clarifying questions, and suggests the stacks you actually want — "can use React" and "prefers Vue" are different facts, and the agent knows both. When the agent does misunderstand you, the correction is written back into the profile, so the same mistake never costs twice.

## Skills

| Skill | Type | What it does |
|---|---|---|
| `specificity` | persistent mode | Active every response once a profile exists. Decodes your messages against your profile before asking anything; learns from misunderstandings. Off: "stop specificity". |
| `specificity-setup` | one-shot | One-time interview that writes your global profile. Run once, ever. |
| `specificity-experience` | one-shot | One-time interview that maps your technical journey and stack preferences (can-use vs prefer) — the agent defaults to your preferred stacks. Re-run when your stack changes. |
| `specificity-dialect` | one-shot | Reviews an optional, source-backed dialect seed pack one phrase at a time. Only developer-confirmed meanings enter the profile; interpretation, never imitation. |
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

Then run `/specificity-setup` once to build your profile, `/specificity-experience` to map your stack preferences, and optionally `/specificity-dialect` to review a dialect seed pack.

## Update

Re-run the same command you installed with — it overwrites the skill files in place:

```sh
# skills CLI
npx skills add Mashed-Potato-Studios/specificity -g

# or manually, from a fresh clone/pull of this repo
cp -r skills/* ~/.pi/agent/skills/
cp -r skills/* ~/.agents/skills/

# CLI / hooks (npx always resolves the latest published version)
npx specificity@latest version
```

Start a new agent session afterwards so the session hooks reload.

**Your profile is never touched by an update.** `~/.specificity/PROFILE.md` and `EXPERIENCE.md` live outside every install path by design, so upgrading or reinstalling the skills can't overwrite, migrate, or delete what you told the agent about yourself. You only ever change them by running `/specificity-profile`, `/specificity-setup`, or `npx specificity profile reset`.

To update the *profile* rather than the skill, see `/specificity-profile` (amend or reset) and re-run `/specificity-experience` when your stack changes.

## CLI & runtime

Specificity also ships as an npm package with a CLI and session hooks, so it works beyond skills-aware agents:

```sh
npx specificity profile        # show your profile + experience
npx specificity profile reset  # delete both files, start over
npx specificity version
```

The hooks activate the mode at session start and show `[SPECIFICITY]` in the status line while it's on. Your profile lives at `~/.specificity/` (override with `SPECIFICITY_PROFILE_DIR`) and is the single source of truth shared across every agent — only the ephemeral "active" flag is per-agent, so Claude Code, Codex, Copilot, and Qoder all read and write the same you.

## MCP server

For hosts that take context only through tool calls (no hooks, no skills), `specificity-mcp` exposes the profile as MCP tools:

- **Read** — `get_profile`, `get_experience`, `get_phrase_intent`, `get_stack_preference`, `get_preferred_stack`.
- **Learn** (gated, two-step) — `propose_correction` validates a phrase or stack entry and returns a normalized preview to show you; `apply_correction` writes it only with `confirmed: true`, which the agent may set solely after you approve the exact line. Writes are atomic and validated against the profile convention, so the loop that lets the agent learn from a misunderstanding works even where skills can't run.

```sh
npm run mcp   # stdio MCP server; wire it into your host's MCP config
```

## Open profile convention

`~/.specificity/` is an open, agent-neutral Markdown convention for describing the person behind the code. Any agent may read it; no Specificity runtime is required. See [The Specificity Profile Convention](docs/PROFILE-CONVENTION.md) for the versioned format, precedence, privacy rules, and consumer contract.

## Status

Early development.
