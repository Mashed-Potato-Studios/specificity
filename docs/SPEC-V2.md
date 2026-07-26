# Specificity v2 — Portable, Continuously-Learning Identity

Status: **ready to build**. Synthesized from the completed wayfinder map
(`.wayfinder/map.md`) and its twelve closed ticket resolutions, 2026-07-25.

Every decision below has a resolution behind it. Where the reasoning matters,
the ticket is cited — read it before changing the decision.

---

## Problem Statement

A developer's profile lives on one machine. Get a new laptop, work from a
different desk, reinstall an OS, and the agent that finally understood how you
talk goes back to knowing nothing. You rebuild it by hand, or you don't bother.

It is also **static**. The profile holds what you were willing and able to
describe about yourself during a one-time interview. But people are poor
witnesses to their own habits. This project's own developer declares "Very
terse" in their profile; measured across sixty of their real prompts, the median
is **32.5 words**. Neither statement is a lie — they are telegraphic when
approving something and write paragraphs when defining work — but no interview
would ever have produced that distinction, and an agent acting on "very terse"
under-explains precisely when the developer is asking for something substantial.

So there are two failures, and they compound: what the agent knows doesn't
follow you, and what it knows was never very accurate to begin with.

## Solution

Two changes, sharing one guarantee.

**The profile travels.** A twelve-word recovery phrase derives an encryption key.
The profile is encrypted on your machine and stored wherever you choose — a
private git repo, a synced folder, your own bucket. On a machine that has never
seen your profile, you type the phrase and the backend address and your identity
is there. Nothing is machine-bound, and no plaintext ever leaves your machine.

**The profile learns.** A sub-second pass reads the transcripts your agent hosts
already write, and proposes what it notices — batched, evidenced, and never
written without your confirmation. It has months of your history available on the
first run, so it has something to say on day one.

The guarantee both rest on: **you remain authoritative about yourself.** Nothing
enters your profile that you did not confirm, and everything that runs on your
machine is open source so you can verify that claim rather than trust it.

---

## User Stories

### Portability

1. As a developer setting up v2, I want to be shown a recovery phrase once, so that I can store it somewhere safe before anything depends on it.
2. As a developer setting up v2, I want to be told plainly at that moment that losing the phrase and all my machines means losing the profile, so that I understand the trade-off when I can still act on it.
3. As a developer, I want to point Specificity at a storage location I already own, so that no third party holds my personal data.
4. As a developer, I want my profile encrypted before it leaves my machine, so that the storage provider cannot read it.
5. As a developer on a brand-new machine, I want to type my phrase and my backend address and get my profile back, so that setting up a new laptop doesn't cost me my agent's understanding.
6. As a developer, I want the object names in my remote to reveal nothing, so that someone with access to the bucket cannot tell which objects are mine or what they contain.
7. As a developer, I want to store several profiles in one bucket, so that I don't need separate infrastructure per identity.
8. As a developer using a private git repo, I want version history for free, so that a bad change can be rolled back.
9. As a developer using a synced folder, I want the last several versions kept automatically, so that I get rollback without git.
10. As a developer whose remote is unreachable, I want to keep working with my local profile, so that a network problem never blocks my agent.
11. As a developer whose credentials expired, I want one clear warning telling me what to fix, so that I'm not nagged every session.
12. As a developer, I want a corrupt or undecryptable remote blob to be refused rather than merged, so that my working local profile is never destroyed by a bad download.
13. As a developer who lost my phrase but still has a working machine, I want to generate a new phrase and re-encrypt from local plaintext, so that losing the phrase costs me nothing but a re-key.
14. As a developer, I want to log this machine out by deleting one file, so that lending or retiring hardware is simple.
15. As a developer, I want deleting `~/.specificity/` to still forget everything, so that the privacy promise survives the new features.

### Multi-machine

16. As a developer with a laptop and a desktop, I want both machines' learning to survive a sync, so that whichever syncs second doesn't erase the other's.
17. As a developer, I want facts I deleted to stay deleted after a sync, so that "delete to forget" is not undone by another machine.
18. As a developer, I want a deleted fact's text to be gone from the sync record too, so that the deletion mechanism doesn't preserve what I asked it to forget.
19. As a developer, I want to hand-edit `PROFILE.md` in a text editor and have my edit win, so that the file remains genuinely mine.
20. As a developer, I never want to be shown a merge conflict, so that using this tool doesn't feel like resolving a rebase.
21. As a developer, I don't want my machines' names in my synced data, so that device identity isn't leaked as a side effect of syncing.
22. As a developer returning to a machine after months, I want its stale state reconciled correctly, so that an old laptop can't resurrect facts I removed.

