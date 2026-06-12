---
agent: file-finder
tier: gate
deps:
  - agents/file-finder.md
---

# Locate the harness helpers for the behavioral-eval suite

A teammate is extending the behavioral-eval harness and needs to know which
files own specific responsibilities. Find the real files in this repository
that match each responsibility below and report each one by its repo-relative
path.

1. The module that spawns `claude -p` as a subprocess and returns a
   structured result (the single point of CLI drift).
2. The module that loads on-disk fixture artifacts and parses their YAML
   frontmatter + `ground-truth.json`.
3. The module that performs rubric-based LLM judging and the deterministic
   `outcomeJudge` scorer.
4. The free static-gate test that structurally validates every fixture and
   rubric on disk.

Report each as a path. Do not invent files that do not exist; only report
paths you can confirm are present in the repository.
