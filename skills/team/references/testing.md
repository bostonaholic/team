# Test quality policy

These rules govern every acceptance test and are the bar reviewers hold changed test files to. Each rule catches a different class of test-suite decay.

## Value bar

A test earns its maintenance cost when it protects observable behavior, a credible regression, or an independent contract. More tests, higher coverage, and a green run are not progress by themselves. The bar governs tests that reach a commit. A throwaway reproduction test that you delete before the commit is evidence, not a suite test.

## Authoring gate

Answer four questions before you add or change a test:

1. What observable behavior, invariant, or independent contract does the test protect?
2. What credible regression makes the test fail?
3. Why does existing coverage miss that regression? Each contract has one owning test at the owner boundary, the layer that owns the behavior. A test at another layer needs a risk that the owner cannot reach. Prefer a new case in an existing parameterized test to a near-copy.
4. Does the test need a production seam, such as an export, flag, wrapper, or hook, that no production caller uses? If it does, test at the real boundary instead.

If a question has no answer, do not add the test. Then compare the test with the [junk patterns](#junk-patterns). A match fails the gate unless the [retention bar](#retention-bar) names the contract that the test guards. A test that breaks under a behavior-preserving refactor asserts implementation. Rewrite it at the owner boundary.

The bar never removes a test that `1-task.md` asks for. Keep that test, and record the conflict as "task-required, fails <class>", where `<class>` names the junk class it matches.

## Junk patterns

Each class names one way a test costs more than it protects. The authoring gate rejects a new test in any class, and a reviewer flags a changed test in any class.

### Cannot fail

The test passes whether the behavior works or not. [Tautological tests](#no-tautological-tests) are the first member. Examples:

- A test with no assertion, which only runs code to raise coverage.
- An expected value that the code under test, or a copy of its algorithm, computes.
- A negative check that passes because an unrelated guard rejects the input.

### Restates the source

The test copies what the source says instead of what the source does. It changes with every edit to the source and catches nothing else. Examples:

- A copied list of exports, fixture fields, or manifest entries, compared with the real list.
- An exact text search for an import, a string, or a line of source.

### Duplicates stronger proof

A test at a stronger boundary already fails on the same regression. Examples:

- A check of a private helper's call shape when a public-boundary test covers the same behavior.
- A second test that sends the same kind of input through the same contract.
- A per-caller replay of a shared helper that the helper's own test covers.

### Keeps test-only code alive

The test is the only reason some production code exists. Examples:

- A test whose only job is to keep a test-only export, global, or wrapper in use.
- Production code whose only callers are tests.

### Promises more than it checks

The name, fixture, or mock claims a behavior that no assertion observes. Examples:

- A mock that implements the behavior the test asserts.
- A fixture that supplies the ordering, receipt, or callback that the code under test should produce.
- A test named for an effect, such as "clears the cache", that never asserts the effect.

## Retention bar

A test that looks like a junk class stays when it guards something no other test guards:

- A contract that outside code depends on: a public interface, protocol, configuration, data format, storage layout, migration, security rule, default value, or release artifact.
- Call order, when the order is observable behavior.
- A regression with a credible failure mode.
- Source inspection, when it is the cheapest independent guard. It fails when the contract changes, such as a user-facing key, byte, or path, and it survives a rename of internal identifiers.

A kept test that fails is a possible product bug. Reproduce the failure and repair the owner. Do not delete the test. A slow test or a static test is not a reason to delete it.

## Removal evidence

This record applies to a test on the base branch whose covered behavior remains after the change. Before you delete or weaken that test, record these fields:

1. The test name and location.
2. The failure that the test can detect.
3. The non-test callers of the code it covers.
4. The stronger owner-boundary proof that remains, or why no proof is necessary.
5. Why the test exists, with the commit or issue that added it.
6. The code that the removal lets you delete, or "none".
7. The risk, and the focused command that shows the removal is safe.

If a field is missing, keep the test. The record goes in the body of the commit that removes the test. When a plan step orders the removal, the step supplies the fields and the commit body carries them. A deleted test is exempt only when the same change deletes the behavior that it covers.

## Regression tests

A bug-fix regression test fails on the pre-fix code through its intended assertion, and it passes after the fix. If you never see it fail, it gives no evidence about the fix. Write one test at the owner boundary, the layer that owns the broken behavior. One test is enough, even when the bug crosses several layers. Record the Red run: the command you ran and the failing assertion it printed.

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

The value bar, authoring gate, junk patterns, retention bar, removal
evidence, and regression-test rule above come from OpenClaw's `test-audit` skill at
<https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/SKILL.md>.
The skill carries the MIT License, © 2026 OpenClaw Foundation. This file
restates the ideas in its own words.
