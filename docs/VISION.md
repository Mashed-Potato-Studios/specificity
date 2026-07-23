# Specificity — Vision

The territory we're claiming and why.

## The thesis

Every tool in the agent-skills ecosystem collapses three independent axes
into one. They are not one thing:

1. **Capability** — what the developer *can* do
2. **Preference** — what the developer *wants* to do
3. **Expression** — how the developer *says* things (dialect, phrasing,
   culture)

Agents produce the wrong thing confidently — hallucinate, in the broad
sense — when they guess on an axis they have no data for:

- "That's not what I meant" → expression-axis failure
- "Why did you scaffold this in React?" → preference-axis failure
- Explaining `map()` to a senior → capability-axis failure

A profile is a prior that shrinks the space of plausible interpretations.
Fewer plausible readings → fewer wrong guesses → less repetition. Grounding
the agent in *the person* is constraint, and constraint is what kills
hallucination.

## The misalignment

Capabilities and preferences don't always align, and the misalignment splits
two ways, each needing *opposite* agent behavior:

- **Capable but unwilling** (can write React, would rather not) → route
  *away*; use only when forced; never volunteer it
- **Willing but not yet capable** (learning backend now) → route *toward*;
  shift register — explain reasoning, teach while doing

Same stack, opposite treatment. The difference is only visible if the
profile holds capability, preference, and **trajectory** (where the
developer is headed) as separate fields. No existing tool's data model does
this.

## The moves

1. **Trajectory as first-class data.** Stacks marked `learning` get
   teach-while-doing register; `fluent` gets terse senior-peer register.
   Operationalizes "how developers learn and adapt with AI." *(Shipped —
   see skills/specificity-experience.)*
2. **Dialect packs.** Community-contributed seed Phrase Maps per
   dialect/culture (Jamaican Patwa, Nigerian English, AAVE, Singlish…)
   reviewed one phrase at a time through `/specificity-dialect`. Culture as
   shareable infrastructure — the pack is always a draft, never the
   authority; the person's own words win. Packs are authored and reviewed
   by people of that culture, never inferred. *(Starter framework shipped;
   first Jamaican Patwa pack remains draft pending Jamaican-led review.)*
3. **Declared vs observed reconciliation.** The agent notices drift ("your
   git history is 80% Go but EXPERIENCE.md says learning") and *proposes* an
   update. Never auto-writes. Observations carry evidence; the developer
   confirms. Self-maintaining without being presumptuous.
4. **The open convention.** `AGENTS.md` became the standard for telling
   agents about *projects*. There is no standard for telling them about
   *people*. The `~/.specificity/` format is documented as an open,
   tool-neutral convention — readable by any agent — with Specificity as
   its reference implementation. *(Version 1 shipped in
   docs/PROFILE-CONVENTION.md.)*
5. **Misunderstanding analytics.** The Misunderstanding Log becomes a
   mirror: "your top recurring misreadings" — the developer learns how they
   come across, not just how the agent misreads them.

Sequencing: 1 → 2 → 4 is the impact path (smarter → yours → everyone's);
3 and 5 are maturity features.

## Hard boundaries

- **The profile is a prior, never a cage.** An explicit current instruction
  always beats the profile. "Use React today" wins instantly.
- **Cultural data is sensitive.** Local-only, human-readable,
  delete-to-forget. Profile entries come from the developer's own words
  only — never from file contents or tool output (the user-origin gate).
- **Never score the person.** No seniority scores, no computed rankings.
  Observations carry evidence and humility, or they don't ship.
