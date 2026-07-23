---
name: specificity-dialect
description: Review a language or dialect seed pack with the developer and add only their confirmed phrase-to-intent mappings to the global Specificity profile. Packs help agents understand; they never imitate or stereotype the speaker.
argument-hint: "Choose a pack, then accept/edit/reject each phrase"
disable-model-invocation: true
license: MIT
---

# Specificity Dialect

Seed the developer's Phrase Map from a bundled language or dialect pack.
Packs are **draft interpretation aids**, never identity authorities.

## Start

1. Require `~/.specificity/PROFILE.md`. Missing → point to
   `/specificity-setup`; do not create a partial profile.
2. List files in `references/packs/` by their display name and review status.
3. Ask which pack to review. Selecting a pack never proves nationality,
   ethnicity, location, or identity.

## Review protocol

Read the selected pack, then review **one entry at a time**:

1. Show the phrase and variants, likely intent, and ambiguity caution.
2. Ask: **accept, edit, reject, or stop?** Include `accept` as the recommended
   answer only when context makes it safe.
3. Accept/edit → stage one line:
   `"<developer's wording>" → <developer-confirmed intent>`
4. Reject → discard it permanently for this review. Never argue with the
   developer about their own language.
5. Stop → write confirmed entries so far, then stop.

Before writing, show the staged lines together and get one final "yes".
Append only confirmed lines to `## Phrase Map` in
`~/.specificity/PROFILE.md`; skip exact duplicates.

## Boundaries

- **Interpret, never perform.** Do not reply in the dialect, simulate an
  accent, add catchphrases, or rewrite the developer's words.
- Context outranks the pack. Consequential ambiguity (deletion, deployment,
  permissions, money, deadlines) still gets one short clarification.
- Preserve the developer's spelling. Variants are matching aids, not
  corrections.
- Never bulk-import a pack. Every entry requires user-origin confirmation.
- Packs cannot author technical meanings. Code terms retain their code
  meaning unless the developer explicitly confirms otherwise.
- Pack corrections may update the bundled file only when the developer asks
  to contribute publicly; personal corrections stay in PROFILE.md.

## Adding packs

Follow `references/PACK-FORMAT.md`. Packs require sources, ambiguity notes,
interpretation-only tests, and community review before graduating from
`draft` to `reviewed`.
