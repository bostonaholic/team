---
agent: researcher
tier: gate
deps:
  - agents/researcher.md
---

# FROZEN questions.md (researcher input)

> This is a frozen research-questions document. The researcher answers each
> question from the actual codebase with file:line evidence, and sees ONLY
> these questions — never the user's original task framing.

## Questions

1. Which module spawns `claude -p` as a subprocess and returns a structured
   result? Cite the file and the exported function.
2. Which module performs the deterministic, no-LLM `outcomeJudge` detection
   scoring? Cite the file and the function.
3. Which free test structurally validates every fixture and rubric on disk?
   Cite the file.