### Learning

23. As a developer, I want the agent to notice how I actually phrase requests, so that it stops mistaking my shorthand for ambiguity.
24. As a developer, I want recurring request shapes recorded with their meaning, so that "continue to the next" doesn't get a clarifying question every time.
25. As a developer, I want my working rhythm noticed, so that the agent has context I would never think to state.
26. As a developer, I want observations to be evidenced, so that I can judge a claim about myself without opening a transcript.
27. As a developer, I want nothing written to my profile without my confirmation, so that the file always reflects what I actually agreed to.
28. As a developer, I want proposals batched at session end, so that learning never interrupts my work.
29. As a developer, I want at most a few proposals at a time and not every day, so that the feature doesn't become the thing that annoys me.
30. As a developer, I want to pull the queue on demand, so that I can review when it suits me rather than when it suits the tool.
31. As a developer, I want to reword a proposal before it's stored, so that my profile is in my words.
32. As a developer, I want to permanently silence a kind of proposal, so that declining once doesn't mean declining forever.
33. As a developer, I want declining a proposal to be remembered rather than forgotten, so that the same suggestion doesn't return next week.
34. As a developer whose observed behaviour contradicts what I stated about myself, I want that raised carefully and rarely, so that the tool isn't constantly arguing with me about who I am.
35. As a developer, I want to keep my own statement and still have the discrepancy recorded, so that the agent knows both how I describe myself and how I come across.
36. As a developer upgrading to v2, I want a first batch drawn from my existing history, so that the upgrade demonstrates itself immediately.
37. As a developer, I want the interview to only ask about things I can actually answer, so that I'm not inventing facts about habits I can't observe in myself.
38. As a developer, I want unfilled sections to be absent rather than empty, so that a reading agent knows "unknown" rather than inferring "none".

### Privacy and safety

39. As a developer, I want secrets I paste into a prompt to never reach my profile, so that syncing my identity never syncs a credential.
40. As a developer, I want an uncertain match treated as a secret, so that the system errs toward losing data rather than leaking it.
41. As a developer, I want my home path normalized out of stored evidence, so that my username and directory layout aren't carried into synced data.
42. As a developer, I want to see how much was redacted without seeing what, so that verifying the filter doesn't recreate the leak.
43. As a developer, I want every line that touches my transcripts and my keys to be open source, so that I can verify the privacy claim instead of trusting it.
44. As a developer, I want tool output and file contents excluded from observation entirely, so that only my own words describe me.
45. As a developer, I want text the agent suggested and I merely accepted excluded from phrasing analysis, so that the profile doesn't learn the product's voice as mine.

### Operation

46. As a developer, I don't want a background process running on my machine, so that installing this costs me nothing while I'm not working.
47. As a developer, I want observation to cost a fraction of a second at session start, so that it never slows down starting work.
48. As a developer, I want one session to pick up what my other agent hosts wrote, so that coverage doesn't depend on which tool I happen to open.
49. As a developer, I want to know when a reader has broken, so that my profile doesn't silently stop learning after a vendor update.
50. As a developer using an agent with no local transcript, I want the profile to still understand me, so that my choice of tool doesn't disable the feature.
51. As a developer, I want uninstalling to leave nothing behind, so that removal is as complete as the privacy promise implies.

---

## Implementation Decisions

### Licensing and boundary

**Everything is open source, MIT.** Skills, CLI, hooks, MCP server, crypto, the
observation pass, extraction, storage drivers, this spec, and the convention.

_Superseded 2026-07-26._ Ticket 1 originally held back a hosted service as the
one closed artifact. That reservation is dropped: the immediate goal is
contribution from other developers, and adoption of the `~/.specificity/`
convention is what makes this worth anything. Nothing is held back to protect a
revenue path that doesn't exist yet. Monetization is a separate question for a
later date, and nothing in this design forecloses it — the storage driver
contract still means a hosted backend can be added later by anyone, including
us.

What has not changed, and is not a business decision: client code ships to the
user's machine, so closing it would protect nothing, and an unauditable crypto
or transcript-reading path would make the product's core privacy claim
impossible to verify. That argument stands on its own. _(Ticket 1, superseded)_

