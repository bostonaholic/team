---
title: Cross-host portability
description: "A capability matrix mapping Team's Claude Code plugin primitives onto Gemini CLI and Codex CLI, and the chosen hybrid portability strategy."
audience: [developer]
nav_order: 9
nav_label: portability
---

# Cross-host portability

> **What this is.** A portability study: how Team's Claude Code plugin primitives
> map onto Gemini CLI and Codex CLI, and the strategy chosen to support all three
> hosts. It is a decision document, not a code change — source issue
> [#50](https://github.com/bostonaholic/team/issues/50); consumed by the
> [#56](https://github.com/bostonaholic/team/issues/56) Gemini port epic and the
> [#57](https://github.com/bostonaholic/team/issues/57) Codex port epic, which
> execute against the matrix, gap analysis, and "what #56/#57 execute against"
> section below.

## Current state

Team is a **Claude Code-native plugin**. It ships 13 agents (`agents/*.md`), 31
skills (`skills/*/SKILL.md` + `registry.json`), and 4 hooks (`hooks/*.mjs`),
registered through `.claude-plugin/plugin.json`. The orchestrator walks the
QRSPI phase table (`skills/team/SKILL.md`), persisting state as artifact files
under `docs/plans/<id>/` and coordinating agents via the Task tool and
`SendMessage` resume.

The portability surface splits cleanly. **Already host-neutral:** the Markdown
bodies of every agent and skill (plain prose, no Claude Code APIs); the `.mjs`
hook *logic* (Node stdlib only — `node:fs/promises`, `node:child_process`,
`node:path`, `node:url`, zero npm deps); the artifact file I/O under
`docs/plans/<id>/`; and the agent→orchestrator JSON-envelope convention. These
layers move to any host unchanged.

**Claude Code-specific contracts** are the portability-blocking surface:
(1) the hook event names + stdin schema + stdout/stderr JSON contract
(`tool_name`, `tool_input`, `cwd`; `hookSpecificOutput.{permissionDecision,
additionalContext}`, `systemMessage`; exit-code semantics);
(2) the `${CLAUDE_PLUGIN_ROOT}` / `CLAUDE_PROJECT_DIR` env vars baked into every
hook command (`plugin.json:18,30,41,52`); (3) the Agent/Task tool dispatch +
`SendMessage` resume + depth/parallel nesting semantics; and (4) SKILL.md
slash-command auto-registration + `user-invocable`. Agent **frontmatter field
semantics** (`name`/`model`/`tools`/`skills`/`permissionMode`) are also
host-interpreted. Everything portable rides *on top of* these four non-portable
bindings.

## Desired end state

A single canonical "core" of host-neutral definitions — the Markdown bodies and
the Node hook logic — maintained once, plus **thin per-host binding shims** that
translate the four blocking contracts into each host's idiom. Claude Code keeps
its current `.claude-plugin/plugin.json` + `skills:` injection. A Gemini build
emits `.gemini/` (settings.json hooks, `agents/*.md`, TOML commands). A Codex
build emits `.codex/` (config.toml/hooks.json, `agents/*.md`, `.agents/skills/`).
The high-churn binding layer is isolated from the stable cores, so a host API
change touches one shim, not 48 definition files.

This document does **not** build that. It is the strategy + capability matrix
that lets epics #56 and #57 build it, each targeting **full parity** (all four
hook events, parallel + nested subagents, structured returns) against named,
tracked host risks.

## Patterns to follow

- **Runtime vs. Development split** (`CLAUDE.md`, `docs/architecture.md`). Only
  the distributed set ports: `agents/`, `skills/*/SKILL.md` + `registry.json` +
  `supports-nesting.mjs`, `hooks/*.mjs`, `.claude-plugin/`. The entire `.claude/`
  tree, `tests/`, `evals/`, `docs/`, `.github/` never ship and are out of every
  port's scope.
- **Hooks already isolate portable logic from host contract.** Each `.mjs` reads
  stdin → does Node-only work → writes a host-shaped JSON result
  (`pre-bash-guard.mjs:55-64`, `post-write-validate.mjs:29-37`). The scan/git
  logic is the reusable core; only the stdin field names and stdout envelope are
  the binding. The shim layer mirrors this seam.
- **Agent definition format is already near-universal.** Claude `agents/*.md`
  (Markdown + YAML frontmatter) is structurally identical to Gemini
  `.gemini/agents/*.md`. Codex uses TOML agent roles but the *system-prompt body*
  is the same prose. The body ports; the frontmatter/TOML binding does not.
- **The JSON-envelope convention is host-agnostic by construction**
  (`skills/agent-open-questions/SKILL.md`). It layers on whatever result channel
  the host provides — final-text on Claude/Gemini, `--output-schema` on Codex.

## The capability matrix

Team primitive × host. Each cell: **native** (direct host equivalent),
**workaround** (achievable via a documented alternate mechanism), or **hard gap**
(no host facility — must be designed around).

| Team primitive | Claude Code | Gemini CLI | Codex CLI |
|----------------|-------------|------------|-----------|
| Agent/skill **Markdown bodies** | native (loaded as-is) | native (loaded as-is) | native (system-prompt body) |
| **Custom slash entry points** | native (SKILL.md auto-register) | native (TOML in `.gemini/commands/`) | native (built-ins + Skills; prompts deprecated→Skills) |
| **On-demand SKILL.md injection** | native (`skills:` + auto-load) | **hard gap** — GEMINI.md is always-on, no description-matched on-demand library | native (`.agents/skills/SKILL.md`, description-matched implicit invocation) |
| **Subagent dispatch (parallel)** | native (Agent/Task tool) | native (`.gemini/agents/*.md`, ~v0.38.1, parallel) | native (`spawn_agent`/`wait_agent`…, `features.multi_agent`) |
| **Nested subagents** | native (depth 2, ≤4, read-only) | workaround — parallel yes, but **subagents cannot spawn subagents** | workaround — `max_depth=1`; nesting capped one level |
| **Structured agent→caller output** | native (final-text JSON envelope) | native at CLI (`--output-format json`/JSONL); **workaround** at subagent boundary — text-only return (#8022) | native + strongest (`--output-schema` JSON Schema); reliability caveat #15451 |
| `PreToolUse` hook | native | native (`BeforeTool`) | native (`PreToolUse`) |
| `PostToolUse` hook | native | native (`AfterTool`) | native (`PostToolUse`) |
| `SessionStart` hook | native | native (`SessionStart`) | native (`SessionStart`) |
| `PreCompact` hook | native | native (`PreCompress`) | native (`PreCompact`, + `PostCompact`) |
| **Hook stdin/stdout JSON contract** | native (Claude schema) | workaround — own schema (`hook_event_name`, `decision`, exit 2); fields remap | workaround — own schema (mirrors Claude closely; `permissionDecision:"deny"`/exit 2) |
| **Plugin-root / project-dir env vars** | native (`${CLAUDE_PLUGIN_ROOT}`, `CLAUDE_PROJECT_DIR`) | workaround — no equivalent; pass paths via hook config / argv / stdin | workaround — no equivalent; resolve via `.codex/` trust + config |
| **Always-on project context** | native (CLAUDE.md) | native (GEMINI.md) | native (AGENTS.md) |
| **MCP tools** | native | native (stdio/SSE/HTTP, OAuth) | native (stdio/HTTP, OAuth, per-tool approval) |
| **MCP prompts-as-slash-commands** | native | native (`/prompt-name --arg`) | **hard gap** — MCP prompts not documented; route via Skills |
| **MCP resources** | native | native (`@server://path`) | **hard gap** — not documented |
| **Manifest / binding format** | `.claude-plugin/plugin.json` | `.gemini/settings.json` + commands TOML | `config.toml`/`hooks.json` + `.codex/` |

**Reading the matrix:** every row that Team's *behavior* depends on is **native
or workaround on both hosts**. There is **no hook-event gap** — all four events
map natively. The only **hard gaps** are: Gemini on-demand SKILL.md injection,
and Codex MCP prompts/resources. Both are narrow and have documented detours
(below).

> The landscape is recent. As of mid-2026 both Gemini CLI and Codex CLI ship full
> hooks systems, parallel subagents, custom slash commands, MCP, and structured
> headless output. Earlier (2025) write-ups that treated these as hard gaps are
> stale — but the features are young (see the recency risk in the gap analysis).

## Gap analysis

Three genuinely remaining gaps, each with the chosen treatment:

1. **Gemini has no on-demand skill-injection analog (hard gap).** GEMINI.md is
   always-on and per-turn — it is the CLAUDE.md equivalent, not the SKILL.md
   equivalent. Team's methodology skills (`product-thinking`,
   `agent-open-questions`, `progress-tracking`, etc.) are loaded on-demand per
   agent via `skills:`. **Workaround for #56:** fold each agent's required skills
   into that agent's **system prompt** at build time (Gemini subagents carry
   their own system prompt), or concatenate into a scoped GEMINI.md. This trades
   on-demand economy for always-on inclusion; acceptable because Team already
   knows statically which skills each agent preloads (the `skills:` frontmatter
   lists them). **Asymmetry:** Codex has a true on-demand analog
   (`.agents/skills/SKILL.md`, description-matched), so this gap is **Gemini-only**,
   not shared — #57 ports skills natively.

2. **Codex MCP carries tools only (hard gap for prompts/resources).** No
   documented MCP prompts or resources. So "MCP-prompts-as-slash-commands" works
   on Gemini but **not** Codex. **Workaround for #57:** route every slash-style
   entry point through Codex **Skills** (the documented successor to deprecated
   custom prompts), not MCP. This is why the chosen strategy does **not** depend
   on MCP (decision 4).

3. **Recency risk (cross-cutting, not a primitive gap).** Both hosts' hooks and
   subagents shipped **Jan–Apr 2026** (Gemini hooks v0.26.0 / Jan 28; subagents
   ~v0.38.1 / Apr 15; Codex hooks + multi-agent in v0.11x–v0.13x). They are
   documented-stable but young. Treat their contracts as **moving targets**: the
   shim layer (decision 1) exists precisely to absorb breaking changes in one
   place. The full-parity epics must pin host versions and re-validate on host
   upgrades (risks below).

## Decisions made

1. **Chosen strategy: Hybrid — shared host-neutral core + thin per-host binding
   shims.** The canonical core is the portable layer — Markdown bodies + Node
   hook logic + artifact I/O + envelope convention — maintained once. Per host, a
   thin shim provides only the four blocking bindings: (a) the manifest/config
   format, (b) the hook stdin/stdout schema adapter, (c) the plugin-root/project-dir
   env resolution, and (d) the slash-entry registration. Shims may be generated or
   hand-written per host; either way they are small and isolated.
   - *Why:* the expensive, divergent, **high-churn** surface is exactly the
     bindings (three different manifest formats, three hook schemas, young APIs),
     while the **stable, valuable** surface — the 48 agent/skill bodies and 4 hook
     logic files — is *already portable*. The hybrid boundary lines up with the
     natural portable/non-portable seam, so it minimizes both duplication and
     churn-blast-radius.
   - *Serves whom:* Team's maintainer and the #56/#57 port-epic implementers —
     they edit behavior once and re-bind per host, instead of maintaining three
     drifting copies.

2. **Rejected: Single source of truth + full transpile/build.** One canonical
   set; a build step emits a complete Claude plugin, Gemini extension, and Codex
   package. *Why rejected:* it forces the build to fully model **three young,
   divergent manifest/agent/command formats** whose APIs shipped Jan–Apr 2026 and
   are still moving. The upfront modeling cost is high and the build itself
   becomes the highest-churn artifact — every host API change breaks the
   transpiler. The hybrid keeps the same DRY core *without* committing to a
   total-coverage transpiler; shims can stay hand-written where generation isn't
   worth it. (The hybrid *can* generate shims later where it pays — it is a strict
   superset of this option's value with less risk.)

3. **Rejected: Per-host maintained adapters (parallel hand-maintained trees).**
   *Why rejected:* 3× maintenance across 13 agents + 31 skills + 4 hooks, and
   **guaranteed drift** — a fix to an agent body would have to be hand-applied
   three times. It throws away the fact that the bodies are *already portable*.
   Its only advantage (each host fully idiomatic) is largely preserved by the
   hybrid, since the shim layer is where host idiom lives anyway.

4. **MCP is documented as a bridge, not adopted as the strategy's mechanism.**
   The matrix records MCP's reach — tools on both hosts; prompts-as-slash on
   **Gemini only**, not Codex. But the chosen path is **native per-host bindings**;
   MCP is a **documented fallback** to revisit only if a native binding proves
   insufficient. *Why:* Codex MCP is tools-only, so MCP can never be the *uniform*
   layer — leaning on it would force a split path anyway while adding a server
   dependency. Keeping it as fallback preserves the option without coupling the
   strategy to it.

5. **Parity target for #56/#57: full hook + subagent parity** (not MVP-first).
   Each epic targets all four hook events, parallel **and** nested subagents, and
   structured returns before declaring done. This raises the bar against the
   young-API and open-bug risk — so the design confronts those risks head-on
   (risks + "what #56/#57 execute against" below) rather than deferring them by
   reducing scope.

## What #56 and #57 execute against

Both epics build the **hybrid core + per-host shim** for their host, targeting
**full parity**. Each starts from the matrix and works around the named gaps.

### #56 — Gemini port

- Bodies port as-is; agent frontmatter → `.gemini/agents/*.md` (structurally
  identical format).
- Hooks: 4 `.mjs` logic files reused; shim adapts stdin/stdout to Gemini's schema
  (`hook_event_name`, `decision`, exit 2) and maps events
  `PreToolUse→BeforeTool`, `PostToolUse→AfterTool`, `SessionStart→SessionStart`,
  `PreCompact→PreCompress`. Register in `.gemini/settings.json`.
- Slash entry points → TOML in `.gemini/commands/`.
- Env: replace `${CLAUDE_PLUGIN_ROOT}`/`CLAUDE_PROJECT_DIR` with paths passed via
  hook config/argv.
- **Known hazards (must track, not dodge):**
  - On-demand SKILL.md is a **hard gap** — fold each agent's `skills:` set into
    its system prompt or a scoped GEMINI.md at build time (gap 1).
  - **Bug #8022** — subagent→orchestrator return is **text-only**; no structured
    JSON return. The envelope convention still works (parse fenced JSON from
    text), but full-parity structured returns must validate this path and track
    the bug for a native fix.
  - Nested subagents: Gemini subagents **cannot spawn subagents**. Full nesting
    parity (Claude's depth-2) requires the orchestrator to flatten or sequence
    what Team currently nests — track as a parity item, not a silent drop.

### #57 — Codex port

- Bodies port as-is; agent roles → TOML in `.codex/agents/` with the same
  system-prompt body.
- Skills port **natively** to `.agents/skills/SKILL.md` (description-matched
  implicit invocation) — no Gemini-style folding needed.
- Hooks: 4 `.mjs` reused; shim adapts to Codex `hooks.json`/`[hooks]` (schema
  mirrors Claude closely — `permissionDecision:"deny"`/exit 2). Events map nearly
  1:1 (`PreToolUse`/`PostToolUse`/`SessionStart`/`PreCompact`).
- Slash entry points → Codex **Skills** (NOT MCP — gap 2).
- Env: resolve via `.codex/` trust + config.toml.
- **Known hazards (must track, not dodge):**
  - **Bug #15250** — custom agents not always reachable from tool-backed
    sessions; full subagent parity must verify dispatch works in Team's tool-heavy
    flows and track the bug.
  - **Bug #15451** — `--json`/`--output-schema` can be **silently dropped** when
    tools/MCP are active. Team's structured returns run *with* tools active, so
    full-parity structured output must guard against silent schema loss (e.g.
    validate output shape, fall back to text-envelope parse) and track the bug.
  - MCP prompts/resources are a **hard gap** — keep all prompt/slash workflows on
    Skills.

## Out of scope

- **Writing any of the port code.** #56 and #57 own implementation; this is the
  study they execute against.
- **Building the shim generator / build tooling.** Whether shims are generated or
  hand-written is a per-epic implementation choice (decision 1 permits both).
- **Porting the dev-only tree** (`.claude/`, `tests/`, `evals/`, `docs/`,
  `.github/`) — never distributed, never ported.
- **Adopting MCP as a transport.** Documented as fallback only (decision 4).
- **Reduced-MVP parity.** Explicitly rejected — full parity is the target.
- **A fourth host.** Only Claude Code, Gemini CLI, Codex CLI are in the matrix.
- **Guaranteeing host API stability.** The young-API recency risk is surfaced and
  assigned to the shim layer + version pinning, not eliminated.

## Edge cases

These are the boundary conditions the *strategy and the downstream epics* must
handle.

- **Boundary — zero portable change in a body:** a host with an identical body
  format (Gemini agents) needs no transform; the shim is pure binding. The
  strategy must not force a transpile pass where copy suffices.
- **Boundary — a primitive with no host facility at all:** the two hard gaps
  (Gemini on-demand skills, Codex MCP prompts) have explicit documented detours;
  any *new* primitive Team adds must be matrix-checked before assuming it ports.
- **Invalid — host manifest schema drift:** a host changes its hook stdin schema.
  Chosen behavior: the schema adapter lives in the shim only; the `.mjs` core is
  untouched. This is the central reason for the hybrid boundary.
- **Failure — Gemini #8022 text-only return:** structured envelope arrives as
  text. Behavior: parse fenced JSON from text (the convention already does this);
  treat structured-return parity as a tracked bug, not a blocker.
- **Failure — Codex #15451 silent schema drop:** `--output-schema` ignored under
  active tools. Behavior: validate the returned shape and fall back to
  text-envelope parsing; track the bug.
- **Concurrency — nested-subagent depth mismatch:** Gemini (no nesting) and Codex
  (`max_depth=1`) cannot match Claude's depth-2. Behavior: the orchestrator
  flattens/sequences nested work per host; parity item, not a silent capability
  drop.
- **Authorization — Codex `.codex/` trust gate:** project-local hooks/agents load
  only when the directory is trusted. Behavior: the port's install docs must
  state the trust requirement; an untrusted dir silently skips hooks.
- **Resource limit — Codex `agents.max_threads=6`, Gemini parallel cap:** Team's
  5-reviewer parallel dispatch must fit each host's thread ceiling. Behavior: cap
  or batch reviewer dispatch per host.

## Open questions (deferred to the port epics)

- **Shim generation vs. hand-authoring, per host.** Decision 1 permits both;
  which to use is a per-epic structure-phase choice for #56/#57.
- **Host version pinning policy.** Which exact Gemini/Codex versions each port
  certifies against (recency risk) — an implementation detail for the port epics.
- **Whether to upstream fixes for #8022/#15250/#15451** or only design around
  them — a maintenance-posture call for the port epics.

## Risks

- **Young-host-API risk (high).** Gemini/Codex hooks + subagents shipped
  Jan–Apr 2026; contracts may break. Mitigation: bindings isolated in shims; pin
  host versions; re-validate on upgrade.
- **Gemini #8022 (moderate).** Text-only subagent return blocks *native*
  structured parity; the text-envelope convention is the workaround. Tracked as a
  parity hazard for #56.
- **Codex #15250 (moderate).** Custom agents not always reachable from tool
  sessions — directly hits Team's tool-heavy dispatch. Tracked for #57.
- **Codex #15451 (moderate).** Silent `--output-schema` drop under active tools —
  Team always runs with tools active. Needs shape validation + text fallback.
  Tracked for #57.
- **Gemini on-demand-skill gap (moderate).** Always-on folding increases each
  agent's context size vs. Claude's on-demand load; watch token budgets.
- **Hidden Claude Code assumptions (low–moderate).** Some agent prose may assume
  Claude-specific tool names or behaviors not caught by the layer analysis; the
  port epics should audit bodies for host-specific references during structure.
