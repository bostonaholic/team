/**
 * Acceptance tests for the QRSPI state engine.
 *
 * These tests verify that the Teamflow state engine tracks gate/join status
 * as events flow through the QRSPI pipeline. Gate keys are derived from each
 * gate's passEvent prefix (e.g. design.approved → "design-gate") so multiple
 * gates in the same phase do not collide.
 */

import { describe, it, expect } from "vitest";
import { applyEvent } from "../state.js";
import type { RunState } from "../state.js";

interface GateStatus {
  type: "human" | "mechanical" | "aggregate" | "join" | "router-emit";
  status: "pending" | "waiting" | "passed" | "failed";
  label: string;
  phase: string;
}

function makeEvent(
  seq: number,
  event: string,
  producer = "router",
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

function applySequence(events: Array<{ event: string; producer?: string; data?: Record<string, unknown> }>): RunState {
  let state = createFreshState();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const record = makeEvent(i + 1, e.event, e.producer ?? "router", e.data ?? {});
    state = applyEvent(state, record);
  }
  return state;
}

function getGateStatus(state: RunState, key: string): string | undefined {
  const gates = (state as unknown as { gates?: Record<string, GateStatus> }).gates;
  return gates?.[key]?.status;
}

function getGateType(state: RunState, key: string): string | undefined {
  const gates = (state as unknown as { gates?: Record<string, GateStatus> }).gates;
  return gates?.[key]?.type;
}

function hasGate(state: RunState, key: string): boolean {
  const gates = (state as unknown as { gates?: Record<string, GateStatus> }).gates;
  return gates ? key in gates : false;
}

// ---------------------------------------------------------------------------
// T1: gates_initialized_as_pending
// All QRSPI gate keys exist on the state and start at "pending".
// ---------------------------------------------------------------------------
describe("T1: gates_initialized_as_pending", () => {
  const state = applySequence([
    { event: "feature.requested", data: { topic: "test" } },
  ]);

  it("design-gate is pending and human", () => {
    expect(hasGate(state, "design-gate")).toBe(true);
    expect(getGateStatus(state, "design-gate")).toBe("pending");
    expect(getGateType(state, "design-gate")).toBe("human");
  });

  it("structure-gate is pending and human", () => {
    expect(hasGate(state, "structure-gate")).toBe(true);
    expect(getGateStatus(state, "structure-gate")).toBe("pending");
    expect(getGateType(state, "structure-gate")).toBe("human");
  });

  it("worktree-gate is pending and router-emit", () => {
    expect(hasGate(state, "worktree-gate")).toBe(true);
    expect(getGateStatus(state, "worktree-gate")).toBe("pending");
    expect(getGateType(state, "worktree-gate")).toBe("router-emit");
  });

  it("tests-gate is pending and mechanical", () => {
    expect(hasGate(state, "tests-gate")).toBe(true);
    expect(getGateStatus(state, "tests-gate")).toBe("pending");
    expect(getGateType(state, "tests-gate")).toBe("mechanical");
  });

  it("verification-gate is pending and aggregate", () => {
    expect(hasGate(state, "verification-gate")).toBe(true);
    expect(getGateStatus(state, "verification-gate")).toBe("pending");
    expect(getGateType(state, "verification-gate")).toBe("aggregate");
  });

  it("research-join is pending and join", () => {
    expect(hasGate(state, "research-join")).toBe(true);
    expect(getGateStatus(state, "research-join")).toBe("pending");
    expect(getGateType(state, "research-join")).toBe("join");
  });
});

// ---------------------------------------------------------------------------
// T2: design_gate_transitions_to_waiting_after_design_drafted
// ---------------------------------------------------------------------------
describe("T2: design_gate_transitions_to_waiting_after_design_drafted", () => {
  it("design-gate is waiting after design.drafted event", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
    ]);
    expect(getGateStatus(state, "design-gate")).toBe("waiting");
  });
});

// ---------------------------------------------------------------------------
// T3: design_gate_transitions_to_passed_after_approval
// ---------------------------------------------------------------------------
describe("T3: design_gate_transitions_to_passed_after_approval", () => {
  it("design-gate is passed after design.approved event", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.approved", producer: "router" },
    ]);
    expect(getGateStatus(state, "design-gate")).toBe("passed");
  });

  it("design-gate is passed after revision loop: drafted → revision → drafted → approved", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.revision-requested", producer: "router" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.approved", producer: "router" },
    ]);
    expect(getGateStatus(state, "design-gate")).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// T4: aggregate_gate_transitions_to_failed_after_typed_hard_gate_failure
// ---------------------------------------------------------------------------
describe("T4: aggregate_gate_transitions_to_failed_after_typed_hard_gate_failure", () => {
  it("verification-gate is failed after hard-gate.lint-failed event", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.approved", producer: "router" },
      { event: "structure.drafted", producer: "structure-planner" },
      { event: "structure.approved", producer: "router" },
      { event: "plan.drafted", producer: "planner" },
      { event: "worktree.prepared", producer: "router" },
      { event: "tests.written", producer: "test-architect" },
      { event: "tests.confirmed-failing", producer: "router" },
      { event: "implementation.completed", producer: "implementer" },
      { event: "hard-gate.lint-failed", producer: "router", data: { command: "npm run lint", exitCode: 1, errors: "lint error", retryRound: 1, maxRetries: 5 } },
    ]);
    expect(getGateStatus(state, "verification-gate")).toBe("failed");
  });

  it("verification-gate is failed even if not all afterEvents have fired", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.approved", producer: "router" },
      { event: "structure.drafted", producer: "structure-planner" },
      { event: "structure.approved", producer: "router" },
      { event: "plan.drafted", producer: "planner" },
      { event: "worktree.prepared", producer: "router" },
      { event: "tests.written", producer: "test-architect" },
      { event: "tests.confirmed-failing", producer: "router" },
      { event: "implementation.completed", producer: "implementer" },
      { event: "review.completed", producer: "code-reviewer" },
      { event: "hard-gate.test-failed", producer: "router", data: { command: "npm test", exitCode: 1, failingTests: ["test1"], errors: "test failure", retryRound: 1, maxRetries: 5 } },
    ]);
    expect(getGateStatus(state, "verification-gate")).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// T5: research_join_transitions_to_passed_after_research_completed
// ---------------------------------------------------------------------------
describe("T5: research_join_transitions_to_passed_after_research_completed", () => {
  it("research-join is passed after files.found and research.completed", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "files.found", producer: "file-finder" },
      { event: "research.completed", producer: "researcher" },
    ]);
    expect(getGateStatus(state, "research-join")).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// T6: structure_gate_transitions_through_human_loop
// ---------------------------------------------------------------------------
describe("T6: structure_gate_transitions_through_human_loop", () => {
  it("structure-gate is waiting after structure.drafted", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.approved", producer: "router" },
      { event: "structure.drafted", producer: "structure-planner" },
    ]);
    expect(getGateStatus(state, "structure-gate")).toBe("waiting");
  });

  it("structure-gate is passed after structure.approved", () => {
    const state = applySequence([
      { event: "feature.requested", data: { topic: "test" } },
      { event: "task.captured", producer: "questioner" },
      { event: "research.completed", producer: "researcher" },
      { event: "design.drafted", producer: "design-author" },
      { event: "design.approved", producer: "router" },
      { event: "structure.drafted", producer: "structure-planner" },
      { event: "structure.approved", producer: "router" },
    ]);
    expect(getGateStatus(state, "structure-gate")).toBe("passed");
  });
});