### Data model

v2 is **additive**. Convention v1 remains valid; there is no version bump and no
migration.

- **Human layer** — `PROFILE.md` and `EXPERIENCE.md` keep their v1 shape and hold
  **confirmed facts only**, as bare, readable, hand-editable Markdown. A v1
  consumer sees exactly what it expects.
- **Machine layer** — `~/.specificity/_*` sidecars hold the journal, candidates,
  and read cursors. Convention v1 already reserves the `_` prefix for tool-local
  state, so third-party consumers ignore it by spec.

Four new **optional** sections in `PROFILE.md`: **Request Patterns** (recurring
shapes of ask and what they mean — structurally distinct from Phrase Map's word →
meaning), **Interaction Preferences** (standing behavioural rules, where
Communication Style is description), **Rhythm & Context**, and **Anti-patterns**
(what reliably annoys the developer; distinct from the Misunderstanding Log, which
records being wrong rather than being irritating).

Twelve sections is a real context cost. The spec sets a **per-section size
budget** — a soft line cap, with lowest-value entries pruned. An unbudgeted
profile becomes a wall the agent skims, and every marginal section then costs the
good ones attention. _(Ticket 2)_

### Key and crypto

Node stdlib only; the package's **zero runtime dependencies** are preserved, and
the encryption path is the last place to spend them.

| Role | Choice |
|---|---|
| Mnemonic | BIP39 English wordlist, 128-bit entropy → 12 words + checksum. Wordlist vendored as **data**, not a package |
| KDF | `crypto.scrypt`, N=2¹⁷, r=8, p=1 → 32-byte key |
| Cipher | `aes-256-gcm`, fresh random 96-bit nonce per write |
| Entropy | `crypto.randomBytes` |

**Derivation is deterministic** — `scrypt(normalized_mnemonic, "specificity-v2")`
with a fixed application salt, following BIP39's own rationale: the mnemonic
already carries 128 bits of entropy. This is what makes fresh-machine restore
work at all — there is no salt to fetch first, so no chicken-and-egg with the
remote blob.

**Envelope:** versioned clear header (magic, format version, KDF parameters,
nonce) carrying no user data, then ciphertext + GCM tag. Versioned from day one
because the format outlives v2.

**Key at rest:** `~/.specificity/_key`, mode 600, holding the **derived key only,
never the mnemonic**. No OS keychain — `PROFILE.md` sits beside it as plaintext,
so anyone who can read the key can already read the profile; guarding the key
harder than the data it protects is theatre costing three platform integrations.
The key protects the *remote* copy. Logging out of a machine means deleting that
one file.

**No escrow, no second factor.** Unlike a wallet, the plaintext is not gone when
the phrase is — it sits on every machine the developer uses. Phrase lost with any
machine alive: generate a new phrase, re-encrypt local plaintext, push, abandon
the old blob. Rotation is that same operation, so it needs no separate mechanism.

**Signing is ruled out**, not deferred. GCM already authenticates for the only
consumer that exists — the developer's own machines. Attestation to third parties
needs a verifier, which needs teams or a service, both out of scope. _(Ticket 3)_

### Storage driver contract

Public, documented, versioned independently of the profile format.

```
get(path)    -> bytes | null
put(path, bytes)
list(prefix) -> path[]
delete(path)
```

That is the entire contract. **No locking, no transactions, no compare-and-swap**
— deliberately, so a git repo, a synced folder, a bucket, and a future hosted
service can all satisfy it without emulating semantics they lack. Divergence is
therefore expected and resolved above this layer.

**One blob per file.** `PROFILE.md`, `EXPERIENCE.md`, `_observations.jsonl`, and
`_journal.jsonl` encrypt and sync separately, because they merge differently:
append-only files union with no possible conflict, and only human-edited files
ever need resolution.

**Paths are derived:** `hex(sha256(key ‖ filename))`. The remote sees N opaque
objects — not filenames, not which object is the profile. Several profiles share
one bucket without collision, and without the key you cannot even locate a
person's objects. Accepted and documented leak: object count, approximate sizes,
modification times.

**Bootstrap** takes two inputs, one secret: backend location (not secret) and
recovery phrase (secret). No config file travels with the developer.

