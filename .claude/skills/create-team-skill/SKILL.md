---
name: create-team-skill
description: |
  Authoring guide for creating a new skill in this plugin, matching the conventions
  the existing skills already use. Establishes the principle-or-not classification
  (Part 0) and the three decisions every skill must make before any prose is written:
  how it is invoked (entry point vs building block), how it acquires its input, and
  how it manages the context window.
  Do NOT hand-write a SKILL.md directly. Trigger on "create a skill",
  "add a new skill", "scaffold a skill", "write a SKILL.md", or a description of
  new skill functionality the user wants to build.
---

# Creating a new Team skill

This is the dev-workspace guide for authoring a skill in this plugin. Follow it so a new
skill matches the conventions the existing skills already use. A skill is a document the
agent reads, not a function it calls. Before writing one, classify it — principle
skill or not (Part 0) — then make three decisions in order. Each has a
wrong-by-default failure mode, so decide deliberately rather than copying
another skill's wiring.

1. **Invocation** — is this an entry point (user/model triggers it) or a building
    block (another skill composes it)? This defines what the skill *is*.
2. **Input** — how does it get the thing it operates on? Discover it. Do not demand it.
3. **Context** — how does it stay inside the window while it runs? Offload, delegate,
    search.

## Shared convention: the artifacts directory

Every skill that hands off uses one durable, repo-local directory for what it would
otherwise "keep in the conversation". That covers inputs passed between skills,
checkpoints, and findings. In this repo that directory is **`docs/plans/<id>/`**, where
`<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. This guide calls it
`<ARTIFACTS>`. Producers write there. Consumers discover and read from there. The
agreement matters more than the path: every handoff uses the same convention so skills
stay decoupled.

---

## Part 0 — Principle skill or not

Decide this before Part 1: the verdict fixes the name, the shape, and the frontmatter.
A `principle-` skill states ONE cross-cutting invariant that other skills obey by
citation (`principle-bounded-loops`, `principle-fail-closed`). Everything else —
procedures, phase methodology, pattern catalogs, entry points — is a regular skill with
no prefix. (The multi-rule methodology sets — `solid`, `product-thinking`,
`systems-thinking` — deliberately carry no prefix: a bundle never earns it,
however principle-shaped its content.)

Run the eight-point admission test:

1. **One invariant, one sentence.** The rule states in a single sentence what must
   always (or never) hold. If it needs an "and", it is two principles or a methodology
   skill. A corollary of an existing principle folds into that principle instead of
   becoming a new skill.
2. **Citable by name mid-task.** "That violates principle-<name>" must make the
   correction obvious on its own. A name that invokes an action ("review this",
   "set up X") names a procedure, not a principle.
3. **Violation is observable.** You can point at a transcript, diff, or artifact and
   say "here is where it broke." A value statement whose violation is always arguable
   does not qualify.
4. **Not mechanizable.** If a test, hook, or lint enforces it more reliably, build the
   gate instead (docs/testing.md: push every check as far down and as deterministic as
   it goes). A principle is reserved for what only judgment can enforce.
5. **Two-plus independent consumers.** At least two skills or agents already restate
   the rule, or would cite it at a point of application.
6. **Extraction replaces restatement.** Admitting it lets existing prose collapse to a
   citation in the same change. If nothing would cite it, it has no consumers.
7. **Earned, not aspirational.** It encodes an observed failure (ideally recurring) or
   an invariant the system already enforces somewhere. Imported best practices with no
   local scar tissue do not get the prefix.
8. **Fits the shape.** Statement + why + pattern in roughly 30 lines. Frontmatter:
   `user-invocable: false`, an "Apply when …" description, no `effort` field.
   Consumers cite it and any agent loads it just-in-time. An agent that does
   preload one counts that name against its load budget like any other. The
   set is enumerated in `docs/skills.md` under `## Methodology skills`, one
   `### [principle-<name>]` entry per directory on disk, and
   `tests/methodology.test.ts` asserts that equality in both directions — so
   a new principle skill lands with its catalog entry in the same change.

**Passing grade — the bar is tiered, not a count:**

