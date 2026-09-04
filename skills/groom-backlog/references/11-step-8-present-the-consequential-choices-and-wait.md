### Step 8 — Present the consequential choices and wait

The read-and-plan phase stops before any mutation. Present one question per mutation class
that the plan actually contains, never a fixed count. Make each one a structured question
with exactly one recommendation, never zero and never two. Then end the turn. Five recur:

- **placement strategy** — extend existing constructs, or open a new wave for work that
  arrived after the original plan
- **date strategy** — retarget everything, retarget only where work remains, or leave dates
  alone
- **refinement depth** — hygiene only, rewrite thin tickets, or rewrite technical tickets
  into the project's house voice. The third is far more invasive than it sounds. Never assume
  it
- **an empty or exit construct** — describe it, describe it and file the issue that carries it,
  or leave it
- **dependency links** — draw every proposed link. Or draw only the ones a cited sentence
  supports, and leave the structural inferences as a note. Or draw none. Present each
  proposed link as its own line, with both endpoints and the direction spelled out. A
  backwards one is then visible before it is drawn

Every other mutation class gets a question too, and **filing a new issue always gets its own
question**: present each proposed issue with the exact title and body it would create, and
create it only on an explicit answer to that one. Approving placement, dates, or refinement
depth never carries issue creation — the do-not-invent-scope hard rule is not satisfied by an
adjacent answer. **closures** get the same separation at the same granularity: each
proposed closure gets its own question, with exactly one recommendation, and closes
only on an explicit answer to that one. A single yes never closes several. A close is
public and irreversible, so it gets the new-issue treatment, not less. For each issue,
present the exact comment body from `$RUN_DIR/closure-evidence-<n>.md`. Where that body
quotes tracker text, keep the quote fenced and labelled untrusted. Print that file's
absolute path in the question. Give each proposed closure its own sub-heading, so the
batch stays scannable and a partial answer is easy to write. Head that sub-heading with
the issue's repository and number, so a wrong-repository proposal is visible before it is
answered. Each question names the load-bearing fact the verdict rests on: the file,
symbol, or behavior state the run itself observed. Approving any other class never
carries a closure.

The granularity rule is `principle-explicit-intent`: one yes per
irreversible mutation, and an adjacent class's approval never carries one.

Then wait for the user's approval. Nothing on the tracker changes before the user answers. No
answer means no mutation. A partial answer executes only the answered subset. Executing the
approved plan is a separate turn that reads `$RUN_DIR/8-plan.md`.
