---
title: Agent Plugins compatibility
description: "Generate a validated Agent Plugins 1.0.0 package while keeping Team's native installation and invocation controls."
---

# Agent Plugins compatibility

Team can export a directory targeting Agent Plugins 1.0.0. This compatibility
claim applies only to the generated directory. The native checkout retains
host metadata, agent registrations, hooks, and invocation controls.

Use the [native installation instructions](https://github.com/bostonaholic/team#install)
for the full Claude Code pipeline. Choose one distribution per client because
both distributions use the plugin name `team`.

## Generate a package

Use Bun 1.4.2, the verified exporter runtime, with its built-in YAML and Markdown APIs.
The package's broader Bun engine range does not establish exporter support.
Install the checkout dependencies before exporting:

```bash
bun install --frozen-lockfile
```

Exporter execution disables Bun auto-install and requires these installed dependencies.
Export from a stable checkout into a trusted, existing parent directory.
The command requires filesystem read/write permissions. It downloads nothing,
executes no copied helper, and needs no login or credentials.

From the Team checkout, replace the example with an absolute, fresh directory:

```bash
bun run export:agent-plugin /absolute/existing-parent/team-portable
```

The script also works from another working directory when invoked by absolute path:

```bash
bun run --no-install /absolute/team-checkout/scripts/export-agent-plugin.ts /absolute/existing-parent/team-portable
```

The command validates all selected inputs before creating output. It refuses
relative destinations, paths inside the checkout, missing parents, and existing
entries, including dangling symlinks. Concurrent exporters cannot own the same
directory. A losing exporter leaves the winner's files alone.

Invalid metadata, missing resources, unsupported links, symlinks, special files,
MCP configuration, and unaudited extensions fail with a path and rule.
Nonhidden dotted root directories require an extension audit, even without manifest registration.
Only `agents/openai.yaml` may appear in each excluded skill registration directory.
Unexpected registration files require another audit.

Copy or final-validation failures remove only this invocation's output.
Cleanup failures report both errors. A process interruption can leave incomplete
output. Choose a fresh directory for another attempt. There is no overwrite or
recovery mode. Success reports the destination and omitted discovery files.

Generation does not install or publish anything. Supply the completed directory
to a compatible client's own installation mechanism.

## Contents and limits

The output contains `plugin.json`, `LICENSE`, this document as `README.md`, and
`skills/`. The manifest copies the source version. All eligible skill bodies,
resource bytes, and file permissions remain unchanged. Projected frontmatter
retains `name`, `description`, `license`, `compatibility`, `metadata`, and
`allowed-tools` when present.

The exporter validates and removes four native fields from generated metadata:
`effort`, `argument-hint`, `user-invocable`, and `disable-model-invocation`.
The native declarations remain authoritative and unchanged in the checkout.
A boolean `disable-model-invocation: true` omits discovery for:

- `no-comments`
- `pr-rebase`
- `pr-watch-as-reviewer`
- `reflect`

Their shared resources remain available. For example, `pr-screenshots` still
uses `pr-watch-as-reviewer` references. Use native installation when these
explicit-invocation utilities are needed. Ordinary `user-invocable: false`
controls presentation in native hosts. Portable menu visibility is client-defined.

Native agent/hook registrations and per-skill `agents/openai.yaml` are absent.
The export supplies no native enforcement, dispatch adapter, or replacement
invocation control. It does not promise that a generic client can run the Team
pipeline. Instructions can require Skill, Agent, Bash, TodoWrite, and host
messaging tools, plus Git, GitHub CLI, and repository-specific build tools.
Host capabilities, authentication, helper dependencies, and execution permissions
remain prerequisites for the instructions that use them.

Existing resource directories, direct scripts, declarations, templates, and
`team/registry.json` remain present. Cross-skill citations keep plugin-root paths.
Clients must supply the working context those instructions expect. Script
resources are retained, without a guarantee of execution on every client.
The `shipit` versioning reference uses an absolute repository URL and therefore
requires network access when read. The exporter itself performs no network I/O.

## Sources and interpretation

This audit uses [Agent Plugins 1.0.0](https://agent-plugins.org/specification),
its [canonical manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json),
and [Agent Skills](https://agentskills.io/specification), retrieved 2026-09-08.
Agent Skills has no version identifier on that document. Reference validation
uses [skills-ref at commit 69ef37e9424c0a7ea9dd2293b559e43ec8176379](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref).
Normative text takes precedence over examples and schema interpretation.

Two source-profile interpretations remain disputed: extra Agent Skills
frontmatter fields, and legacy client files outside extension directories.
The strict generated profile avoids relying on either interpretation. The native
checkout does not claim this generated profile's compatibility.
Contained symlinks are permitted by the specification, but this exporter rejects
all symlink inputs. MCP and extensions are optional specification features
that this audited exporter does not support.

Confidence: high for the stated package checks and explicit requirements.
Confidence: moderate for advisory-text interpretation and client usability beyond format discovery.

## Requirement audit

AP denotes Agent Plugins. AS denotes Agent Skills. Evidence identifiers refer
to the observed verification results below. Client-only duties describe behavior
that a package exporter cannot certify.

| Requirement | Disposition | Evidence |
| --- | --- | --- |
| AP §§1–3: version and definitions | Generated package targets 1.0.0 only. | V1, V4 |
| AP §4.1(1–3): root and containment | One output root, containing regular files/directories. Symlink inputs fail. | V2, V4 |
| AP §4.1(4): configured relative paths | No portable path configuration is emitted. Markdown citations are not configuration fields. | V4 inventory |
| AP §4.1(5): failure boundaries | Client-only loader and sandbox behavior. No certification claim. | Output scope above |
| AP §4.2: example layout | Root manifest, skills, README, and license follow the example. | V2, V4 |
| AP §§5.1–5.3: manifest shape and identity | Canonical schema, object root, required identifiers, types, and unknown-field refusal. | V1, V4 |
| AP §5.4: metadata and author | All present fields validated, including closed author object. No additional URL/email restrictions. | V1, V4 |
| AP §§5.4, 10.2: semver and SPDX recommendations | Source version `0.96.0` and license `MIT` comply. Export copies the authoritative version. | V3, V4 |
| AP §5.5: plugin name | `team` complies. Tests cover length, character set, endpoints, and repeated separators. | V1 |
| AP §5.6, §§8.1–8.2: extensions | Optional, absent. No invented namespace replaces native files. | V1, V2 |
| AP §§5.1–5.3: loading/schema selection | Client-only compatibility mappings and rejection behavior remain outside scope. | Output scope above |
| AP §§6–7.1: component placement | Immediate `skills/<name>/SKILL.md` files define discovery. Guarded resource directories provide no discovery file. | V2, V4 |
| AP §§6–7.1: discovery/failure handling | Client-only behavior. Tests inspect package locations without certifying a client. | V2 scope |
| AP §7.1: referenced skill format | Each discoverable skill uses published fields and passes reference validation. | V1, V4 |
| AP §7: other component types | Native agents/hooks are outside v1 and absent from output. | V2 |
| AP §7.2.1: MCP schema/transports/paths/headers | Conditional, not applicable. No MCP files, servers, executables, endpoints, or credentials are configured. | V1, V2 |
| AP §7.2.2: MCP loading/failures | Client-only startup, handshake, authentication, retries, and transports are not implemented. | No MCP profile |
| AP §8: client file placement | Native manifests and per-skill client registrations are absent. No legacy-layout allowance is assumed. | V2 |
| AP §8: namespace ownership/stability | Client recommendation, not applicable without a namespace. | No extensions profile |
| AP §§9.1–9.2: process variables/expansion | Conditional/client duties, not applicable without stdio MCP. Skill shell commands are not MCP configuration. | No MCP profile |
| AP §10.1: schema agreement | Manifest schema pinned to 1.0.0. MCP agreement is inapplicable. Schema publishing belongs to specification maintainers. | V1, V4 |
| AP §11 and appendices | No client certification. Appendix A and Design Decisions supply non-normative guidance. | Output scope above |
| AS directory/document format | Delimited YAML precedes unchanged Markdown. Each name matches its immediate directory. | V1, V2, V4 |
| AS name/description | Validate types, names of 1–64 characters, nonblank descriptions of 1–1024 Unicode code points, syntax, and directory agreement. ASCII names are this exporter profile. | V1, V4 |
| AS optional fields | Strings, compatibility length 1–500 Unicode code points, string-to-string metadata, and experimental `allowed-tools` string. | V1, V4 |
| AS extra frontmatter | Strict output contains only six published fields. Source native fields remain intact. | V1, V2, V3 |
| AS body/scripts/references/assets | Allowed resources retain bytes and modes. Local Markdown targets resolve inside output. | V2, V4 |
| AS descriptions/progressive disclosure | Source budgets remain below the recommended 500 lines. Descriptions and split references remain unchanged. | V3, V4 |
| AS relative references/shallow access | Within-skill relative links remain. Cross-skill plugin-root citations preserve the established convention and shared resources. This is an advisory deviation. | V2 |
| AS script self-containment/errors/dependencies | Helpers and dependency instructions remain. Hosts must supply their tools. No generic execution guarantee. | V2 copied-helper check |

## Verification evidence

Observed on 2026-09-08 with Bun 1.4.2:

| ID | Check | Observed result |
| --- | --- | --- |
| V1 | Metadata and source contracts, `tests/agent-plugins.test.ts` | 125 passed, 0 failed. Malformed inputs and each audited field constraint reject with specific diagnostics. |
| V2 | Export and runtime-classifier suites | 70 passed, 0 failed. Includes concurrent ownership, fault cleanup, deterministic output, body references, HTML entities, skill loads, and copied helper execution. |
| V3 | Affected native and documentation suites | 184 passed, 0 failed. Jekyll build passed. Full `bun test`: 2535 passed, 4 baseline skips, 0 failed across 70 files. Typecheck passed. |
| V3 | Native validation against edited checkout | Antigravity accepted 90 skills and 13 agents. Claude manifest validation passed with no errors or warnings. |
| V4 | Cached official JSON Schema plus pinned `skills-ref` | Manifest passed. All 86 discovered skills passed. Four guarded discovery files omitted. |
| V4 | Independent final-package comparison | 262 files verified. Bodies, resources, modes, README, license, manifest, and containment passed. |
| V4 | Documented export command | Completed in 0.231 seconds. This observation has no benchmark threshold. |

The independent tooling stays outside project dependencies and free suites.
The exporter and free tests run without network requests or paid model calls.
Native observations establish metadata acceptance, without generic client certification.

## Related documentation

- [Native installation](https://github.com/bostonaholic/team#install)
- [Cross-host portability](https://github.com/bostonaholic/team/blob/main/docs/cross-host-portability.md)
- [Land-time versioning](https://github.com/bostonaholic/team/blob/main/docs/versioning.md)
- [Testing strategy](https://github.com/bostonaholic/team/blob/main/docs/testing.md)
