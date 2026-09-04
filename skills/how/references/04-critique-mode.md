## Critique mode

Explain first — run `## Explain mode` in full. You cannot judge an
architecture you have not established.

1. **Dispatch critics.** Three fresh-context critics, all **in one
   message**, through the `Agent` tool with `subagent_type: Explore` and
   `model: sonnet`, one lens each:
   - *Abstraction fit and boundary discipline* — does each abstraction
     earn its place; are boundaries where things change independently;
     is validation at entry points; could this be tested in isolation?
   - *Data model and complexity spend* — do the structures fit the
     access patterns; are types honest about runtime shapes; is
     complexity concentrated where the domain needs it or leaked into
     accidental places?
   - *Evolution readiness and consistency* — how much moves when the
     likely next requirement lands; which hardcoded assumptions would
     need relaxing; does this area follow the codebase's established
     patterns, and is any divergence explained?

   Each critic receives the explanation, the relevant file paths, and
   its lens; it reads the actual code and forms its own judgment — the
   explanation is a map, not the verdict. Each finding comes back rated
   **structural** (wrong boundary, broken model, coupling that blocks
   future work), **concern** (real friction, not fundamental), or
   **observation** (worth noting), with concrete code evidence — a
   dependency chain shown, never asserted. Architectural findings only:
   line-level review belongs to `code-review`, and a rewrite may not be
   suggested without a demonstrated problem. The critics get fresh
   context and no authorship stake — that separation is the point
   (`principle-generator-evaluator`). If dispatch is
   unavailable, run the three lenses yourself sequentially and say so.

2. **Judge as the lead.** You are a pragmatic lead, not an aggregator.
   Sort every finding into **Act on** (worth fixing now), **Consider**
   (real, unclear cost/benefit), **Noted** (valid, low priority), or
   **Dismissed** (wrong, missing context, or style preference — say
   which).

3. **Present.** The explanation first, standing on its own; the critique
   verdict below it. A reader who only wants to understand the system
   never wades through critique.