- **Criteria 1–4, 7, and 8 are hard gates.** Any failure is a rejection. 1–4 and 8 are
  categorical (a bundle, an action name, an arguable value, a lint-able rule, or a
  procedure is simply not a principle skill), and 7 guards against importing doctrine
  the project never bled for.
- **Criteria 5–6 are the demand test, and it is met two ways.** Two independent
  consumers meet it. So does a single current consumer when the invariant is clearly
  cross-cutting: the "Apply when" line names concrete situations a second consumer
  would hit, and the one existing consumer's restatement still collapses to a
  citation. Record the single-consumer status in the commit message. An unused `principle-` skill costs
  nearly nothing at load time, so extracting slightly ahead of demand is cheap — but a
  rule with no consumer at all stays inline where it is used.

Verdicts:

- **Passes the bar** → author it as `skills/principle-<name>/` in the shape above, and
  collapse each consumer's restatement to a citation in the same change.
- **Fails any hard gate** → not a principle. Author it as a regular skill via
  Parts 1–3. If a single invariant is buried inside it (a procedure that exists to
  uphold one rule), consider extracting THAT invariant as the principle and letting
  the procedure cite it.
- **Fails 7 only** → the rule may be right but is unproven here. Keep it inline and
  revisit after it has caught or caused something real.

---

## Part 1 — Invocation surface

The load-bearing rule: **a building block never gets its own slash command.**
Composition itself has three sanctioned forms — a Skill-tool load (``Call the Skill
tool with `<name>` ``, the form `tests/skill-tool-invocation.test.ts` resolves), a
read-and-follow by path, or a subagent. What a composed skill must not do is register
as a command a user could type: that is what `user-invocable: false` is for.

**First, make the invocation-surface decision — do not skip it.** Classify the skill
into exactly one of three buckets, then carry the verdict into the frontmatter:

| Bucket | What it means | Frontmatter | Examples |
|--------|---------------|-------------|----------|
| **Both** (default for anything a user might run) | A user triggers it by intent **and** the model/another skill may pull it in | leave `user-invocable` unset (default) | `team`, `team-*`, `why`, `how` |
| **User-invocable only** | A user must trigger it explicitly. The model must NOT auto-fire it | `disable-model-invocation: true` | a per-skill call, each with its own recorded reason: `pr-rebase`, `pr-watch-as-reviewer`, `reflect` |
| **Model-invocable only** (pure building block) | Reference material loaded by agents / read by path. A `/<skill>` command is meaningless to users | `user-invocable: false` | every pure methodology skill (`qrspi-workflow`, `solid`, …) |

Decide with these tests, in order:

1. **Does an invocation authorize a write** beyond a `docs/plans/` artifact or an
   invocation-local scratch file (deploys, pushes, commits, deletes, sends)? → it
   guards in its description, per §1A step 3. Whether it also sets
   `disable-model-invocation` is a further per-skill call, made on its own recorded
   reason — three skills have one today; a skill that sets it on that reason lands in
   **User-invocable only**.
2. **Is it purely reference material** — methodology, conventions, a protocol another
   agent reads — with no standalone "do this now" meaning for a user? →
   **Model-invocable only**.
3. **Would a user plausibly type `/<skill>` to run it as an action**, even if agents also
   compose it? → **Both** (the default, do not over-restrict).

**A methodology skill is never user-invocable. There is no exception.** If test 2 sent
you to **Model-invocable only**, you may not then also register a slash command "because
a user might run it too". That combination is what makes a file carry a user-facing
command *and* the methodology four agents preload, and the rule in
[`docs/skills.md`](../../../docs/skills.md) — methodology skills are never invoked
directly — then has to be written with an exception attached to your skill.

When a methodology genuinely wants a user-facing command, build a **front door**: the
methodology keeps `user-invocable: false`, and a *separate* entry-point skill carries the
slash command, resolves the argument, dispatches, and loads the methodology by name. Two
skills, one bucket each. `reviewing-code` (methodology, model-only) and `code-review`
(front door, entry point) are the worked pair. The front door is not a bare pointer — it
keeps whatever is true of the *invoking surface* rather than of the methodology, which for
`code-review` is the rule that the session holding the code's conversation history is not
a valid reviewer.