**Drivers shipping:** filesystem (inherits Dropbox, iCloud, Syncthing, a NAS) and
git (history and credentials free, shells out to `git`). Both zero-dependency.
S3/R2 is documented for third parties — it needs an SDK, and the public contract
exists so that driver can live outside this package.

**Failure posture — degrade, never block.** Unreachable or denied → warn once,
continue local-only. Undecryptable or corrupt → refuse, keep local intact, offer
the previous version where the driver has history. A sync problem must never stop
the agent or destroy the local plaintext, which remains authoritative.
_(Ticket 5)_

### Merge model

An append-only **journal** is the source of truth for changes; the Markdown is
materialized from it.

```
_journal.jsonl:  { id, ts, machine, op, section, fact_hash, text? }
op ∈ add | remove | amend | confirm | reject
```

**Merge is set union by event id**, ordered `(ts, machine)` for determinism. Two
machines that both learned offline both keep what they learned — nothing is
written over, only appended. No locking required, which is what lets the driver
contract stay four operations.

**Deletions are tombstone events**, so a sync from a machine that still holds the
fact cannot resurrect it. **A tombstone stores the fact's hash, never its text** —
otherwise "forget this about me" would leave the forgotten thing sitting in a
synced journal forever, and the deletion mechanism would defeat the deletion
promise.

**Hand-edits are reconciled, not forbidden.** Before each sync, `PROFILE.md` is
diffed against the last materialized snapshot and differences become events with
origin `stated`. The local file always wins that diff: a developer editing their
own profile is the most authoritative input the system has.

**Machine identity is an opaque random id** generated at install — enough to
dedup and diagnose, no hostname, no label.

**Compaction:** events older than 90 days fold into a snapshot, with tombstone
hashes retained permanently so a long-absent machine still cannot resurrect
deleted facts.

**The developer is never asked to resolve a merge.** No conflict markers, no
resolution prompt. Anything that loses ordering remains in the journal and is
recoverable through driver history.

This **supersedes the separate `_provenance` sidecar** proposed during data
modelling — the journal is the provenance record, and two stores could disagree.
_(Ticket 8, amending Ticket 2 §4)_

### Reading transcripts

A user turn must be identified **structurally**, never heuristically, or the
user-origin gate collapses.

**Claude Code** (`~/.claude/projects/<slugged-cwd>/<sessionId>.jsonl`): a genuine
typed turn is `type == "user"` **and** `message.content` is a plain string — tool
results are always lists, injected notices carry `isMeta`. `promptSource` refines
it: `typed` is ground truth; `sdk` and `system` are excluded; **`suggestion_accepted`
is excluded from phrasing analysis** because it is the developer's intent but the
product's wording, and counting it teaches the profile its own voice back.

**That structural rule is necessary but not sufficient.** These also arrive as
typed strings and must be excluded: `<local-command-stdout>`/`stderr`,
`<command-name>`/`<command-message>` slash invocations, Claude Code's
`Caveat: The messages below were generated by the user while running local
commands` wrapper, `<system-reminder>` blocks, and bare image pastes. Measured
effect on real history: **87 turns → 60**. Unfiltered, the most frequent phrase in
the "developer's voice" corpus was Claude Code's own boilerplate.

**pi** (`~/.pi/agent/sessions/…`): role-tagged message blocks, clean.

Pasted spans (fenced code, stack traces, long indented blocks) are excluded from
phrasing analysis — they are the developer's *message* but not their *voice*, and
they dominate frequency analysis otherwise. _(Ticket 4 + its correction)_

### Extraction

**The pass counts; the in-session agent judges.**

- **Deterministic pass:** rhythm, project spread, length distribution,
  terseness-by-context, occurrence counting, dedup, candidate store ownership.
  Cheap, offline, no inference, no privacy cost, runs over full history.
- **In-session agent:** request patterns, phrase meanings, anti-patterns,
  correction detection. It already holds the conversation, so this adds no
  inference cost and moves no data that wasn't already there.

A local model was rejected as a dependency to install and maintain for work the
agent does for free. A cloud call was rejected outright — it contradicts "no
plaintext ever leaves".

This split also fixes coverage: hosts with no transcript get semantic observation
anyway, losing only the statistical layer.

**Signal is scarce and the design must respect it.** Measured on real history:
~3% of records are typed turns; 60 clean turns across months. Regex found 2
friction markers in 60 turns — frequency analysis cannot do semantics at this
volume, which is the empirical argument for the agent doing that half.

