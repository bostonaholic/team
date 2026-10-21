# Test quality policy

The bar for every acceptance test and for reviewers of changed test files.

## Value bar

A test pays for its cost only when it guards behavior a caller can see, a likely regression, or a contract that stands apart from the code. A bigger suite, higher coverage, or a green run is not progress without such a guard. The bar applies to tests that land in a commit, not to a throwaway reproduction deleted before the commit.

## Authoring gate

Before you add a test or change one, write an answer to each question below:

1. What goes unguarded if you delete this test? Name a behavior that a caller can see, an invariant, or a contract that stands apart from the code.
2. Which likely bug turns this test red? Describe the bug, not the assertion.
3. Which test already catches that bug? Give each contract one owning test at the owner boundary, the layer that owns the behavior. A test at a different layer needs a risk that the owner's test cannot reach. Add a row to an existing parameterized test rather than a near-copy test.
4. Does production code need a hook, wrapper, flag, or export that only this test uses? If so, drop it and test through the code real callers use.

A question with no answer stops the test. A test that fits a [junk pattern](#junk-patterns) fails the gate unless the [retention bar](#retention-bar) keeps it. A test that a behavior-preserving refactor would turn red pins the implementation; move its assertions to the owner boundary.

The bar never removes a test that `1-task.md` asks for. Keep that test, and record the conflict as "task-required, fails <class>", where `<class>` names the junk class it matches.

## Junk patterns

A new test in any class fails the authoring gate. A reviewer flags a changed test in any class.

- **Cannot fail:** passes whether the behavior works or not. Includes every [tautological test](#no-tautological-tests), a test that asserts nothing, and a rejection test that goes green because a different check rejects the input first.
- **Restates the source:** checks what the source says instead of what it does, such as its own copy of an export list, fixture, or manifest compared with the real one, or a search of a source file for a literal line, import, or string.
- **Duplicates stronger proof:** a stronger-boundary test already fails on the same regression, such as a private-helper test behind a covered public boundary, or caller tests repeating a shared helper's cases.
- **Keeps test-only code alive:** the test is the only reason a production export, global, wrapper, or code path exists.
- **Promises more than it checks:** the name, fixture, or mock claims a behavior no assertion observes, such as a mock doing the observed work, or a fixture handing the code the ordering, receipt, or callback it should produce.

## Retention bar

A test that looks like a junk class stays when it guards something no other test guards:

- A contract other code relies on: a public interface, protocol, configuration or data format, storage layout or migration, security rule, default value, or release artifact.
- A call sequence a caller can see.
- A likely regression whose failure you can name.
- A source-text read when no cheaper independent guard exists; it must go red when a user-visible key, byte, or path changes and stay green on internal renames.

When a kept test goes red, suspect the product first: reproduce, repair the owning code, keep the test. Slowness, or reading code without running it, is no reason to delete a test.

## Removal evidence

Before you delete or weaken a base-branch test while keeping the behavior it covers, fill in all seven fields:

| Field | What to record |
|---|---|
| Location | Test name and file. |
| Origin | The commit or issue that added it, and why it exists. |
| Caught bug | The failure it can detect today. |
| Callers | Each non-test caller of the covered code. |
| Remaining proof | The stronger owner-boundary test that still catches that bug, or why no test needs to. |
| Freed code | The code the removal lets you delete, or "none". |
| Risk and command | What can go wrong, and the focused command whose green run shows the removal is safe. |

Keep the test while any field is empty. The commit that removes the test carries the record in its body; when a plan step orders the removal, the step supplies the fields. The record is not needed when the same change deletes the covered behavior.

## Regression tests

A regression test for a bug fix goes red on the code before the fix, from the assertion written for that bug, and green after the fix. A test you never saw fail shows nothing. Put one test at the owner boundary, not at each layer the bug passes through. Record the Red run: the command and the failing assertion it printed.

## Test behavior, not implementation

Assert externally observable outcomes: return values, persisted state, effects visible to other components. A behavior-preserving refactor must leave every acceptance test green. Interaction tests verify state-changing calls only, never query-only calls.

## No tautological tests

Derive the expected result from the requirement, a fixed example, or an external specification. Do not call production code, import its calculated values, copy its algorithm, assert a mock's configured result, or assert setup data without exercising production behavior.

Every test must reject at least one plausible broken implementation. Observe it fail before changing production code; when the behavior already exists, temporarily break it, see the failure, then restore it.

## Test shape

- DAMP, not DRY: inline the setup a reader needs to understand a failure; never hide the asserted value in a helper. No `if`, loops, or string-building in a test body.
- Assert the specific field or effect, not full equality on a complex object. At most one full-snapshot test per common case.
- A failure must be diagnosable from the behavior-describing name and assertion output alone.

## Determinism

- Replace every fixed `sleep(N)` with a wait-for-condition primitive.
- Never depend on scheduler order. `join()`/`await` every concurrent task before asserting.
- Freeze or inject time. Never feed real `new Date()`, `Date.now()`, naive calendar math, future expiry literals, or timezone-naive dates into assertions. Fixed date literals with an explicit timezone are allowed.
- Use explicit inputs or seed every RNG that can affect an assertion.
- Each test creates and removes its own DB rows, files, cache values, and environment changes, resets shared state, and never depends on another test or execution order.
- Sort (or `ORDER BY`) before positional assertions; otherwise use unordered matchers. Never compare ordered expectations with set-backed results.
- Stub real networks, allocate ports dynamically, close resources, pin locale, timezone, paths, and line endings, and compare floats with tolerance.

## Fidelity ladder: real > fake > mock

Wrap vendor types behind owned interfaces. Reserve E2E for critical user journeys; when behavior overlaps an existing feature, add a cross-feature interaction test.

## Audit checklist

| Check | Pass criterion |
|---|---|
| Behavior-named | Name behavior, not a method. |
| Independently derived expectation | Per [No tautological tests](#no-tautological-tests). |
| Narrow assertion | Per [Test shape](#test-shape). |
| Actionable failure | Output names the failed condition. |
| No sleeps | Use condition waits. |
| Deterministic inputs | Every [Determinism](#determinism) rule. |
| No test logic | Per [Test shape](#test-shape). |
| One scenario per test | One independent behavior. |
| DAMP setup | Per [Test shape](#test-shape). |
| Fidelity ladder | Real > fake > mock; wrap unowned types. |
| Earns its cost | Answers every `Authoring gate` question and matches no junk class, unless the `Retention bar` keeps it. |

## Value red flags (reviewer checklist)

Flag a changed test that matches a [junk class](#junk-patterns) when the [retention bar](#retention-bar) does not keep it. Flag a removal that lacks the [removal evidence](#removal-evidence) fields.

A flag on an editable test is blocking on first occurrence. A flag on a locked acceptance test is a non-blocking note, because no agent may edit that test during IMPLEMENT, CODE REVIEW, and SECURITY REVIEW.

## Flaky-test red flags (reviewer checklist)

A test whose outcome depends on any of these is blocking on first occurrence: a [Determinism](#determinism) violation, or platform, CPU speed, or CI parallelism. Fixed explicit-TZ dates and deterministic controls do not flag.
