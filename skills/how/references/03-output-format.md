## Output format

Adapt to the question — not every section is needed every time. Omit
incidentals: no account of how you explored, no background the question did
not raise, no restatement.

- **Overview** — one or two paragraphs: what it is, what it does, why it
  exists. Enough to decide whether to keep reading.
- **Key Concepts** — brief definitions of the abstractions needed to
  follow the rest, not an inventory.
- **How It Works** — the core: what triggers it, each step, where data
  goes, the decision points. Prose, not pseudocode, citing files and
  functions. Add a mermaid diagram when the flow crosses several
  components and a diagram clarifies; skip it when prose covers the flow.
- **Where Things Live** — the file and directory map someone needs to
  start working here, not every file.
- **Gotchas** — surprising behavior, historical residue, sharp edges.
  Omit when there is nothing worth calling out.

Claims about code carry `file:line`; a flow step names the function that
runs it. When something is complex, explain why it is complex.