**Precision bar:** no semantic candidate is proposed below **3 independent
occurrences across ≥2 sessions**. Precision over recall — a wrong proposal costs
trust, a missed one costs nothing. _(Ticket 6)_

### Redaction

Scan **on read**, before anything is persisted — no window where raw text sits in
the candidate store awaiting redaction.

**Detection:** gitleaks/trufflehog regex rules vendored as a **data file** (the
same pattern as the BIP39 wordlist — borrowed expertise, zero dependencies), plus
a Shannon-entropy check. Refreshed per release; a stale ruleset is a documented
limitation, whereas shelling out to an installed scanner would make the guarantee
conditional on software most users lack.

| Tier | Examples | Action |
|---|---|---|
| Credential | API keys, tokens, PEM keys, connection strings, high-entropy tokens | **Whole turn dropped** — not quoted, not counted |
| Identity | Absolute home paths, emails | Span normalized (`/Users/<name>/` → `~/`); turn kept |
| Uncertain | Ambiguous or partial match | Treated as credential; dropped |

Dropping the whole turn rather than the span is deliberate: a partially-redacted
turn still surrounds the secret with identifying context, and span-redaction
trusts the matcher to have found *every* occurrence. Dropping trusts it to have
found one. **Fail closed.**

Identity data gets the lighter treatment because it is common and mild — home
paths appeared in 5 of 60 real turns, and normalizing is lossless for phrasing.

**Redaction is the third filter, not the first.** Typed-turn-only input already
excludes the tool results and attachments where secrets actually live, and
pasted-span exclusion covers the other likely location.

**Verification** reports counts and rule names, **never content** — printing the
match to prove it was caught would recreate the leak.

Explicitly out of scope: a secret the developer types into their own profile and
confirms. That is their own statement, and overriding it would violate the
user-origin gate. Redaction governs observation, not declaration. _(Ticket 9)_

### Confirmation

**Session end, throttled, batched:** ≤3 proposals per batch, ≤1 batch per 24
hours, never mid-task. Plus `npx specificity review` on demand. Pull-only was
rejected as the honest failure mode — nobody runs it, and learning silently stops.

**The pass stages; the surface renders.** Proposals are written to the machine
layer, and whichever surface exists (hooks, in-session skill, CLI, MCP) renders
them. One queue, many renderers — this is what lets transcript-less hosts
participate.

**Render is evidence-forward:** claim, occurrence count, one real quote, target
section named. Counts alone ask someone to confirm a claim about themselves with
nothing to check it against; full excerpts are too much to read at session end.

From the prototype, using this developer's real candidates:

```
Specificity noticed 3 things (npx specificity review)

1. Rhythm & Context
   "Often starts work between 6–7am"
   19 of 60 prompts, 4 sessions
   [y] add  [n] no  [e] edit  [never]

3. Communication Style  ⚠ disputes a fact you stated
   You said: "Very terse"
   Observed: median 32.5 words; short only for approvals
   Suggest: "Terse for approvals, fuller when defining work"
   [y] replace  [k] keep mine  [e] edit
```

**Answer semantics:** `y` writes it. `n` means *not now* — the candidate survives
and returns only once evidence has **doubled**. `e` stores the developer's own
wording with origin `stated`, because their words outrank the observation.
`never` suppresses the pattern class permanently, recorded as a rejection event —
a rejection is data, not a deletion.

**Contradictions are a separate class.** An observation disputing a stated fact
must clear roughly **double** the evidence bar, is visually marked, and is worded
`replace`/`keep mine` rather than `yes`/`no`. On `keep mine`, **the declared fact
stands unchanged and the tension is recorded** — the agent then knows both
accounts, which is more useful than either alone.

Both prototype findings drove this rule. The dialect case (zero occurrences
observed against a declared fact) shows observation can be wrong on a small
single-host sample. The terseness case shows the developer's own account can be
true-but-incomplete. Keeping both is the only policy surviving both cases.

**Nothing is ever written silently.** No confidence tier bypasses confirmation.
_(Ticket 7)_

### Host coverage

**Readers shipping: Claude Code and pi.** Both identify user turns structurally,
so neither can misattribute machine text as the developer's voice.