**If you cannot place the skill in one bucket with high confidence, STOP and ask the user**
through `AskUserQuestion` (header `Invocation`), with the three buckets as options. State
your leaning and why, and let them confirm. Do not silently guess. The wrong choice
either clutters the menu or hides a command users expect. Once decided, wire the
surface(s) per §1A / §1B below and set the frontmatter from the table above.

### §1A — Wire it as an entry point

1. **Write the description as a router.** Lead with WHAT it does, then end with the
    trigger sentence naming the phrases and the slash name that should fire it:
    ```yaml
    description: |
      <one line: what this does>.
      Trigger on "<phrase>", "<phrase>", or "/<name>".
    ```
    Specific intents + example phrases = reliable triggering. Vague text = mis-routing.
2. **Add one line to the routing map** in your standing agent instructions — in this
    repo that's the Entry Points table in `AGENTS.md`: `- <user intent> → invoke
    /<skill>`. This is guidance the agent reads, not a code gate, so keep it in sync
    with the description.
3. **A skill that authorizes a write MUST guard.** The class is a complement pair
    over every write an invocation authorizes, so it returns one answer per skill.
    *Out of class*: the invocation reads only, or writes only (1) files under
    `docs/plans/` and (2) invocation-local scratch files — untracked, created and
    consumed inside the same run, carried by no commit, and read by no later phase.
    *In class*: everything else — a change to any file the repo tracks, or to an
    untracked file the change is meant to deliver; a git write to history or refs (a
    commit, a branch, a rebase, a push, a branch delete); or a change on a host
    outside the checkout (a PR opened, approved, or merged; a ticket or issue moved,
    filed, or closed; a deploy). Committing, pushing, opening a PR, moving a ticket,
    merging, deploying, and deleting all illustrate the in-class half. A write the
    invocation never authorized, such as an unsandboxed vendor CLI mutating the
    tree during a cross-model pass, moves no skill into the class: the caller
    detects that write and reverts it rather than authoring it. An in-class skill
    carries shipit-style explicit-intent guard wording ("Invoke ONLY on explicit …
    intent — … never infer …") beside or instead of the plain
    `Trigger on` carrier. Word its routing-map line with that same
    explicit intent, so the map never invites the skill on a plain request — `team-fix`
    is listed as a command but reached only on stated pipeline intent, never on "fix
    this bug". The description still carries the quoted phrases and the `/<name>` — the trigger
    test has no opt-out, but it checks phrase presence only: no test checks the guard
    wording, so it is YOUR responsibility, and its absence on an in-class skill
    is a review-blocking defect.
    **Second tier:** a skill that gates every mutation on its own in-run approval
    carries the guard there instead — `groom-backlog` presents each irreversible
    close and waits. Setting a hard opt-out flag (e.g. `disable-model-invocation`)
    is a further per-skill call with its own recorded reason, never a property of
    this class; on hosts that ignore the flag the description is the only control
    either way.

### §1B — Wire it as a building block

Composability is never declared — any skill file can be composed. What you choose is HOW
a parent pulls it in, by if the parent needs coordination or isolation:

- **(a) Inline** — parent reads this skill's file and follows it. For sequential work
  the parent coordinates and weaves into one result. Parent instruction reads:
  > "Follow <child>/SKILL.md — all sections, full depth. Skip: <list>." Author this child
  with clearly-headed, independently-runnable sections (parents skip by header), and do
  not assume you own the whole conversation.

- **(b) Subagent** — the parent spawns a fresh-context agent to run this. Use it for an
  unbiased perspective, such as adversarial review, or for parallelism, such as N
  variants or specialists at once. Parent instruction reads:
  > "Dispatch as a subagent (fresh context). Launch all N in one message. Return the
  >  conclusion only."
  Author this child to be self-contained (it gets a clean window — say what to read up
  front) and to return a conclusion, not a transcript.

- **(d) Prerequisite offer** — parent offers this when input is missing:
  > "No <artifact> found. A) run /<child> now  B) skip and proceed."
  If accepted, the parent inlines it (mechanism a).

**Hide it from the slash menu.** A pure building block is reference material, not a user
action, so a `/<skill>` command for it is meaningless. Set `user-invocable: false` in its
frontmatter to keep it out of the `/` menu. The field governs *menu visibility only*. It
does not affect read-and-follow or subagent composition (those reach the file directly),
and the model can still auto-load it when relevant. In this repo every pure methodology
skill sets this. Entry-point skills leave it unset so they register as slash commands. (A
skill wired as *both* surfaces stays user-invocable — do not set it. But a methodology
skill is never one of those: it sets the field and gets a front door instead. The
`code-review`/`reviewing-code` pair is the worked example — `reviewing-code` sets the
field and is loaded as composed methodology by the review agents, while `code-review` is
a separate entry-point skill that dispatches the review. No methodology skill in this repo
is user-invocable.)

### Invocation invariants
- Composition = a Skill-tool load, a read-and-follow by path, OR a subagent. What a
  building block never gets is its own slash command.
- Heavy or adversarial sub-work → subagent (keeps the parent lean and unbiased).
  Sequential/coordinated sub-work → inline.
- A skill can serve both surfaces. Just make its description trigger correctly AND its
  sections survive being inlined/subagented.
- A skill whose invocation authorizes a write guards in its description; setting
  `disable-model-invocation` on top of that is a per-skill call with its own reason.
- Pure building block → `user-invocable: false` (out of the slash menu, still loadable).
- A methodology skill is never user-invocable. If it wants a command, add a front-door
  entry-point skill beside it; never leave the field unset to get both.

---

## Part 2 — Input acquisition

Skills DISCOVER their input from conventions and only ask the user as a fallback. Pick
the archetype that matches the input type. Default to §2A for documents.

| If the skill operates on... | Use |
|------------------------------|-----|
| A plan / design / spec document | **§2A — convention-based discovery** (default) |
| The current branch's code changes | **§2B — branch-diff detection** |
| A short scalar (URL, time window, ID) | **§2C — positional args + flags** |
| A problem the user must describe / scope | **§2D — ask-first** |

### §2A — Convention-based document discovery (archetype A)
The skill takes an OPTIONAL artifact-directory arg and DISCOVERS it when omitted.
Discovery is the front door, and the arg is only an override. Declare the hint in
frontmatter:
```yaml
argument-hint: "[docs/plans/<id>/]"
```
Pass the exact `$ARGUMENTS` as stdin data to the shared resolver; never place it in
shell text or argv:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor <artifact>.md
```

