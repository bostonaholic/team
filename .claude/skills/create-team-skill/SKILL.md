---
name: create-team-skill
description: |
  Authoring guide for creating a new skill in this plugin, matching the conventions
  the existing skills already use. Establishes the three decisions every skill must
  make before any prose is written: how it is invoked (entry point vs building block),
  how it acquires its input, and how it manages the context window.
  Proactively invoke this skill (do NOT hand-write a SKILL.md directly) when the user
  asks to "create a skill", "add a new skill", "scaffold a skill", "write a SKILL.md",
  or describes new skill functionality they want to build.
---

# Creating a new Team skill

This is the dev-workspace guide for authoring a skill in this plugin; follow it so a
new skill matches the conventions the existing skills already use. A skill is a
document the agent reads, not a function it calls. Before writing one, make three
decisions in order. Each has a wrong-by-default failure mode, so decide deliberately
rather than copying another skill's wiring.

1. **Invocation** — is this an entry point (user/model triggers it) or a building
    block (another skill composes it)? This defines what the skill *is*.
2. **Input** — how does it get the thing it operates on? Discover it; don't demand it.
3. **Context** — how does it stay inside the window while it runs? Offload, delegate,
    search.

## Shared convention: the artifacts directory

Every skill that hands off uses one durable, repo-local directory for what it would
otherwise "keep in the conversation" — inputs passed between skills, checkpoints,
findings. In this repo that directory is **`docs/plans/<id>/`**, where `<id>` is
`<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. This guide calls it `<ARTIFACTS>`.
Producers write there; consumers discover and read from there. The agreement matters
more than the path: every handoff uses the same convention so skills stay decoupled.

---

## Part 1 — Invocation surface

The load-bearing rule: **composition never goes through the skill-invocation tool.**
The invocation tool is for the top surface only — a user typing the skill, or the model
auto-invoking it by intent. When one skill pulls in another, it *reads that skill's file*
or *spawns a subagent*.

**First, make the invocation-surface decision — do not skip it.** Classify the skill
into exactly one of three buckets, then carry the verdict into the frontmatter:

| Bucket | What it means | Frontmatter | Examples |
|--------|---------------|-------------|----------|
| **Both** (default for anything a user might run) | A user triggers it by intent **and** the model/another skill may pull it in | leave `user-invocable` unset (default) | `team`, `team-*`, `code-review` |
| **User-invocable only** | A user must trigger it explicitly; the model must NOT auto-fire it | `disable-model-invocation: true` | irreversible actions: deploy, force-push, destructive cleanup |
| **Model-invocable only** (pure building block) | Reference material loaded by agents / read by path; a `/<skill>` command is meaningless to users | `user-invocable: false` | every pure methodology skill (`qrspi-workflow`, `solid-principles`, …) |

Decide with these tests, in order:

1. **Is it irreversible or side-effecting** (deploys, pushes, deletes, sends)? →
   **User-invocable only**. Never let the model auto-trigger it.
2. **Is it purely reference material** — methodology, conventions, a protocol another
   agent reads — with no standalone "do this now" meaning for a user? →
   **Model-invocable only**.
3. **Would a user plausibly type `/<skill>` to run it as an action**, even if agents
   also compose it? → **Both** (the default; don't over-restrict).

**If you cannot place the skill in one bucket with high confidence, STOP and ask the
user** via `AskUserQuestion` (header `Invocation`) with the three buckets as options —
state your leaning and why, and let them confirm. Do not silently guess; the wrong
choice either clutters the menu or hides a command users expect. Once decided, wire the
surface(s) per §1A / §1B below and set the frontmatter from the table above.

### §1A — Wire it as an entry point

1. **Write the description as a router.** Lead with WHAT it does, then name the user
    intents and phrases that should fire it:
    ```yaml
    description: |
      <one line: what this does>.
      Proactively invoke this skill (do NOT answer directly) when the user
      <intent A>, <intent B>, or says "<phrase>", "<phrase>".
    ```
    Specific intents + example phrases = reliable triggering. Vague text = mis-routing.
2. **Add one line to the routing map** in your standing agent instructions — in this
    repo that's the Entry Points table in `AGENTS.md`: `- <user intent> → invoke
    /<skill>`. This is guidance the agent reads, not a code gate, so keep it in sync
    with the description.
3. **To make it user-explicit-ONLY:** omit the proactive-invoke language and leave it
    off the routing map. If your host honors a hard opt-out flag (e.g.
    `disable-model-invocation`), set it — but on hosts that ignore it, the description is
    the only control. Use this for irreversible skills (deploy, force-push, destructive
    cleanup) so they require an explicit ask.

### §1B — Wire it as a building block

Composability is never declared — any skill file can be composed. What you choose is
HOW a parent pulls it in, by whether the parent needs coordination or isolation:

- **(a) Inline** — parent reads this skill's file and follows it. For sequential work
  the parent coordinates and weaves into one result. Parent instruction reads:
  > "Follow <child>/SKILL.md — all sections, full depth. Skip: <list>."
  Author this child with clearly-headed, independently-runnable sections (parents skip
  by header), and don't assume you own the whole conversation.

- **(b) Subagent** — parent spawns a fresh-context agent to run this. For unbiased
  perspective (adversarial review) or parallelism (N variants/specialists at once).
  Parent instruction reads:
  > "Dispatch as a subagent (fresh context). Launch all N in one message. Return the
  >  conclusion only."
  Author this child to be self-contained (it gets a clean window — say what to read up
  front) and to return a conclusion, not a transcript.

- **(d) Prerequisite offer** — parent offers this when input is missing:
  > "No <artifact> found. A) run /<child> now  B) skip and proceed."
  If accepted, the parent inlines it (mechanism a).

**Hide it from the slash menu.** A pure building block is reference material, not a
user action, so a `/<skill>` command for it is meaningless. Set `user-invocable: false`
in its frontmatter to keep it out of the `/` menu. The field governs *menu visibility
only* — it does not affect read-and-follow or subagent composition (those reach the file
directly), and the model can still auto-load it when relevant. In this repo every
pure methodology skill sets this; entry-point skills leave it unset so they register as
slash commands. (A skill wired as *both* surfaces stays user-invocable — don't set it;
`code-review` is the repo's standing example: it is loaded as composed methodology by
the review agents yet is also a direct user action ("review this diff"). It's the only
methodology skill kept user-invocable.)

### Invocation invariants
- Never compose via the skill-invocation tool. Composition = read-and-follow OR subagent.
- Heavy or adversarial sub-work → subagent (keeps the parent lean and unbiased).
  Sequential/coordinated sub-work → inline.
- A skill can serve both surfaces; just make its description trigger correctly AND its
  sections survive being inlined/subagented.
- Don't auto-trigger irreversible skills.
- Pure building block → `user-invocable: false` (out of the slash menu, still loadable).

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
The skill takes an OPTIONAL artifact-directory arg and DISCOVERS it when omitted —
discovery is the front door, the arg only an override. Declare the hint in frontmatter
and read `$ARGUMENTS`:
```yaml
argument-hint: "[docs/plans/<id>/]"
```
Resolve the directory with the canonical **three-tier** block:
1. **Explicit** — `$ARGUMENTS` names an existing dir → use it verbatim.
2. **Discover** — newest-mtime dir under `docs/plans/` that matches `ID_RE` and holds
   this skill's predecessor artifact (filter by `ID_RE` / `PHASE_FILES`). Announce the
   auto-picked directory before proceeding — never pick a topic silently.
3. **None found** — fall to the empty case below; do not error.

Do NOT hand-roll this block. Copy it **verbatim** from an existing archetype-A skill
(e.g. `skills/team-research/SKILL.md`) — the dev gate
`.claude/scripts/check-discovery-consistency.sh` asserts byte-identity across every
archetype-A skill, so any variant fails the suite. Run it as a single bash call (an
agent thread resets cwd between calls).

- If a directory resolves: read the predecessor artifact from it; treat it as source of
  truth for problem, constraints, approach.
- Empty case (REQUIRED): do NOT error. Fire `AskUserQuestion` (header `Setup`) with two
  labeled options — **Run the producer** (`/team-<producer>` to create the missing
  artifact) or **Provide a path** (the user supplies `docs/plans/<id>/`).

### §2B — Branch-diff detection (code review)
No argument. Detect the base branch via a fallback chain, then diff:
```bash
BASE=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null)
[ -z "$BASE" ] && BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$BASE" ] && BASE=main
git diff "origin/$BASE"...HEAD
```
Never hardcode the base branch without the chain above it.

### §2C — Positional args + flags (scalars only)
Reserve arguments for scalars, never documents. Parse with sensible defaults
(`/skill 7d` → default `7d`; `/skill <url> --quick`); auto-discover when a flag is
omitted; always state the default you chose.

### §2D — Ask-first
Start from what the user already typed. Auto-discover repo context (search, diff,
README). Ask ONE question at a time, only for genuine gaps. Don't interrogate when the
answer is already on disk. (In this repo, `/team-question` is the ask-first producer
that seeds `docs/plans/<id>/` for the archetype-A consumers downstream.)

### Input invariants
- Discover before you demand; a question is the fallback, not the front door (except §2D).
- The empty/not-found path uses `AskUserQuestion` to offer a producer or ask for a
  path — it never throws.
- Each shell block is its own process — recompute derived vars; don't rely on persistence.
- An argument carries a scalar (URL/window/ID) or an OPTIONAL artifact-dir path that
  discovery resolves when omitted — never the document's contents.

---

## Part 3 — Context discipline

There are two token economies; treat them oppositely.

1. **The payload** (these instructions, the skill text) is cached and amortized. Do NOT
    compress it for size's sake — completeness here is cheap. A long, complete skill
    beats a terse, ambiguous one.
2. **The working set** (everything READ and GENERATED at runtime) is uncached and grows
    without bound. This is what you ration. Prefer to never pull bytes into the window
    over summarizing them after the fact.

Be generous with the payload, ruthless with the working set. Execution rules, in order:

1. **Offload state to disk.** Write decisions, plans, and findings to `<ARTIFACTS>/*.md`;
    read back on demand instead of keeping them resident. When a long task risks losing
    state, checkpoint to `<ARTIFACTS>/checkpoint-<timestamp>.md` (branch, done, decisions,
    remaining, open questions) — append-only, never overwrite. A fresh window resumes
    from the file, not from replayed history.
2. **Delegate heavy reading to subagents.** Broad fan-out (sweeping many files, comparing
    variants, adversarial review) goes to a subagent that burns ITS window and returns
    only the conclusion. Launch independent subagents in parallel (one message). Once you
    delegate a search, don't also run it yourself.
3. **Search, don't read whole files.** For where/what/which questions, use semantic search
    if available, else targeted grep/glob; pull excerpts and line ranges. Don't `cat` a
    large file to "see what's there." Don't re-read a file you just edited to confirm it.
4. **Reference, don't copy.** When building inputs for a sub-task or test, extract the
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
- Compressing your own instructions to "save tokens" — that's the cached payload, not
  where the cost is.

---

## Acceptance checklist (verify before the skill is done)

Invocation
- [ ] Invocation surface decided — **both** / **user-invocable only** / **model-invocable only** — with high confidence; if not, asked the user via `AskUserQuestion`.
- [ ] Frontmatter matches the verdict: both → neither flag; user-only → `disable-model-invocation: true`; model-only → `user-invocable: false`.
- [ ] Only the intended path(s) wired (entry point §1A, building block §1B, or both).
- [ ] Entry point: description has WHAT + explicit trigger intents/phrases; added to routing map.
- [ ] Building block: chose inline (sequential) vs subagent (isolated/parallel) deliberately.
- [ ] If subagented: self-contained, returns a conclusion not a transcript. If inlined: headed, independently-runnable sections.
- [ ] No skill invokes another via the skill-invocation tool.

Input
- [ ] Correct archetype chosen (default §2A for documents).
- [ ] Archetype-A: `argument-hint` declared; discovery block copied verbatim from an
      existing skill (e.g. team-research), not hand-rolled — the dev consistency gate enforces byte-identity.
- [ ] Discovery runs before any question (except §2D); an auto-picked topic is announced.
- [ ] Empty/not-found path uses `AskUserQuestion` (run producer / provide path) — never throws.
- [ ] Base branch (if used) via the fallback chain, no bare `main`. Args carry a scalar
      or optional artifact-dir path, never document contents.

Context
- [ ] State offloaded to `<ARTIFACTS>`; long tasks checkpoint.
- [ ] Heavy/broad reading delegated to subagents; conclusions returned, not transcripts.
- [ ] Searches/excerpts over whole-file reads; no copying large files into sub-tasks.
- [ ] Payload left complete (not compressed for size); working set kept lean.
