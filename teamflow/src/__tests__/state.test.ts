/**
 * Acceptance tests for Orchestrator Pipeline Visualization — State Engine.
 *
 * These tests verify that the state engine tracks gate/join status as events
 * flow through the pipeline. They import from the actual state.ts module and
 * assert against real RunState objects.
 *
 * Plan: docs/plans/2026-03-29-orchestrator-pipeline-visualization-plan.md
 * Tests: T1-T5 + critic issues C2, M1, M4
 */

import { describe, it, expect } from "vitest";
import { applyEvent } from "../state.js";
import type { RunState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Gate status shape expected after implementation */
interface GateStatus {
  type: "human" | "mechanical" | "aggregate" | "join";
  status: "pending" | "waiting" | "passed" | "failed";
  label: string;
  phase: string;
}

/** Build a minimal event record for applyEvent */
function makeEvent(
  seq: number,
  event: string,
  producer = "orchestrator",
  data: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    seq,
    event,
    producer,
    ts: new Date(Date.now() + seq * 1000).toISOString(),
    data,
  };
}

/**
 * Create a fresh RunState matching the current (pre-implementation) shape.
 * Does NOT include `gates` — the tests verify that `applyEvent` (or
 * `createEmptyState` called within the state engine) populates it.
 */
function createFreshState(): RunState {
  return {
    phase: null,
    topic: null,
    title: null,
    startedAt: null,
    agents: {},
    gates: {},
    events: [],
    errors: [],
    progress: { step: null, total: null },
    duration: null,
    lastSeq: 0,
  } as RunState;
}

/** Apply a sequence of events to a fresh state, returning the final state */
function applySequence(events: Array<{ event: string; producer?: string; data?: Record<string, unknown> }>): RunState {
  let state = createFreshState();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const record = makeEvent(i + 1, e.event, e.producer ?? "orchestrator", e.data ?? {});
    state = applyEvent(state, record);
  }
  return state;
}

/**
 * Safely extract a gate status value from state.gates.
 * Returns undefined if the gate key does not exist, avoiding TypeError
 * so the test fails with an assertion error instead of a runtime crash.
 */
function getGateStatus(state: RunState, key: string): string | undefined {
  const gates = (state as unknown as { gates?: Record<string, GateStatus> }).gates;
  if (!gates) return undefined;
  const gate = gates[key];
  if (!gate) return undefined;
  return gate.status;
}

/**
 * Safely extract a gate type value from state.gates.
 */
function getGateType(state: RunState, key: string): string | undefined {
  const gates = (state as unknown as { gates?: Record<string, GateStatus> }).gates;
  if (!gates) return undefined;
  const gate = gates[key];
  if (!gate) return undefined;
  return gate.type;
}

/**
 * Safely check whether a gate key exists in state.gates.
 */
function hasGate(state: RunState, key: string): boolean {
  const gates = (state as unknown as { gates?: Record<string, GateStatus> }).gates;
  if (!gates) return false;
  return key in gates;
}

// ---------------------------------------------------------------------------
// T1: gates_initialized_as_pending
// Verifies: createEmptyState() (via fresh applyEvent) produces gates with
// status "pending" for all 4 gate keys
// ---------------------------------------------------------------------------
describe("T1: gates_initialized_as_pending", () => {
  it("has a gates field on RunState after applying the first event", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
    ]);
    // The gates field should be added by the implementation in createEmptyState
    // or applyEvent. Currently state.ts does not have a gates field.
    const gates = (state as unknown as { gates?: unknown }).gates;
    expect(gates).toBeDefined();
    expect(typeof gates).toBe("object");
    expect(gates).not.toEqual({});
  });

  it("initializes plan-gate with status pending", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
    ]);
    expect(hasGate(state, "plan-gate")).toBe(true);
    expect(getGateStatus(state, "plan-gate")).toBe("pending");
  });

  it("initializes test-gate with status pending", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
    ]);
    expect(hasGate(state, "test-gate")).toBe(true);
    expect(getGateStatus(state, "test-gate")).toBe("pending");
  });

  it("initializes verify-gate with status pending", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
    ]);
    expect(hasGate(state, "verify-gate")).toBe(true);
    expect(getGateStatus(state, "verify-gate")).toBe("pending");
  });

  it("initializes research-join with status pending", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
    ]);
    expect(hasGate(state, "research-join")).toBe(true);
    expect(getGateStatus(state, "research-join")).toBe("pending");
  });

  it("all 4 gate keys have type information", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
    ]);
    expect(getGateType(state, "plan-gate")).toBe("human");
    expect(getGateType(state, "test-gate")).toBe("mechanical");
    expect(getGateType(state, "verify-gate")).toBe("aggregate");
    expect(getGateType(state, "research-join")).toBe("join");
  });
});