Add `--require-design-review` when that gate applies. The helper owns explicit-path
selection, `ID_RE`, `PHASE_FILES`, newest-mtime discovery, predecessor validation,
and design-review validation. It returns `resolved` or `needs-input`. Announce a
discovered directory before proceeding — never pick a topic silently.

- If a directory resolves: read the predecessor artifact from it. Treat it as source of
  truth for problem, constraints, approach.
- `needs-input` (REQUIRED): do NOT error. Fire `AskUserQuestion` (header `Setup`) with two
  labeled options. **Run the producer** runs `/team-<producer>` to create the missing
  artifact. **Give a path** lets the user supply `docs/plans/<id>/`.

### §2B — Branch-diff detection (code review)
No argument. Detect the base branch through a fallback chain, then diff:
```bash
BASE=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null)
[ -z "$BASE" ] && BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$BASE" ] && BASE=main
git diff "origin/$BASE"...HEAD
```
Never hardcode the base branch without the chain above it.

### §2C — Positional args + flags (scalars only)
Reserve arguments for scalars, never documents. Parse with sensible defaults (`/skill 7d`
→ default `7d`, `/skill <url> --quick`). Auto-discover when a flag is omitted. Always
state the default you chose.

### §2D — Ask-first
Start from what the user already typed. Auto-discover repo context (search, diff,
README). Ask ONE question at a time, only for genuine gaps. Do not interrogate when the
answer is already on disk. (In this repo, `/team-question` is the ask-first producer that
seeds `docs/plans/<id>/` for the archetype-A consumers downstream.)

### Input invariants
- Discover before you demand, wherever there is something to discover. A question is
  the fallback, not the front door. The ask-first archetype (§2D) has no discoverable
  input, so it asks.
- The empty/not-found path uses `AskUserQuestion` to offer a producer or ask for a
  path — it never throws.
- Each shell block is its own process — recompute derived vars. Do not rely on persistence.
- An argument carries a scalar (URL/window/ID) or an OPTIONAL artifact-dir path that
  discovery resolves when omitted — never the document's contents.
