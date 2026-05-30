---
name: product-thinking
description: Product-need reasoning lens for "make something people want" — loaded by questioner, design-author, and structure-planner to validate user demand while framing, designing, and slicing scope
user-invocable: false
---

# Product Thinking

A reasoning lens, not a gate. It produces no artifact of its own and blocks
nothing. It shapes how the pre-implementation agents frame, design, and slice
scope so that the work is something real people actually want.

## Core Lenses

Four lenses sharpen every framing, design, and slicing decision:

- **Demand evidence over assertion**: Ask what signal says a real person wants
  this — not whether it is technically possible or interesting to build. A
  clever capability nobody asked for is still waste.
- **Smallest thing people want**: Prefer the thinnest version that delivers
  real value, and resist speculative scope and gold-plating. Extra surface
  area is cost you pay before you have learned whether anyone wants it.
- **Build for someone specific, not nobody**: Name the actual user a change
  serves. A feature with no identifiable user is a red flag to surface, not a
  detail to gloss over.
- **Talk-to-users mindset**: Treat the user's stated intent as a *proxy* for
  real demand, and explicitly surface where an assumption is standing in for
  validation rather than silently accepting it as fact.

## When Framing the Task

Questions to sharpen the *inferred goal* and *acceptance signals* you write
into `task.md`:

- **Who specifically is this for?** Identify, if knowable, who the work serves
  — an actual person or role, not "users" in the abstract.
- **What signal would tell us they want it?** Identify the observable demand
  signal that the acceptance criteria can stand on.
- **What is the smallest version that delivers that?** Frame the goal around
  the thinnest outcome that would satisfy the named person.

These lens questions shape only how the questioner frames the inferred goal and
acceptance signals — never what gets researched or what goes into
`questions.md`. (The goal stays out of `questions.md` by design.)

## When Designing

Questions to apply while choosing an approach and writing `## Decisions made`
and `## Out of scope`:

- **Does this decision serve a real user need or a hypothetical one?** Tie each
  decision back to the named user, or surface it as an open question.
- **Where is an assumption standing in for demand?** Call out the places where
  "users will want this" is unvalidated, rather than burying it.
- **What is the thinnest design that delivers the wanted outcome?** Prefer the
  simplest approach that satisfies real demand over the most complete one.

## When Slicing

Questions to apply while ordering slices:

- **Does slice 1 ship something a real person would want, or only
  infrastructure?** The first slice should deliver value, not scaffolding.
- **Is any slice building for nobody?** A slice with no identifiable user is a
  signal to cut or re-order.
- **Can we cut scope to the smallest wanted thing?** Trim slices toward the
  thinnest version that delivers real value.

## Lens, Not Dogma

This lens informs judgment; it never blocks the pipeline. Do not manufacture
user-research ceremony where the user's stated intent already answers "who
wants this." On an empty or trivial task, the right move is to apply judgment
and ask nothing extra. The point is to keep "do real people want this?" in
view — not to add ritual.
