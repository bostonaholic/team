---
title: Cross-host portability
description: "A capability matrix mapping Team's Claude Code plugin primitives onto the other hosts it runs on — Codex CLI, Antigravity CLI, and OpenCode — and their supported capabilities."
audience: [developer]
nav_order: 9
nav_label: portability
---

# Cross-host portability

Team also generates an [Agent Plugins 1.0.0 package](agent-plugins.md).
It exports validated skills and resources, omits four guarded discovery files,
and supplies no native agent registrations, hooks, or invocation enforcement.
Generic format compatibility does not establish full pipeline support.

> **What this is.** A portability study. It shows how Team's Claude Code plugin
> primitives map onto Codex CLI, and gives the strategy we chose to support
> that host alongside Claude Code. Team also runs on
> [Antigravity CLI](#antigravity-cli), which needed no porting strategy: it
> installs Team from a local checkout through a manifest of its own, like the
> other hosts. It is a decision document, not a code change. The source issue is
> [#50](https://github.com/bostonaholic/team/issues/50). Two epics consume it:
> the [#57](https://github.com/bostonaholic/team/issues/57) Codex port, which
> builds against the matrix, the gap analysis, and the "what #57 builds
> against" section below, and the
> [#56](https://github.com/bostonaholic/team/issues/56) Antigravity backend,
> which builds against the Antigravity CLI host facts.

> **Deprecated host (2026-08-13).** An earlier revision of this study scored a
> third host and handed it a port epic of its own. That Gemini CLI port was
> scored on 2026-06-27 and then dropped in favor of Antigravity CLI, which
> ships today. The port epic,
> [#56](https://github.com/bostonaholic/team/issues/56), was retargeted at the
> Antigravity CLI as an alternate model backend rather than closed. The matrix
> below scores the surviving hosts only.

## Contents

- [Current state](#current-state)
- [Agent dispatch](#agent-dispatch)
- [Desired end state](#desired-end-state)
- [Patterns to follow](#patterns-to-follow)
- [The capability matrix](#the-capability-matrix)
- [Gap analysis](#gap-analysis)
- [Decisions made](#decisions-made)
- [What #57 builds against](#what-57-builds-against)
- [Antigravity CLI](#antigravity-cli)
- [OpenCode](#opencode)
- [Out of scope](#out-of-scope)
- [Edge cases](#edge-cases)
- [Open questions (deferred to the port epic)](#open-questions-deferred-to-the-port-epic)
- [Risks](#risks)

## Current state

Team is a Claude Code-native plugin. It ships 13 agents (`agents/*.md`), skills
(`skills/*/SKILL.md` + `registry.json`), and 3 hooks (`hooks/*.mjs`). They
register through `.claude-plugin/plugin.json`. The orchestrator walks the QRSPI
phase table (`skills/team/SKILL.md`). It persists state as artifact files under
`docs/plans/<id>/`. It coordinates agents through the Task tool and `SendMessage`
resume.

The portability surface splits cleanly. Four layers are already host-neutral:

- The Markdown bodies of every agent and skill. They are plain prose and use no
  Claude Code APIs.
- The `.mjs` hook *logic*. It uses the Node stdlib only, so `node:fs/promises`,
  `node:child_process`, `node:path`, and `node:url`, with zero npm deps.
- The artifact file I/O under `docs/plans/<id>/`.
- The agent→orchestrator JSON-envelope convention.

These layers move to any host unchanged.

The portability-blocking surface is the set of Claude Code-specific contracts.
There are four non-portable bindings:

1. **Hook event names and the stdin/stdout JSON contract.** The stdin schema
   (`tool_name`, `tool_input`, `cwd`), the stdout/stderr envelope
   (`hookSpecificOutput.{permissionDecision, additionalContext}`, `systemMessage`),
   and exit-code semantics.
2. **Host path env vars.** `${CLAUDE_PLUGIN_ROOT}`, interpolated into every hook
   command (`plugin.json:18,30,41,52`), and `CLAUDE_PROJECT_DIR`, read from the
   environment inside the hook bodies (`pre-compact-anchor.mjs:27`,
   `session-start-recover.mjs:31`, `post-write-validate.mjs:103`). The two use
   different mechanisms: manifest interpolation and runtime env lookup.
3. **Agent/Task tool dispatch**, plus `SendMessage` resume and depth/parallel
   nesting semantics.
4. **SKILL.md slash-command auto-registration**, plus `user-invocable`.

The host also interprets the agent frontmatter field semantics: `name`, `model`,
`tools`, `skills`, and `permissionMode`. Everything portable rides *on top of*
these four non-portable bindings. The `model:` field is a *Claude-specific model
name*. To make it portable, resolve it through host-neutral config. Do not bake a
literal into each definition. See `.team/config.json` under Desired end state.

## Agent dispatch

Of the four blocking bindings, the fourth — Agent/Task dispatch — needs no
per-host agent registration. Team resolves it in the orchestrator itself,
through the portable definition contract in
`skills/team/references/15-host-dispatch.md`:

- Every specialist ships as `agents/<name>.md`. The body is a complete role
  prompt; the frontmatter is host metadata.
- A host that resolves Team agents by name (Claude Code) dispatches the named
  agent, so the host applies the frontmatter's tool and permission restrictions.
- Any other host reads the definition, strips frontmatter, and spawns a fresh
  generic subagent with the body as its role instructions. No host-side agent
  registration is required.
- A producer may run inline only when no subagent facility exists; a reviewer
  never runs inline, because a reviewer sharing the author's context cannot
  judge it.

The consequence for this study: the "agent dispatch" primitive is reachable on
every host that can spawn a subagent, without a per-host shim. The remaining
per-host work is the bindings the study already names — hook registration and
the model-tier map — not agent registration.

## Desired end state

The end state is a single canonical "core" of host-neutral definitions, which
means the Markdown bodies and the Node hook logic, maintained once. Thin per-host
binding shims sit on top. Each shim translates the four blocking contracts into
its host's idiom. Claude Code keeps its current `.claude-plugin/plugin.json` and
`skills:` injection. Antigravity CLI's shim already ships: the root
`plugin.json` manifest, which the host resolves with `skills/` and `agents/`
beside it. A Codex build emits `.codex/` with config.toml or hooks.json and
`agents/*.md`. Skills need no build step on Codex: `.codex-plugin/plugin.json`
and `.agents/plugins/marketplace.json` already make the checkout an installable
Codex plugin, and `codex plugin add` reads `skills/<name>/SKILL.md` out of it
directly.
The high-churn binding layer stays isolated from the stable cores. A host API
change thus touches one shim, not 68 definition files.

Per-project configuration is host-neutral. Each project that uses Team carries one
`.team/config.json` at its root. It is plain JSON, part of the portable core, and
identical on every host. It declares the settings that would otherwise leak host
specifics into the definitions:

- The map from Team's abstract model tiers to the active host's concrete model
  IDs. The agent `model:` frontmatter becomes a *tier key*, not a literal Claude
  model name.
- Host selection.
- Per-host parallelism caps.
- The multi-repo list.

The per-host shims **read** this file. They never redefine it. It is the
host-neutral counterpart to the per-host manifests. Those manifests carry only
bindings. `.team/config.json` carries the host-agnostic project config.

This document does not build that end state. It is the strategy and capability
matrix that lets epic #57 build it. The epic targets **full parity** against
named, tracked host risks. Full parity means all four hook events, parallel and
nested subagents, and structured returns.

## Patterns to follow

- **Runtime vs. development split** (`CLAUDE.md`, `docs/architecture.md`). Only
  the distributed set ports: `agents/`, `skills/*/SKILL.md` + `registry.json` +
  the bundled skill scripts (`supports-nesting.mjs`, `ste-lint.mjs`,
  `external-review.mjs`, `resolve-transcript.mjs`, `write-target.mjs`,
  `discover-topic.sh`, and `pr-screenshots`' `scripts/splice.mjs` plus its
  `scripts/*.sh`),
  `hooks/*.mjs`, `.claude-plugin/`. The entire `.claude/`
  tree, `tests/`, `evals/`, `docs/`, `.github/` never ship and are out of every
  port's scope.
- **A bundled skill script names its own directory, never a host variable.**
  `${CLAUDE_PLUGIN_ROOT}` exists on Claude Code alone, so a SKILL.md that
  interpolates it into a runnable command breaks on Codex, where the value is
  empty and the path resolves to `/skills/...`. Document the command with a
  `<skill-dir>` placeholder the caller substitutes, the pattern Codex's own
  bundled skills use, and keep the script free of relative imports and of
  environment reads that resolve its own location, so it runs from any install
  path (`ste-lint.mjs` does both). Reading the environment for something other
  than the script's own path is fine and sometimes required — the host a session
  is running on is knowable no other way, which is how
  `resolve-transcript.mjs` tells a Claude Code session from a Codex one.
  `skills/nested-agents/SKILL.md:35` still interpolates the variable directly.
  That command is Claude-Code-specific, but the pipeline it serves is not:
  nested dispatch degrades to its documented inline fallback on every other
  host (`skills/nested-agents/SKILL.md`, "Optimization, never a dependency").
- **Hooks already isolate portable logic from host contract.** Each `.mjs` reads
  stdin, does Node-only work, then writes a host-shaped JSON result
  (`session-start-recover.mjs:236-244`, `post-write-validate.mjs:29-37`). The scan
  and git logic is the reusable core. Only the stdin field names and the result
  envelope are the binding. The shim layer mirrors this seam.
- **Agent definition format is already near-universal.** Claude `agents/*.md`,
  which is Markdown with YAML frontmatter, carries the same *system-prompt body*
  Codex reads through its TOML agent roles. The body ports. The frontmatter and
  TOML binding does not.
- **The JSON-envelope convention is host-agnostic by construction**
  (`skills/agent-open-questions/SKILL.md`). It layers on whatever result channel
  the host gives: final-text on Claude, `--output-schema` on Codex.

## The capability matrix

The matrix maps each Team primitive against each host. Each cell holds one of
three values. **native** means a direct host equivalent. **workaround** means a
documented alternate mechanism reaches it. **hard gap** means the host has no
facility, so the design must work around it.

| Team primitive | Claude Code | Codex CLI |
|----------------|-------------|-----------|
| Agent/skill Markdown bodies | native (loaded as-is) | native (system-prompt body) |
| Custom slash entry points | native (SKILL.md auto-register) | native (built-ins and Skills. Prompts are deprecated in favor of Skills.) |
| On-demand SKILL.md injection | native (`skills:` + auto-load) | native (`skills/<name>/SKILL.md` under an installed plugin, description-matched implicit invocation). A skill opts out through `policy.allow_implicit_invocation: false` in its `agents/openai.yaml` — [documented](https://learn.chatgpt.com/docs/build-skills) to block implicit invocation while leaving `$skill` working |
| Hide a skill from the user's menu | native (`user-invocable: false` keeps it out of `/`) | **hard gap**: every discovered skill is listed in the `$` picker; no frontmatter or manifest field suppresses one |
| Subagent dispatch (parallel) | native (Agent/Task tool) | native (`spawn_agent`/`wait_agent`…, `features.multi_agent`) |
| Nested subagents | native (depth 2, ≤4, read-only) | workaround: `max_depth=1`, nesting capped one level |
| Structured agent→caller output | native (final-text JSON envelope) | native and strongest (`--output-schema` JSON Schema). A silent-drop bug under tools ([codex#15451](https://github.com/openai/codex/issues/15451)) was fixed April 2026 |
| `PreToolUse` hook | native | native (`PreToolUse`) |
| `PostToolUse` hook | native | native (`PostToolUse`) |
| `SessionStart` hook | native | native (`SessionStart`) |
| `PreCompact` hook | native | native (`PreCompact`, + `PostCompact`) |
| Hook stdin/stdout JSON contract | native (Claude schema) | workaround: own schema, mirrors Claude closely (`permissionDecision:"deny"`/exit 2) |
| Plugin-root / project-dir env vars | native (`${CLAUDE_PLUGIN_ROOT}`, `CLAUDE_PROJECT_DIR`) | workaround: no equivalent, so resolve through `.codex/` trust + config |
| Always-on project context | native (CLAUDE.md) | native (AGENTS.md) |
| MCP tools | native | native (stdio/HTTP, OAuth, per-tool approval) |
| MCP prompts-as-slash-commands | native | **hard gap**: MCP prompts unsupported client-side, so route through Skills |
| MCP resources | native | native (`read_mcp_resource`/`list_mcp_resources`) |
| Manifest / binding format | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json` for the package; `config.toml`/`hooks.json` + `.codex/` for hooks and agents |
| Per-project config (host-neutral) | `.team/config.json` (plain JSON, read by portable core) | `.team/config.json` (same file, unchanged) |
| Abstract model tier → host model | native (`model:` is a literal Claude model) | workaround: resolve tier through `.team/config.json` map |

Antigravity CLI is not a third column. Only some of these rows are settled for
it — manifest layout, skill and agent discovery, naming, hooks — while the MCP
group and the hook JSON contract are not, and a column that said "unknown" two
thirds of the way down would look scored without being scored. What is settled
is in [its own section](#antigravity-cli); the rest sits in
[open questions](#open-questions-deferred-to-the-port-epic).

Reading the matrix: every row that Team's *behavior* depends on is native or
workaround on Codex CLI. There is no hook-event gap. All four events map
natively, and on-demand skills, subagents, MCP tools, and MCP resources are
native. The two remaining hard gaps are narrow. Codex does not surface MCP
**prompts** as slash commands — its MCP tools and resources are fine, and it has
a clean detour: route slash entry through Codex Skills, below. And Codex offers
no way to hide a skill from the user's `$` picker, which costs presentation
rather than behavior.

> The landscape is recent. As of mid-2026 Codex CLI ships a full hooks system,
> parallel subagents, custom slash commands, on-demand skills, MCP, and
> structured headless output. Earlier (2025) write-ups that treated these as
> hard gaps are stale. Codex's hooks and multi-agent are young, rolled out March
> to May 2026 across v0.114-v0.129 (latest v0.142.3). See the recency risk in
> the gap analysis.

## Gap analysis

After verifying every capability against the host repos (2026-06-27), the gap
picture is narrower than the earlier draft assumed. Two hard gaps remain, plus a
cross-cutting recency caveat:

1. **Codex does not expose MCP *prompts* as slash commands (hard gap).** Codex MCP
   supports tools and resources (`read_mcp_resource` and `list_mcp_resources`). It
   does not support MCP prompts. "MCP-prompts-as-slash-commands" thus does not
   work on Codex. The workaround for #57 is to route every slash-style entry
   point through Codex Skills, the documented successor to deprecated custom
   prompts, and not through MCP. This is why the chosen strategy does not depend
   on MCP (decision 4).

2. **Codex lists every skill in the `$` picker, so `user-invocable: false` is a
   Claude-Code-only guarantee (hard gap).** Team's 66 methodology and
   `principle-*` skills are reference material an agent loads, never something a
   human runs. On Claude Code, `user-invocable: false` keeps them out of the `/`
   menu. Codex has no equivalent, so they all appear under `$` and a user can
   invoke any of them directly. There is no workaround short of moving those
   skills out of `skills/` entirely, which would end load-by-name on both hosts.
   Team accepts the clutter. See
   [the divergence note](#57-codex-port) for the evidence behind that.

3. **Recency risk.** This is cross-cutting rather than a primitive gap. Codex's
   hooks and multi-agent are young. They rolled out from March to May 2026
   across v0.114-v0.129 (latest v0.142.3). Treat its contracts as moving
   targets. The shim layer (decision 1) absorbs breaking changes in one place.
   The mitigation and version-pinning policy are tracked in the
   [risk register](#risks).

## Decisions made

1. **Chosen strategy: a hybrid.** It pairs a shared host-neutral core with thin
   per-host binding shims. The canonical core is the portable layer, maintained
   once. That layer holds the Markdown bodies, the Node hook logic, the artifact
   I/O, and the envelope convention. Per host, a thin shim gives only the four
   blocking bindings: (a) the manifest and config format. (b) the hook stdin and
   stdout schema adapter. (c) the plugin-root and project-dir env resolution. (d)
   the slash-entry registration. Each host can generate its shims or hand-write
   them. Either way they are small and isolated.
   - *Why:* the expensive, divergent, high-churn surface is exactly the bindings
     (three manifest formats ship today — Claude Code's, Codex's, and
     Antigravity's — atop per-host hook schemas and still-moving host APIs),
     while the stable, valuable surface, the 91 agent/skill bodies and 3 hook
     logic files, is *already portable*. The hybrid boundary lines up with the
     natural portable/non-portable seam, so it minimizes both duplication and the
     blast radius of churn.
   - *Serves whom:* Team's maintainer and the #56/#57 epic implementers. They
     edit behavior once and re-bind per host, instead of maintaining a drifting
     copy per host.

2. **Rejected: single source of truth plus a full transpile/build.** One canonical
   set. A build step emits a complete package per host. *Why rejected:* it forces
   the build to fully model three divergent manifest/agent/command formats —
   Claude Code's, Codex's, and Antigravity's — the youngest of which (Codex's)
   are still moving. The upfront modeling cost is high and the build itself
   becomes the highest-churn artifact, since every host API change breaks the
   transpiler. The hybrid keeps the same DRY core *without* committing to a
   total-coverage transpiler. Shims can stay hand-written where generation does
   not pay. The hybrid can generate shims later where it pays, making it a strict
   superset of this option's value with less risk.

3. **Rejected: per-host maintained adapters (parallel hand-maintained trees).**
   *Why rejected:* it costs 3× the maintenance across 13 agents, every skill, and 3
   hooks, one tree per shipped host — Claude Code, Codex CLI, and Antigravity
   CLI. It also guarantees drift, because someone must apply a fix to an agent
   body three times by hand. It throws away the fact that the bodies are *already
   portable*. The hybrid keeps most of its only advantage, a fully idiomatic host,
   because host idiom lives in the shim layer anyway.

4. **MCP is documented as a bridge, not adopted as the strategy's mechanism.**
   The matrix records MCP's reach on Codex: tools and resources, but not
   prompts-as-slash. The chosen path is native per-host bindings, and MCP is a
   documented fallback to revisit only if a native binding proves insufficient.
   *Why:* Codex MCP carries tools and resources but not prompts, so MCP can
   never be the *uniform* slash-command layer. Leaning on it would force a split
   path anyway while adding a server dependency. Keeping it as fallback preserves
   the option without coupling the strategy to it.

5. **Parity target for #57: full hook and subagent parity**, not MVP-first.
   The epic targets all four hook events, parallel **and** nested subagents, and
   structured returns before it declares the work done. This raises the bar
   against the young-API and open-bug risk. The design thus confronts those risks
   directly rather than defer them by a cut in scope. See the risks and "what
   #57 builds against" below.

6. **Per-project configuration lives in a host-neutral `.team/config.json`.** The
   [Desired end state](#desired-end-state) specifies the artifact and its
   relationship to the per-host manifests. It also specifies the host-agnostic
   settings the artifact holds: the model-tier to host-model map, host selection,
   per-host parallelism caps, and the multi-repo list.
   - *Why:* it pulls the one irreducibly host-varying value out of the portable
     definitions, since the agent `model:` frontmatter is a Claude-specific model
     name and meaningless on Codex, and puts it behind a single host-agnostic
     indirection, so the 91 agent/skill bodies never carry a host-specific model
     literal. The per-host shims *read* `.team/config.json`; they never restate
     it.

## What #57 builds against

The epic builds the hybrid core plus a per-host shim for its host, targeting
full parity. It starts from the matrix and works around the named gaps.

### #57. Codex port

- Bodies port as-is. Agent roles → TOML in `.codex/agents/` with the same
  system-prompt body.
- Skills port natively, through Codex's own plugin install:
  `.codex-plugin/plugin.json` plus `.agents/plugins/marketplace.json` make the
  checkout installable with `codex plugin add team@team-dev`, and Codex reads
  every skill from `skills/<name>/SKILL.md` under the installed plugin root.
  They arrive namespaced as `team:<name>`, with description-matched implicit
  invocation. Each skill also ships `agents/openai.yaml`, which names it in the
  catalog; the guarded skills declare `policy.allow_implicit_invocation:
  false` there to opt out of that matching, which is this host's documented
  equivalent of `disable-model-invocation`.
- **Do not also link the checkout's `skills/` into `~/.agents/skills/`.** That
  collection link registers every skill a second time, under both roots, and
  Codex truncates each description to roughly a quarter of its length to fit
  the doubled catalog. Verified on codex-cli 0.153.4, 2026-09-09.
- **The install is a copy, and the manifest version is its cache key.** Codex
  copies the marketplace root to
  `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, so an edited
  skill does not reach it until the plugin is installed again. Codex's
  `plugin-creator` reference prescribes a `<base>+codex.<cachebuster>` version
  suffix to force the re-copy rather than a version bump;
  `script/dev-install-codex` stamps one, reinstalls, restores the manifest, and
  prunes the previous copy.
- **Claude Code installs the same way, and takes the same loop.** `claude
  plugin install` copies the marketplace root to
  `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, and `claude
  plugin update` reports "already at the latest version" and copies nothing
  when the version has not moved, so `script/dev-install-claude` stamps
  `<base>+claude.<cachebuster>` onto `.claude-plugin/plugin.json` and both
  version strings in `.claude-plugin/marketplace.json` — the catalog is a
  snapshot taken when the marketplace is added or updated, so the stamp has to
  land before the refresh. Two details differ from Codex: the cache directory
  is named with `+` rewritten to `-` while the reported version keeps the `+`,
  so the served path comes from what `claude plugin list` reports rather than
  from the version string; and there is no legacy collection link to migrate.
  Verified on 2026-09-10.
- **Do not replace the cached copy with a symlink to the checkout.** It makes
  edits take effect without a reinstall, and it decouples the served content
  from the version Claude reports: the directory name is fixed at install time
  while the contents follow the checkout, so a branch that bumps the version
  runs the new code under the old number (#355).
- **Codex's plugin validator rejects `disable-model-invocation`.**
  `plugin-creator`'s `validate_plugin.py` requires the key to be absent or
  `false`, and Team's four guarded skills set it `true` because Claude Code
  needs it. The runtime does not enforce the rule, and this host's own
  equivalent — `policy.allow_implicit_invocation: false` in each skill's
  `agents/openai.yaml` — keeps all four out of the implicit catalog. The
  divergence is deliberate and the validator finding is expected.
- **Codex ignores `user-invocable: false`, so every methodology and
  `principle-*` skill shows up in its `$` picker. Do not try to fix this.** The
  `$` picker is fed by the `skills/list` app-server method, which returned all
  100 Team skills with `enabled: true`, `team:principle-fix-root-causes` among
  them. Its `SkillMetadata` payload carries nine fields — `dependencies`,
  `description`, `enabled`, `interface`, `name`, `path`, `pluginId`, `scope`,
  `shortDescription` — and none of them expresses invocability. The strings
  `user-invocable` and `disable-model-invocation` do appear in the Codex binary,
  but only inside its embedded skill-authoring prompt and `plugin-creator`'s
  Python validator, never in the Rust loader. The three things that look like
  levers are not:
  - `policy.allow_implicit_invocation: false` governs model-context injection
    only. Codex's own docs for the field say the skill "can still be invoked
    explicitly via `$skill`".
  - Deleting a skill's `agents/openai.yaml` drops its display name, blurb, and
    default prompt, but the row stays: with the file moved aside, `skills/list`
    still returned the skill, falling back to the SKILL.md `description`.
  - Nesting a skill deeper to hide it from discovery fails on *both* hosts. A
    probe at `skills/probe-nest/inner-probe/SKILL.md` was invisible to Codex's
    `skills/list` and to `claude plugin details`, while its flat sibling
    appeared in both. Each host walks exactly one level.

  Verified on codex-cli 0.153.4, 2026-09-10. The only real fix is a Codex
  feature (honoring `user-invocable`, or a `policy.allow_explicit_invocation`).
- Hooks: reuse the 4 `.mjs` files. The shim adapts to Codex
  `hooks.json`/`[hooks]`, whose schema mirrors Claude closely
  (`permissionDecision:"deny"`/exit 2). Events map nearly 1:1
  (`PreToolUse`/`PostToolUse`/`SessionStart`/`PreCompact`).
- Slash entry points → Codex Skills, not MCP (gap 1).
- Env: resolve through `.codex/` trust + config.toml.
- Config: model tiers resolve through `.team/config.json`. Map Team's tiers to
  concrete Codex or GPT model IDs. Read the `model:` frontmatter as a tier key.
  The per-host parallelism cap (`agents.max_threads=6`) also comes from config.
- **Known hazards to track:**
  - **[codex#15250](https://github.com/openai/codex/issues/15250) (open).** Custom
    agents are not always reachable from tool-backed sessions. Full subagent parity
    must verify dispatch works in Team's tool-heavy flows and track the issue.
  - **[codex#15451](https://github.com/openai/codex/issues/15451) (fixed April
    2026).** Silent `--output-schema` drop under active tools, resolved upstream
    (full detail in the [risk register](#risks)). Guard on a pre-fix Codex pin:
    validate output shape, fall back to text-envelope parse.
  - MCP prompts are a hard gap (tools and resources are native), so keep all
    prompt/slash workflows on Skills.

## Antigravity CLI

Everything here is from `agy` 1.1.12 on macOS. The Codex CLI section comes from
vendor docs and host repos read on 2026-06-27, since that binary is not
installed here.

**This host installs Team natively, through its own manifest.** Team ships
`plugin.json` at the repo root, which is Antigravity's plugin marker, with
`skills/` and `agents/` beside it where this host resolves components.
`agy plugin install /path/to/team` then copies all skills and all 13 agents
into `~/.gemini/config/plugins/team/`, and `import_manifest.json` records the
source as **`antigravity`** — its native path, the same local-checkout form the
Claude Code and Codex installs use.

The root manifest is what buys that. Without it, this host falls back to
recognizing `.claude-plugin/` and records the source as `claude-code`, importing
Team as a Claude Code plugin. That fallback works, but it makes Team's presence
here contingent on another host's manifest, and it is not the path this project
relies on. The manifest also cannot move into a directory of its own the way
`.claude-plugin/` and `.codex-plugin/` do, because components resolve as siblings
of the manifest — which is why Team carries a sixth version string at the repo
root.

**A local install can fail on a git fsmonitor socket.** The install copies the
whole tree, `.git` included, so a checkout with a running fsmonitor daemon fails
on `.git/fsmonitor--daemon.ipc`. A worktree is unaffected, because its `.git` is
a file, and installing from a URL clones fresh so the socket never exists.

**Discovery.**

- `plugin.json` has to sit at the plugin root, and `skills/`, `agents/`,
  `commands/`, `mcpServers/`, and `hooks/` all resolve beside that manifest. So
  `.claude-plugin/` and `.codex-plugin/` both validate and then discover nothing,
  and a manifest cannot redirect its component paths. That is why Team's
  Antigravity manifest is at the repo root rather than in a directory beside the
  other two.
- Given a root manifest, `agy` processed every skill and all 13 agents.
- Skill discovery descends the tree but stops at any directory that owns a
  `SKILL.md`, so a skill cannot nest another skill.
- A symlinked skill folder is followed at plugin scope **and** at global scope.
- **A symlinked plugin root is discovered with no registration step.** A single
  link at `~/.gemini/config/plugins/team` pointing at a checkout put 52 Team
  skills in the agent's own skill list, with no entry in `import_manifest.json`
  (a probe from the 54-skill era; the tree has grown since).
  Team's dev install is that one link. A directory holding a hand-written
  `plugin.json` beside symlinked `skills/` and `agents/` works too; linking the
  root is preferred because the checkout already carries the manifest, so nothing
  has to be generated or kept in sync.
- `hooks/` is not discovered: this host registers hooks through a root
  `hooks.json`. `agents/` is discovered, and discovery is not dispatch — whether
  `agy` can dispatch an agent, and whether a structured return survives, has not
  been tested, which is why Team claims no pipeline support here.

**`disable-model-invocation` is honored.** With the plugin installed, the
probe (taken when the plugin shipped 54 skills, two of which set the key) had
the agent list 52 of them. The two missing ones were exactly `pr-rebase` and
`pr-watch-as-reviewer` — the skills that set the key **as of that probe**. The
guarded set has since grown to four: `reflect` and `no-comments` set it too, so
this host withholds both as well. This host therefore keeps every guarded skill
out of the model's reach on its own, and it is why Team's install for this host
withholds nothing.

Codex reaches the same end through its own key rather than this one:
`no-comments`, `pr-rebase`, `pr-watch-as-reviewer`, and `reflect` each declare
`policy.allow_implicit_invocation: false` in their `agents/openai.yaml`.
OpenAI [documents](https://learn.chatgpt.com/docs/build-skills) that key as
blocking implicit invocation while leaving explicit `$skill` invocation
working, which is what `disable-model-invocation` buys on the other two hosts.
The difference is in evidence, not in outcome: this host's behavior was
observed on a live probe, Codex's rests on the documented contract.

**Paths and naming.**

- The global plugin root is `~/.gemini/config/plugins/`. The global skill scope
  is `~/.gemini/config/skills/`; Team writes to neither by hand except through
  its dev install, which owns one directory under the former. `~/.gemini/` is
  this host's own config root, so that spelling is the host's fact, not a
  leftover to rename.
- The catalog name comes from a skill's frontmatter `name:`, never from the
  directory or link name. A link named `team-probe-gitcommit` was reported as
  `git-commit`. So this host applies **no `team:` prefix** and gives Team no
  namespace at the skill level, unlike Codex — even though the files themselves
  sit namespaced under a plugin directory.
- The `~/.agents/skills/` directory is invisible to `agy`. About fifty
  unrelated skills sat there on the probe machine and none appeared in the
  agent's list.
- From inside a Team checkout, `agy plugin list` printed "No imported plugins."
  and only the two built-in skills reached the agent's list. Plugin discovery
  keys on a `plugin.json` marker, so Codex's `.agents/plugins/marketplace.json`
  is not read as a workspace plugin and no collision exists between the two.

**Name collisions still resolve by precedence.** Bare names mean a skill of the
user's own can carry a Team name, and the host picks a winner silently. Team no
longer scans for that: it writes into its own plugin directory rather than into
the shared global skill directory, so it has nothing to warn about and no
authority over which copy wins. Built-in skills live inside the `agy` binary, so
no disk scan could enumerate them anyway. Whether a project's `.agents/skills/`
outranks the global scope **has not been confirmed** — the nearest evidence
points the other way, since about fifty skills in `~/.agents/skills/` were
invisible to `agy`.

**Scope.** Antigravity installs every skill and every agent, and the dev install
keeps a checkout's edits live. Dispatch is resolved host-neutrally, not by a
per-host agent registration: the orchestrator reads each specialist's portable
definition and dispatches it through the host's subagent facility (see
[Agent dispatch](#agent-dispatch)). Hooks, commands, and rules
remain unported on this host. That work stays with
[#56](https://github.com/bostonaholic/team/issues/56).

## OpenCode

OpenCode loads the native `opencode/team.js` plugin through one symlink in its
configuration directory. `script/dev-install opencode` and
`script/dev-uninstall opencode` manage that exact-owned registration; see
[installation](index.md#opencode) for prerequisites, overrides, restart, worktrees,
conflicts, dangling targets, and lock recovery. Installation validates the
checkout without reading user JSON/JSONC or invoking OpenCode. Its success says
registered. Malformed native configuration can still prevent loading afterward.

`opencode/catalog.mjs` owns catalog validation for both installation and plugin
initialization. The entry resolves its real file before importing the helper, so
checkout aliases and linked worktrees resolve to canonical file/base paths.
Each immediate real skill directory contributes one regular `SKILL.md`. The
validator walks its tree once without following symlinks. It rejects linked
entries, nested `SKILL.md`, duplicate names, ambiguous consumed frontmatter, and
empty catalogs. Ordinary references and scripts stay available. Headers are read
once. Bodies stay on disk. Canonical paths containing `$`, backticks, or `@` are
rejected before registration or config contribution. Spaces and Unicode are
supported. Existing command collisions or wrong consumed config types reject the
whole contribution before paths or commands change.

Every skill gets a native configured command with its description and a quoted
absolute file/base pointer. The template declares explicit invocation, requests
a filesystem read, resolves relative references against the canonical base, and
supplies `$ARGUMENTS`. It embeds no skill body and sets no model or agent override.
This preserves literal shell examples and argument references inside canonical
skill content. Even `user-invocable: false` methodology skills appear in the
command menu. Commands include `/reflect`, whose description states that OpenCode
session reflection is unsupported: its transcript resolver supports Claude Code
and Codex only.

`disable-model-invocation: true` excludes a directory from **Team's added
`skills.paths` only**. Other paths retain their order and exact duplicates are
removed. Team does not rewrite user-owned skill sources. An external source can
expose its own guarded copies or win resolution of a duplicate skill name.
Inspect the resolved skill's location separately from the command template:
Team's configured commands retain canonical pointers despite duplicate skill
sources. Later plugins or MCP commands can still collide; the initialization
collision check cannot guarantee ownership after other contributors run.

### Command permissions and preprocessing

A Team command requests a filesystem read subject to native `read` and
`external_directory` rules. An unguarded skill-tool call instead uses `skill`
permission and returns content cached by native discovery. `read: deny` does
**not** deny that cached route. Guarded skills remain available as explicit
command-file read requests. Team leaves existing `read`, `external_directory`,
`skill`, and `bash` rules unchanged and adds no permission overrides.

OpenCode preprocesses supplied command arguments. For example, the native syntax
below can run `printf` before any model call:

```text
/team-question !`printf example`
```

This shell substitution runs outside model-tool permission checks, including
`bash: deny`. Native file references and placeholders also retain their native
argument behavior. Canonical file pointers protect skill **body text**, not
untrusted arguments. Team adds no argument escaping or expansion adapter.

### Lifecycle and support limits

The shared Node lifecycle helper creates the plugin parent only for installation,
canonicalizes it, then atomically acquires `plugins/team.js.lock` before inspecting
or changing the target. Config aliases therefore share a lock. Matching absolute
symlinks converge on reinstall/removal, including a missing runtime target on
uninstall. Foreign links and non-link targets fail unchanged. Cleanup removes only
the acquired empty lock. A busy/stale lock requires manual recovery after checking
no lifecycle process remains. Config, credentials, other plugins, and existing
parents remain untouched.

Concurrent checkout edits during catalog loading and external programs replacing
files without the lifecycle lock are unsupported. A new OpenCode process reads
current checkout content. No generated catalog, cache copy, provider call, or
persistent Team process is introduced.

Native discovery was observed on OpenCode 1.18.20. Support covers registration,
skill/command discovery, and the developer lifecycle. Full QRSPI execution,
specialist/nested-agent dispatch, translated reviewer permissions, and runtime
hooks remain unverified. No provider, credentials, model-tier translation, or
model-quality guarantee is installed. `/reflect` cannot process OpenCode sessions.

## Out of scope

- **Writing any of the port code.** #56 and #57 own the implementation. This is
  the study they build against.
- **Building the shim generator and build tooling.** The epic chooses if it
  generates the shims or hand-writes them (decision 1 permits both).
- **Porting the dev-only tree** (`.claude/`, `tests/`, `evals/`, `docs/`,
  `.github/`), which is never distributed and never ported.
- **Adopting MCP as a transport.** Documented as fallback only (decision 4).
- **Reduced-MVP parity.** Explicitly rejected: full parity is the target.
- **Full OpenCode parity.** Its native installation/discovery adapter is covered
  separately above; the pipeline portability matrix does not certify OpenCode
  execution, agent permissions, or hooks.
- **Guaranteeing host API stability.** The young-API recency risk is surfaced and
  assigned to the shim layer plus version pinning, not eliminated.

## Edge cases

These are the boundary conditions the *strategy and the downstream epic* must
handle.

- **Boundary: zero portable change in a body.** A host with an identical body
  format needs no transform. The shim is pure binding. The strategy must not
  force a transpile pass where copy suffices.
- **Boundary: a primitive with no host facility at all.** The one hard gap (Codex
  MCP prompts) has an explicit documented detour. Any *new* primitive Team adds
  must be matrix-checked before assuming it ports.
- **Invalid: host manifest schema drift.** A host changes its hook stdin schema.
  Chosen behavior: the schema adapter lives in the shim only. The `.mjs` core is
  untouched. This is the central reason for the hybrid boundary.
- **Failure: Codex pre-April-2026 silent schema drop.** On a Codex build before
  the [codex#15451](https://github.com/openai/codex/issues/15451) fix,
  `--output-schema` is ignored under active tools. Behavior: validate the returned
  shape and fall back to text-envelope parsing. It is fixed on current Codex, so
  this is a version-pin caveat.
- **Concurrency: nested-subagent depth mismatch.** Codex (`max_depth=1`) cannot
  match Claude's depth-2. Behavior: the orchestrator flattens or sequences nested
  work per host. This is a parity item rather than a silent capability drop.
- **Authorization: Codex `.codex/` trust gate.** Project-local hooks and agents
  load only when the directory is trusted. Behavior: the port's install docs must
  state the trust requirement. An untrusted directory skips hooks without warning.
  Skills bypass the gate entirely. Codex gates "project-local config, hooks, and
  exec policies" (`config/src/loader/mod.rs:912`) and skills are absent from that
  set, so a user-scope skill install is exposed to every session with no prompt.
- **Resource limit: Codex `agents.max_threads=6`.** Team's 5-reviewer parallel
  dispatch must fit the host's thread ceiling. Behavior: cap or batch reviewer
  dispatch per host.

## Open questions (deferred to the port epic)

- **Shim generation vs. hand-authoring.** Decision 1 permits both. Which to use
  is a structure-phase choice for #57.
- **Host version pinning policy.** Which exact Codex version the port certifies
  against (recency risk) is an implementation detail for the port epic.
- **Posture on the one open host issue ([codex#15250](https://github.com/openai/codex/issues/15250)).**
  The port epic makes the maintenance-posture call: upstream a fix, or only
  design around it. The other cited issue,
  [codex#15451](https://github.com/openai/codex/issues/15451), is already
  resolved upstream.
- **The full `.team/config.json` schema.** Decision 6 fixes its purpose and core
  fields: model-tier map, host, parallelism caps, and repos. The exhaustive
  schema, defaults, and validation are for the port epic to pin.

## Risks

- **Young-host-API risk (moderate).** Codex's hooks and multi-agent rolled out
  March to May 2026 (v0.114-v0.129, latest v0.142.3) and its contracts may still
  move. Mitigation: bindings isolated in shims, pin host versions, re-validate
  on upgrade. *(Capabilities verified against the host repos 2026-06-27. Issue
  statuses 2026-06-25.)*
- **[codex#15250](https://github.com/openai/codex/issues/15250) (open,
  moderate).** Custom agents are not always reachable from tool sessions, which
  hits Team's tool-heavy dispatch directly. It is the one live host bug, tracked
  for #57.
- **[codex#15451](https://github.com/openai/codex/issues/15451) (fixed April 2026,
  low).** Silent `--output-schema` drop under active tools, resolved upstream. It
  is a risk only on a pre-fix Codex pin, covered by shape validation plus a text
  fallback.
- **Hidden Claude Code assumptions (low to moderate).** Some agent prose may
  assume Claude-specific tool names or behaviors that the layer analysis did not
  catch. The port epic should audit bodies for host-specific references during
  structure.

## See also

- **[Architecture](architecture.md)**: the full plugin design these primitives are drawn from.
- **[#50](https://github.com/bostonaholic/team/issues/50)**: the source issue this study delivers.
- **[#57 Codex port](https://github.com/bostonaholic/team/issues/57)**: the epic that executes this matrix for Codex CLI.
- **[#56 Antigravity backend](https://github.com/bostonaholic/team/issues/56)**: the epic that runs the pipeline against the Antigravity CLI as an alternate model backend (formerly the Gemini CLI port).
