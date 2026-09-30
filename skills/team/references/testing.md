# Test quality policy

These rules govern every acceptance test and are the bar reviewers hold changed test files to. Each rule catches a different class of test-suite decay.

## Value bar

Every test costs time to read, run, and keep current. A test pays for that time only when it guards one of these: behavior that a caller can see, a regression that is likely to happen, or a contract that stands apart from the code. A bigger suite, a higher coverage number, or a green run is not progress without such a guard. The bar applies to tests that land in a commit. A throwaway reproduction test that you delete before the commit is evidence, not part of the suite.

## Authoring gate

Before you add a test or change one, write an answer to each question below:

1. What goes unguarded if you delete this test? Name a behavior that a caller can see, an invariant, or a contract that stands apart from the code.
2. Which likely bug turns this test red? Describe the bug, not the assertion.
3. Which test already catches that bug? Give each contract one owning test at the owner boundary, the layer that owns the behavior. A test at a different layer needs a risk that the owner's test cannot reach. When a parameterized test already covers the contract, add a row to it. Do not add a near-copy test.
4. Does production code need a hook, a wrapper, a flag, or an extra export that only this test uses? If so, drop that addition and test through the code that real callers use.

A question with no answer stops the test. When all four have answers, compare the test with each [junk pattern](#junk-patterns). A test that fits a pattern fails the gate. The one exception is a test that guards a contract listed in the [retention bar](#retention-bar). Then imagine a refactor that keeps all behavior the same. If that refactor turns the test red, the test pins the implementation. Move its assertions to the owner boundary.

The bar never removes a test that `1-task.md` asks for. Keep that test, and record the conflict as "task-required, fails <class>", where `<class>` names the junk class it matches.

## Junk patterns

Each class names one way a test costs more than it protects. A new test in any class fails the authoring gate. A reviewer flags a changed test in any class.

### Cannot fail

The test passes whether the behavior works or not. [Tautological tests](#no-tautological-tests) are the first member. Examples:

- A test that runs code but asserts nothing, so it adds coverage and no guard.
- A test whose expected value comes from the code under test, or from a copy of its logic.
- A rejection test that goes green because a different check turns the input away first.

### Restates the source

The test copies what the source says instead of what the source does. It changes with every edit to the source and catches nothing else. Examples:

- A test that holds its own copy of an export list, a fixture's fields, or a manifest, and compares that copy with the real one.
- A test that reads a source file and looks for a literal line, import, or string.

### Duplicates stronger proof

A test at a stronger boundary already fails on the same regression. Examples:

- A test of how a private helper gets called, when a test at the public boundary already covers the behavior.
- Two tests that push the same kind of input through the same contract.
- Tests in each caller that repeat cases a shared helper's own test already runs.

### Keeps test-only code alive

The test is the only reason some production code exists. Examples:

- A test that exists to give a test-only export, global, or wrapper a caller.
- Production code that no production path calls, only tests.

### Promises more than it checks

The name, fixture, or mock claims a behavior that no assertion observes. Examples:

- A mock that does the work the test claims to observe.
- A fixture that hands the code the ordering, receipt, or callback that the code should produce itself.
- A test named for an effect, such as "clears the cache", that never asserts the effect.

## Retention bar

A test that looks like a junk class stays when it guards something no other test guards:

- A contract that other code relies on. Examples are a public interface, a protocol, a configuration or data format, a storage layout or migration, a security rule, a default value, and a release artifact.
- The sequence of calls, when a caller can see that sequence.
- A likely regression, when you can name how the code would fail.
- A test that reads source text, when no other independent guard costs less. Such a test goes red when a key, byte, or path that users see changes. It stays green when only internal names change.

When a kept test goes red, suspect the product first. Reproduce the failure, repair the owning code, and keep the test. Do not delete a test because it runs slowly or reads code without running it.

## Removal evidence

Some changes delete or weaken a test that exists on the base branch but keep the behavior that the test covers. Before such a change, fill in all seven fields:

| Field | What to record |
|---|---|
| Location | The test name and the file that holds it. |
| Origin | The commit or issue that added the test, and why the test exists. |
| Caught bug | The failure that the test can detect today. |
| Callers | Each non-test caller of the code that the test covers. |
| Remaining proof | The stronger owner-boundary test that still catches that bug, or why no test needs to. |
| Freed code | The code that the removal lets you delete, or "none". |
| Risk and command | What can go wrong, and the focused command whose green run shows that the removal is safe. |

Keep the test while any field is empty. Put the record in the body of the commit that removes the test. When a plan step orders the removal, the step supplies the fields and the commit body carries them. A deleted test is exempt only when the same change deletes the behavior that it covers.

## Regression tests

A regression test for a bug fix goes red on the code before the fix, and the red comes from the assertion written for that bug. After the fix, it goes green. A test that you never saw fail shows nothing about the fix. Put one test at the owner boundary, the layer that owns the broken behavior. Do not repeat it at each layer the bug passes through. Record the Red run: the command you ran and the failing assertion it printed.

## Test behavior, not implementation

Tests assert externally observable outcomes — return values, persisted state, effects visible to other components. A refactor that preserves behavior must leave every acceptance test green. Interaction tests verify state-changing calls only; never assert on query-only calls.

## No tautological tests

Write the expected result without using the implementation being tested. Derive it from the requirement, a fixed example, or an external specification. Do not call production code, import its calculated values, copy its algorithm, configure a mock result and assert that same result, or assert setup data without exercising production behavior.

Ask: "If the implementation were wrong, could this expected result still be correct?" If not, the test is tautological. Every test must reject at least one plausible broken implementation. Observe the test fail before changing production code. When the tested behavior already exists, temporarily alter or bypass the relevant production behavior, require the test to fail, then restore it. A test that stays green does not verify the behavior.

## Tests are DAMP, not DRY

Inline the setup a reader needs to understand a failing test. Tolerate duplication; favor a linear arrange-act-assert story. Pass the asserted value through helpers, never hide it. No `if`, no loops, no string-building inside a test body.

## Narrow assertions

Assert the specific field or effect the test cares about, not full equality on a complex object. Reserve full-snapshot assertions for at most one default test per common case.

## Test failures must be actionable

A failing test must be diagnosable from name + assertion output alone, without rerunning. Test names describe behavior, not method.

## Wait for the condition. Never sleep

Replace every fixed `sleep(N)` with a wait-for-condition primitive.

## Assert outcomes, not interleavings

Never depend on scheduler order. `join()`/`await` every concurrent task before asserting. Sort or compare sets unless order is the contract.

## Control the clock

Freeze or inject time. Never feed real `new Date()`, `Date.now()`, naive calendar math, future expiry literals, or timezone-naive dates into assertions.

```js
const token = { expiresAt: "2030-01-01" };
expect(isValid(token, new Date())).toBe(true);
```

```js
const now = new Date("2024-06-15T12:00:00Z");
const token = issueToken({ now, ttlDays: 30 });
expect(isValid(token, now)).toBe(true);
```

Past or fixed date literals with an explicit timezone are the sanctioned form.

## Seed all randomness

Use explicit inputs or seed every RNG that can affect an assertion.

## Tests own their state — any order, any host

Each test creates and removes its DB rows, files, cache values, and environment changes. Reset shared state. Never depend on another test or execution order.

## Impose order before asserting it

Use `ORDER BY` or sort before positional assertions. Otherwise use unordered matchers. Never compare ordered expectations with set-backed results.

## Hermetic boundaries

Stub real networks; allocate ports dynamically; always close resources. Pin locale, timezone, paths, and line endings. Compare floats with tolerance.

## Fidelity ladder: real > fake > mock

Prefer real, then fake, then mock. Wrap vendor types behind owned interfaces. E2E is reserved for critical user journeys; when behavior overlaps an existing feature, add a cross-feature interaction test.

## Audit checklist

| Check | Pass criterion |
|---|---|
| Behavior-named | Name behavior, not a method. |
| Independently derived expectation | The expected result does not depend on the implementation being tested and rejects a plausible incorrect implementation. |
| Narrow assertion | Assert the specific contract. |
| Actionable failure | Output names the failed condition. |
| No sleeps | Use condition waits. |
| Deterministic inputs | Freeze clocks, seed RNGs, own state, order results, stub networks, allocate ports, close resources, pin environment, tolerate floats. |
| No test logic | No branches, loops, or string building. |
| One scenario per test | One independent behavior. |
| DAMP setup | Keep assertion-relevant setup visible. |
| Fidelity ladder | Real > fake > mock; wrap unowned types. |
| Earns its cost | The test answers every `Authoring gate` question and matches no junk class, unless the `Retention bar` names the contract it guards. |

## Value red flags (reviewer checklist)

Flag a changed test that matches a [junk class](#junk-patterns) when the [retention bar](#retention-bar) does not keep it. Also flag a removal that lacks the [removal evidence](#removal-evidence) fields. The flags are:

- cannot fail, which includes every tautological test
- restates the source
- duplicates stronger proof
- keeps test-only code alive
- promises more than it checks
- removal without evidence

A flag on an editable test is blocking on first occurrence. A flag on a locked acceptance test is a non-blocking note, because no agent may edit that test during IMPLEMENT. The [code reviewer brief](../code-review/references/code-reviewer.md) sets the finding labels.

## Flaky-test red flags (reviewer checklist)

Any outcome-dependent flag is blocking on first occurrence per the [code reviewer brief](../code-review/references/code-reviewer.md): real time or future dates; `sleep()` or timed waits; race order or missing awaits; shared state or missing teardown; unseeded randomness; real networks; leaked resources or fixed ports; unordered positions; exact floats; platform, locale, TZ, CPU, or CI parallelism. Fixed explicit-TZ dates and deterministic controls do not flag.