- **Never write a `$` immediately followed by a digit anywhere in a SKILL.md.** The
  loader reads it as an argument placeholder and substitutes the caller's Nth argument,
  which silently rewrites awk record/field variables and shell positional parameters in
  your snippets. Read a line into a named variable and match it with `case`, or reach
  for `cut`/`sed`, instead. The documented backslash escape is not enough: a host that
  substitutes the placeholder without implementing the escape leaves the backslash in
  the command. `tests/regression-skill-body-positional-args.test.ts` enforces this.

---

## Part 3 — Context discipline

There are two token economies. Treat them oppositely.

1. **The payload** (these instructions, the skill text) is cached and amortized. Do NOT
    compress it for size's sake — completeness here is cheap. A long, complete skill
    beats a terse, ambiguous one.
2. **The working set** (everything READ and GENERATED at runtime) is uncached and grows
    without bound. This is what you ration. Prefer to never pull bytes into the window
    over summarizing them after the fact.

Be generous with the payload, ruthless with the working set. Execution rules, in order:

1. **Offload state to disk.** Write decisions, plans, and findings to `<ARTIFACTS>/*.md`.
    Read back on demand instead of keeping them resident. When a long task risks losing
    state, checkpoint to `<ARTIFACTS>/checkpoint-<timestamp>.md` (branch, done,
    decisions, remaining, open questions) — append-only, never overwrite. A fresh window
    resumes from the file, not from replayed history.
2. **Delegate heavy reading to subagents.** Broad fan-out (sweeping many files, comparing
    variants, adversarial review) goes to a subagent that burns ITS window and returns
    only the conclusion. Launch independent subagents in parallel (one message). Once you
    delegate a search, don't also run it yourself.
3. **Search, do not read whole files.** For where/what/which questions, use semantic
    search if available, else targeted grep/glob; pull excerpts and line ranges. Don't
    `cat` a large file to "see what's there." Don't re-read a file you just edited to
    make sure it.
4. **Reference, do not copy.** When building inputs for a sub-task or test, extract the
    relevant lines — never paste a 1000+ line file. Large irrelevant context causes
    timeouts and multi-x slowdowns, not just cost.

Gate yourself before acting:
- Before reading: "Whole file or a section? Can a search answer this? Should a subagent read it?"
- Before spawning: "Broad enough to delegate? Can these run in parallel?"
- Before continuing a long task: "Is there state I'd lose on compaction? Checkpoint it now."

### Context anti-patterns
- Reading whole files to 'get oriented'.
- Keeping a doc/plan/findings resident across many turns instead of writing to
  `<ARTIFACTS>` and re-reading on demand.
- Pasting large files into sub-task prompts or fixtures.
- Doing a broad multi-file sweep inline when a subagent could return just the answer.
- Compressing your own instructions to "save tokens" — that is the cached payload, not
  where the cost is.

---

## Part 4 — Host manifest

Every skill under `skills/` also ships `skills/<name>/agents/openai.yaml`, the
per-skill manifest Codex reads to build its catalog entry. Without it, Codex
falls back to the directory name and a truncated `description:`. It is optional
upstream and mandatory here — `tests/skill-openai-yaml.test.ts` gates it.

This part consumes Part 0's name and Part 1's verdict, so run it last.

The whole file, for a skill that is model-invocable at all:

```yaml
interface:
  display_name: "<Display Name>"
  short_description: "<imperative phrase>"
  default_prompt: "Use $<name> to <short description, first letter lowercased>."
```

**Style.** Two-space indent. Every string value double-quoted; every key
unquoted. The three remaining `interface` keys — `icon_small`, `icon_large`,
`brand_color` — are deliberately unused, and so is `dependencies`, which is a
TOP-LEVEL key in the spec, never an `interface` one. Nesting it under
`interface:` fails the gate's interface allowlist.

**The three fields.** Each is derived, not invented:

1. `display_name` — title-case the kebab `name:`. Split on `-`; uppercase any
   token in `{pr, ux, qrspi, solid}`; leave any token in
   `{a, as, at, by, for, in, of, on, the, to}` lowercase unless it comes first;
   otherwise capitalize the first character. A `principle-` prefix becomes the
   literal `Principle: ` — so `principle-fail-closed` renders
   `Principle: Fail Closed`, and `pr-verify` renders `PR Verify`. A new acronym
   is a decision: add it to that list in the test in the same change.
