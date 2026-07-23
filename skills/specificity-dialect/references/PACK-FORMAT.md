# Dialect Pack Format

A pack seeds a personal Phrase Map. It is not a dictionary, translation
engine, identity detector, or style generator.

## Required frontmatter

```yaml
---
name: jamaican-patwa
language: Jamaican Creole
aliases: [Patwa, Patois, Jamaican]
status: draft # draft | reviewed
reviewed-by: []
last-reviewed: YYYY-MM-DD
---
```

`reviewed` requires at least one credited/consenting community linguist or
educator and two developers who use the language variety. Anonymous review
may be recorded as a count, but never fabricated.

## Entry format

```markdown
## Phrase

- Variants: ...
- Likely intent: ...
- Ambiguity: ...
- Sources: [Name](URL)
```

## Contribution rules

1. Interpretation only. Never teach an agent to perform an identity.
2. Phrase meaning and pragmatic intent require a stable source; ambiguity
   notes are mandatory.
3. Preserve spelling variation. Never label the developer's spelling wrong.
4. Mark region, generation, profession, or register limits when known.
5. Exclude slurs, identity labels, intimate terms, and caricature spellings
   from starter packs.
6. Private examples require explicit permission and de-identification.
7. Community members can correct or remove entries without debate.
8. Tests reward correct interpretation or clarification and fail
   stereotyped generation.