**Codex is excluded at launch** — its injected AGENTS.md and `<user_instructions>`
share the user role with no structural flag, so extraction would depend on content
heuristics; a misclassification teaches a repo's instructions as the developer's
phrasing. A wrong fact about a person is worse than a missing one. Cursor and
Antigravity are excluded as undocumented SQLite schemas with no stability
guarantee.

**The reader interface is public**, same shape and rationale as the driver
contract: new hosts can be added by anyone without touching the core.

**A broken reader quarantines itself, warns once, and leaves the others running.**
Silence is the failure that matters — a reader that stops matching after a vendor
update means the profile stops learning and nobody finds out for months. Crashing
would be worse: one host's format change must never disable observation
everywhere.

**Hosts without transcripts are first-class** and documented as such:
*Specificity understands you on every host; it measures you where the host keeps a
local record.* _(Ticket 10)_

### Runtime: there is no daemon

A full cold scan of 50 MB of real Claude Code history — every session ever
recorded — measured **0.41 seconds** in a prototype, with no incremental cursor.
Transcripts are append-only and signal is ~3% of records. Nothing needs to watch
something that re-reads faster than a page load.

**The pass runs at session start** from hooks Specificity already installs
(previous sessions' transcripts are complete; the current one isn't, which is why
start beats end), and **on demand** via CLI and MCP. **Per-file cursors** (byte
offset + inode) mean each run processes only what was appended; a file that
shrinks or changes inode is re-read from zero.

Scanning and proposing are separate concerns: **scan often because it's free,
propose rarely because attention isn't.**

This deletes launchd, systemd units, and Task Scheduler; autostart and its
permission prompts; stale-version-while-running; orphaned processes surviving
delete-to-forget; battery policy; and resource budgets. Uninstall is
`npm uninstall` plus deleting `~/.specificity/`.

**The pass is not per-host** — one Claude Code session start picks up everything
pi wrote since yesterday.

**Health is visible:** `npx specificity review` states when each reader last ran
and what it found, and says so when one is quarantined. Silence must never be
mistaken for "nothing to learn". _(Ticket 11)_

### Seeding

Sections are seeded by whichever method is **reliable for that section**:

| Section | Seeded by | Why |
|---|---|---|
| Interaction Preferences | Interview | Accurately self-reported, and changes agent behaviour on the first session |
| Anti-patterns | Interview, grown by observation | Partially self-reportable; people under-report irritation |
| Request Patterns | Observation only | Nobody can list their own recurring phrasings |
| Rhythm & Context | Observation only | Self-reported hours are unreliable, and this is the cheapest thing to measure |

The interview extension covers **two** sections, not four. Asking people to
describe habits they demonstrably misreport would seed confident wrong facts —
the exact failure v2 exists to fix.

**The first scan is retrospective**, so v2 has something to show immediately —
months of history, not an empty corpus. First run proposes up to **~8 candidates
in one clearly-framed onboarding batch**; everything after obeys the ordinary
throttle. One deliberate exception, once: an upgrade that visibly does nothing
during the week the user is paying attention is an upgrade they abandon.

**Unseeded sections stay absent**, not written as empty headings. Convention v1
says a missing section means unknown, never false — an empty heading would imply
the developer has no rhythm rather than that none is confirmed yet. _(Ticket 12)_

---

## Testing Decisions

### What makes a good test here

Test **external behaviour through the seams below**, never internals. A test
should survive replacing the implementation of the thing it tests. Prior art:
`tests/profile.test.js`, `tests/hooks.test.js`, `tests/mcp.test.js` — plain
`node:assert`, a local `test()` helper, no framework, no fixtures directory, run
via `npm test`. v2 keeps that; a framework would be the first dev dependency for
no gain.

### Seams

Three seams, and only one is test-only — **confirmed by the developer,
2026-07-25**. The count is deliberately small and the interfaces are
load-bearing; adding a fourth needs a reason.

1. **`SPECIFICITY_PROFILE_DIR`** — exists today and is already how
   `tests/profile.test.js` redirects the profile to a temp directory. The entire
   profile, journal, key, and candidate layer tests through it unchanged. No new
   seam needed.
2. **The storage driver interface** — exists for product reasons, not testing. A
   test driver is four trivial functions over a Map; the filesystem driver over a
   temp directory covers real end-to-end sync. Multi-machine merge tests run two
   profile directories against one shared driver.
3. **The reader interface** — also a product interface. Tests feed fixture
   transcript files rather than mocking a host.

