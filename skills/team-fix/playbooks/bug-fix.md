# Root-cause correction

Reproduce the failure before fixing it. Ask why until you identify a changeable cause beyond the immediate symptom.
Use the retained debugging and test-driven procedures for their diagnostic, reproduction, and verification steps.
Add an absence guard only when absence is legal. Otherwise correct why the value is missing.
Replace workarounds with a cause-level correction when approved scope permits it.
Search for sibling occurrences. Fix only those inside approved scope and record the rest without editing them.
When evidence is insufficient, instrument, read the actual error, and observe before hypothesizing.
For restart failures, inspect persistent configuration, caches, locks, and serialized state first.
If removing state restores behavior, correct state validation rather than unrelated code.
Make the smallest scoped correction and verify the reproduction and affected callers.
