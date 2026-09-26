### Step 6 — Find the dependencies, then propose the links

**Declared** links arrived with the load and are inputs, not findings. **Undeclared** ones
are read out of the same cache, two ways:

- *Textual.* The phrases that carry sequencing — "depends on", "blocked on/by", "after X
  lands", "requires", "prerequisite", "follow-up to". A bare `#N` is a citation, not a
  dependency. The sentence around it decides. Comments outrank bodies.
- *Structural.* One issue introduces the artifact another consumes — a schema, an interface,
  a flag, an endpoint. Neither need cite the other. This is inferred from what each says it
  will build, and it is the weaker of the two signals.

**The direction test.** A is blocked by B when A cannot be *finished* until B lands. When
both directions read plausible, the pair is usually one issue, or split along the wrong
seam — say so instead of guessing.

**Under-link on purpose.** A preferred order is not a dependency. Two issues that touch the
same file, or that one person would rather do in sequence, are a note in the construct
description. The bar is that a competent implementer picking the issue up today would
be genuinely unable to finish it.

**Cycles** are never filed. A cycle means an edge points the wrong way, or the seam is wrong.
Report it with both readings.

Every undeclared dependency is a **proposal**. It reaches the plan as its own numbered step
naming both endpoints, the direction, and the sentence or shared artifact it rests on. Draw
it only against an explicit answer in step 8. A blocker outside this repository or off the
board is reported with its owner named, never linked.
