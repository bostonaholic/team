## Output format

Adapt to the question — not every section is needed every time.

- **Overview** — one or two paragraphs: what it is, what it does, why it
  exists. Enough to decide whether to keep reading.
- **Key Concepts** — the types, services, and abstractions needed to
  follow the rest. Brief definitions, not an inventory.
- **How It Works** — the core: what triggers it, what happens step by
  step, where data goes, the decision points. Prose, not pseudocode,
  citing files and functions. Add a mermaid diagram when the flow
  crosses several components and a diagram clarifies; skip it when
  prose covers the flow.
- **Where Things Live** — the file and directory map someone needs to
  start working here. Not every file.
- **Gotchas** — surprising behavior, historical residue, sharp edges.
  Omit when there is nothing worth calling out.

Concrete language throughout: "`UserService` calls
`AuthClient.refresh()`", never "the service delegates to the client".
When something is complex, explain why it is complex; when it is simple,
do not pad it.
