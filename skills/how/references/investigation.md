# How investigation briefs

## Explorer

Give each explorer the user's question, one non-overlapping topic, and this
contract:

- Read only. Do not write files or run state-changing commands.
- Find the trigger: user action, request, job, event, or caller.
- Trace every call and data transformation for the assigned topic.
- Identify central types, interfaces, services, inputs, and outputs.
- Read definitions; never infer behavior from names.
- Record surprising behavior and anything not fully traced.

Return exactly: **Components Found** (path and role), **Flow** (functions and
`file:line`), **Files Read**, **Boundaries**, **Non-Obvious Things**, and
**Open Questions**.

## Critics

Give each critic the finished explanation, relevant paths, and one lens:

1. **Abstraction and boundaries:** whether abstractions have distinct jobs,
   validation occurs at entry points, and components can be tested separately.
2. **Data and complexity:** whether runtime data matches its types and whether
   required complexity stays inside one responsible component.
3. **Change and consistency:** which files change for the next likely
   requirement, which assumptions prevent that change, and whether the code
   follows established local conventions.

Each critic reads the code independently. It returns only architectural
findings rated **structural**, **concern**, or **observation**, each with the
dependency/call evidence that supports it. The critic cannot edit.
