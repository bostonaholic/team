---
title: Skills
description: "The Team plugin's 26 skills — 11 entry-point slash commands and 15 methodology skills loaded by agents, with purpose, arguments, consumers, and behaviors."
---

# Team Plugin — Skills
{:.no_toc}

> **Audience:** Plugin maintainers and contributors. End users only need
> the README + `/team` slash command.
>
> **Source of truth:** the skill bodies themselves, `skills/*/SKILL.md`.
> This page is a hand-maintained reference; when it disagrees with a
> `SKILL.md`, the `SKILL.md` wins.

## Contents
{:.no_toc}

* TOC
{:toc}

## Two flavors of skill

Every skill lives under `skills/<name>/SKILL.md` as YAML frontmatter plus a
Markdown body. A single frontmatter field — `argument-hint` — sorts the
catalog into two flavors:

- **Entry-point skills carry `argument-hint`.** Claude Code registers them
  as slash commands (`/team`, `/team-research`, and so on); the
  `argument-hint` documents what to pass as `$ARGUMENTS`.
- **Methodology skills omit `argument-hint`.** They are never invoked
  directly. Agents load them at runtime through inline prose in the agent
  body, such as `Load skills/<name>/SKILL.md for …`.

That binary marker is the whole distinction. There is no `skills:`
frontmatter key and no other flavor. The split is **11 entry-point + 15
methodology = 26**.

For *why* the system is shaped this way — the three-tier argument-discovery
design, the discovery-duplication rationale, and the skill load limits — see
[architecture.md §6](architecture.md#6-skills). The architecture page
explains the design; the full per-skill enumeration now lives here.