2. `short_description` — 25 to 64 characters inclusive, imperative, verb first,
   first character capitalized, no trailing period, and unique across every
   skill. **It must be a verb phrase, not a noun phrase.** `"Architecture
   Decision Record format"` sits inside the window and is still wrong: read it
   back inside the `default_prompt` below and it is not a request. `"Record an
   architectural decision"` is. Do not open with an article or an acronym —
   the template lowercases the first character, and `"sOLID"` is the result.
3. `default_prompt` — the template exactly: `Use $<name> to <short description
   with its first character lowercased>.` The `$<name>` token names the skill
   explicitly using its own declared `name:`.

**The one fork.** If the Part 1 verdict was **user-invocable only**, append a
blank line and a policy block:

```yaml

policy:
  allow_implicit_invocation: false
```

That is the Codex-side restatement of `disable-model-invocation: true`, and the
gate asserts the two agree in both directions: a policy block on a skill that
never set the frontmatter key fails just as loudly as a guarded skill without
one. Any other verdict emits no `policy` block at all.

---

## Acceptance checklist (verify before the skill is done)

Classification
- [ ] Part 0 verdict recorded: principle skill or regular skill.
- [ ] If principle: all hard gates (1–4, 7, 8) pass; 5–6 both hold, or the one-consumer
      waiver is justified and noted in the commit message.
- [ ] If principle: named `principle-<name>`, ~30-line statement + why + pattern shape,
      `user-invocable: false`, no `effort`, and every consumer's restatement collapsed
      to a citation in the same change.
- [ ] If a rule passed the identity gates but has no consumer: left inline in its
      consumer, not extracted.

Invocation
- [ ] Invocation surface decided — **both** / **user-invocable only** / **model-invocable only** — with high confidence. If not, asked the user through `AskUserQuestion`.
- [ ] Frontmatter matches the verdict: both → neither flag. User-only → `disable-model-invocation: true`, with the reason for this skill recorded. Model-only → `user-invocable: false`.
- [ ] If it is methodology, it is **not** user-invocable. A user-facing command for it is a separate front-door skill, not an unset flag on this one.
- [ ] Only the intended path(s) wired (entry point §1A, building block §1B, or both).
- [ ] Entry point: description has WHAT + explicit trigger intents/phrases. Added to routing map.
- [ ] Building block: chose inline (sequential) vs subagent (isolated/parallel) deliberately.
- [ ] If subagented: self-contained, returns a conclusion not a transcript. If inlined: headed, independently-runnable sections.
- [ ] No composed building block registers its own slash command.

Input
- [ ] Correct archetype chosen (default §2A for documents).
- [ ] Archetype-A: `argument-hint` declared; raw arguments reach the shared resolver
      through stdin with the required predecessor and optional design-review gate.
- [ ] Discovery runs before any question wherever there is something to discover (§2D, the ask-first archetype, has no discoverable input). An auto-picked topic is announced.
- [ ] Empty/not-found path uses `AskUserQuestion` (run producer / give path) — never throws.
- [ ] Base branch (if used) through the fallback chain, no bare `main`. Args carry a
      scalar or optional artifact-dir path, never document contents.

Context
- [ ] State offloaded to `<ARTIFACTS>`. Long tasks checkpoint.
- [ ] Heavy/broad reading delegated to subagents. Conclusions returned, not transcripts.
- [ ] Searches/excerpts over whole-file reads. No copying large files into sub-tasks.
- [ ] Payload left complete (not compressed for size). Working set kept lean.

Host manifest
- [ ] File exists at `skills/<name>/agents/openai.yaml`.
- [ ] `short_description` is an imperative phrase of 25–64 characters — a verb
      phrase, not a noun phrase.
- [ ] Every string value double-quoted; every key unquoted.
- [ ] `default_prompt` is the template, naming `$<name>`.
- [ ] `policy` block present, and carrying the literal
      `allow_implicit_invocation: false`, if and only if the frontmatter sets
      `disable-model-invocation: true`.
- [ ] `bun test tests/skill-openai-yaml.test.ts` passes.