Nothing else should be reachable from a test.

### Modules under test

- **Crypto and envelope** — round-trip encrypt/decrypt; a wrong phrase fails
  cleanly; a tampered tag is rejected; the envelope header is version-readable by
  a future parser. Known-answer tests for phrase → key so the derivation can
  never silently change and orphan every existing profile.
- **Journal and materialization** — union merge is order-independent and
  idempotent; a tombstone survives a merge with a machine that still holds the
  fact; a tombstone never contains fact text; hand-edit reconciliation produces
  `stated` events and wins the diff; compaction preserves tombstone hashes.
- **Transcript readers** — fixture-driven, including the adversarial cases the
  survey found: tool-result turns, `isMeta` notices, `sdk`/`system`/
  `suggestion_accepted` prompts, `<local-command-stdout>`, slash-command wrappers,
  and the local-command caveat block. Each must be excluded. This is the
  user-origin gate, so it gets the densest test coverage in the project.
- **Redaction** — a fixture set of known-bad strings that must be caught, so a
  rule regression fails a test rather than leaking silently. Also assert the
  negative: home-path normalization keeps the turn, credential match drops it from
  counting as well as quoting.
- **Extraction** — deterministic extractors against a fixture corpus with known
  expected counts; the precision bar is enforced (nothing proposed below 3
  occurrences across 2 sessions).
- **Confirmation state machine** — `n` returns only after evidence doubles;
  `never` suppresses permanently; `e` stores developer wording with origin
  `stated`; contradiction requires the doubled bar; **no path writes without
  confirmation** — that last one asserted directly, since it is the product's
  core promise.
- **Storage drivers** — the same conformance suite run against every driver, so a
  third-party driver can prove itself against the published contract.

### Not tested

Real network backends, real agent hosts, and timing-sensitive throttle windows —
throttle logic takes an injected clock rather than sleeping.

---

## Out of Scope

- **Team, org, and shared profiles.** v2 is one person. This also removes any
  need for signing or attestation.
- **The Specificity-hosted store** — server, accounts, billing, operations. A
  separate closed repository, built later against v2's public driver contract.
- **Pricing and business model.**
- **Website and marketing** — separate repository.
- **Desktop application**, and now any resident background process.
- **Misunderstanding analytics** (VISION move 5). v2 produces every input it would
  need — the journal, the candidate log, recorded declared-vs-observed tensions —
  but presenting that mirror is a separate product surface and a separate effort.
- **New dialect packs.** The pack framework is unchanged; no new rule is needed
  where observation meets a pack, since both are candidates under the same dedup
  and confirmation, and the person's own words already win.
- **S3/R2 driver** — documented against the contract, implemented outside this
  package.
- **Codex, Cursor, and Antigravity readers** — the interface is public; these can
  be added without a core change.

---

## Further Notes

### Two decisions were measured, not argued

Worth preserving, because both reversed a plausible plan:

**0.41 seconds deleted the daemon.** The charted design assumed a resident
background process. Measuring a full cold scan removed it, along with three
platform integrations, autostart, update handling, and orphan cleanup. Measure
before building the heavy thing.

**Sixty prompts disproved an interview.** The profile said "Very terse"; the data
said median 32.5 words with a distinct terse mode for approvals. That single
finding is the product thesis demonstrating itself — and the same run found **zero
occurrences** of dialect markers the profile declares, which is the counter-lesson:
observation on a small single-host sample can be wrong, so it must never overwrite
a stated fact on its own. Both cases together produced the contradiction policy.

### Documentation owed alongside the build

`docs/PROFILE-CONVENTION.md` needs the four new optional sections and the `_`
sidecar expectations documented. v2 is additive, so **no version bump and no
migration guide** — but the convention is public and consumers read it.

`README.md` needs the coverage split stated plainly rather than implied.

### Sequencing suggestion

The dependency order that fell out of the map: data model → crypto → store
contract → merge model, then readers → redaction → extraction → confirmation,
then coverage, runtime, seeding. The first chain makes the profile portable; the
second makes it learn. Either half is shippable alone, and the portability half
is the smaller and better-defined of the two.

### Provenance

Full reasoning for every decision above lives in `.wayfinder/tickets/` (twelve
closed tickets) with three assets: the transcript survey, the extraction
prototype, and the confirmation render. That directory is gitignored — it contains
open-core strategy and this repository is public.