// ---------------------------------------------------------------------------
// T2: human_gate_transitions_to_waiting_after_plan_critiqued
// Verifies: After applying events up to plan.critiqued, plan-gate status is
// "waiting"
// ---------------------------------------------------------------------------
describe("T2: human_gate_transitions_to_waiting_after_plan_critiqued", () => {
  it("plan-gate is waiting after plan.critiqued event", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
      { event: "research.completed", producer: "researcher" },
      { event: "plan.drafted", producer: "planner" },
      { event: "plan.critiqued", producer: "plan-critic" },
    ]);
    expect(getGateStatus(state, "plan-gate")).toBe("waiting");
  });
});

// ---------------------------------------------------------------------------
// T3: human_gate_transitions_to_passed_after_plan_approved
// Verifies: After applying plan.approved, plan-gate status is "passed"
// ---------------------------------------------------------------------------
describe("T3: human_gate_transitions_to_passed_after_plan_approved", () => {
  it("plan-gate is passed after plan.approved event", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
      { event: "research.completed", producer: "researcher" },
      { event: "plan.drafted", producer: "planner" },
      { event: "plan.critiqued", producer: "plan-critic" },
      { event: "plan.approved", producer: "orchestrator" },
    ]);
    expect(getGateStatus(state, "plan-gate")).toBe("passed");
  });

  // Critic M1: plan revision loop — gate recovers to "passed" after revision cycle
  it("plan-gate is passed after revision loop: critiqued -> revision-requested -> critiqued -> approved", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
      { event: "research.completed", producer: "researcher" },
      { event: "plan.drafted", producer: "planner" },
      { event: "plan.critiqued", producer: "plan-critic" },
      { event: "plan.revision-requested", producer: "orchestrator" },
      { event: "plan.drafted", producer: "planner" },
      { event: "plan.critiqued", producer: "plan-critic" },
      { event: "plan.approved", producer: "orchestrator" },
    ]);
    expect(getGateStatus(state, "plan-gate")).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// T4: aggregate_gate_transitions_to_failed_after_typed_hard_gate_failure
// Verifies: After applying a typed hard-gate.*-failed event, verify-gate status is "failed"
// ---------------------------------------------------------------------------
describe("T4: aggregate_gate_transitions_to_failed_after_typed_hard_gate_failure", () => {
  it("verify-gate is failed after hard-gate.lint-failed event", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
      { event: "research.completed", producer: "researcher" },
      { event: "plan.drafted", producer: "planner" },
      { event: "plan.critiqued", producer: "plan-critic" },
      { event: "plan.approved", producer: "orchestrator" },
      { event: "tests.written", producer: "test-architect" },
      { event: "tests.confirmed-failing", producer: "orchestrator" },
      { event: "implementation.completed", producer: "implementer" },
      { event: "hard-gate.lint-failed", producer: "router", data: { command: "npm run lint", exitCode: 1, errors: "lint error", retryRound: 1, maxRetries: 5 } },
    ]);
    expect(getGateStatus(state, "verify-gate")).toBe("failed");
  });

  // Critic M4: typed hard-gate failure sets verify-gate to "failed" regardless of afterEvents
  it("verify-gate is failed even if not all afterEvents have fired", () => {
    // Only some review events have fired, but hard-gate.*-failed should
    // independently trigger "failed" status
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
      { event: "research.completed", producer: "researcher" },
      { event: "plan.drafted", producer: "planner" },
      { event: "plan.critiqued", producer: "plan-critic" },
      { event: "plan.approved", producer: "orchestrator" },
      { event: "tests.written", producer: "test-architect" },
      { event: "tests.confirmed-failing", producer: "orchestrator" },
      { event: "implementation.completed", producer: "implementer" },
      { event: "review.completed", producer: "code-reviewer" },
      // Not all review events have fired — but typed hard-gate failure fires anyway
      { event: "hard-gate.test-failed", producer: "router", data: { command: "npm test", exitCode: 1, failingTests: ["test1"], errors: "test failure", retryRound: 1, maxRetries: 5 } },
    ]);
    expect(getGateStatus(state, "verify-gate")).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// T5: join_transitions_to_passed_after_research_completed
// Verifies: After applying files.found then research.completed, research-join
// status is "passed"
// ---------------------------------------------------------------------------
describe("T5: join_transitions_to_passed_after_research_completed", () => {
  it("research-join is passed after files.found and research.completed", () => {
    const state = applySequence([
      { event: "feature.requested", producer: "orchestrator", data: { topic: "test" } },
      { event: "files.found", producer: "file-finder" },
      { event: "research.completed", producer: "researcher" },
    ]);
    expect(getGateStatus(state, "research-join")).toBe("passed");
  });
});
