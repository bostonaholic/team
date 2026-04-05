/**
 * In-memory state engine for the Teamflow dashboard.
 *
 * Imports EVENT_TO_PHASE from the shared library (critic issue M1: only imports
 * the phase map, not deriveState -- the dashboard needs richer state).
 *
 * Uses skills/team/registry.json to map events to agents for status tracking
 * (critic issue M2).
 */

// @ts-ignore -- allowJs in tsconfig handles this
import { EVENT_TO_PHASE } from "../../lib/events.mjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentStatus, GateStatus, TimelineEntry, RunState } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load registry for agent-to-event mapping
interface RegistryAgent {
  name: string;
  consumes: string | string[];
  produces: string;
  parallel?: boolean;
}

interface RegistryGate {
  after: string | string[];
  type: "human" | "mechanical" | "aggregate" | "interview";
  passEvent: string;
  failEvent?: string;
  failEvents?: Record<string, string | Record<string, string>>;
  condition?: string;
  hardGates?: string[];
  maxRetries?: number;
  threshold?: number;
}

interface RegistryJoin {
  wait: string[];
  with: string;
  produces: string;
  artifact?: string;
}

interface Registry {
  agents: RegistryAgent[];
  gates: RegistryGate[];
  joins: RegistryJoin[];
}

let registry: Registry;
try {
  const registryPath = join(__dirname, "..", "..", "skills", "team", "registry.json");
  registry = JSON.parse(readFileSync(registryPath, "utf-8"));
} catch {
  registry = { agents: [], gates: [], joins: [] };
}

// Build lookup maps from registry
const agentByProducedEvent = new Map<string, string>();
const agentConsumedEvents = new Map<string, string[]>();

for (const agent of registry.agents) {
  agentByProducedEvent.set(agent.produces, agent.name);
  const consumed = Array.isArray(agent.consumes) ? agent.consumes : [agent.consumes];
  agentConsumedEvents.set(agent.name, consumed);
}

// Gate config: maps gate keys to their registry config for status derivation.
// Derived once at module load from registry.gates and registry.joins.
interface GateConfig {
  key: string;
  type: "human" | "mechanical" | "aggregate" | "interview" | "join";
  label: string;
  phase: string;
  afterEvents: string[];
  passEvent: string;
  failEvent?: string;
  isFailEvent?: (event: string) => boolean;
}

// Phase ordering for deriving which phase a gate lives in.
// A gate's passEvent transitions to the NEXT phase; the gate itself lives in the PRIOR phase.
const PHASE_ORDER = ["RESEARCH", "PLAN", "TEST-FIRST", "IMPLEMENT", "VERIFY", "SHIP", "SHIPPED"];

function getPriorPhase(nextPhase: string): string {
  const idx = PHASE_ORDER.indexOf(nextPhase);
  return idx > 0 ? PHASE_ORDER[idx - 1] : nextPhase;
}

// Gate label derivation from gate type
const GATE_TYPE_LABELS: Record<string, string> = {
  interview: "Validate requirements",
  human: "Approve plan",
  mechanical: "Confirm tests fail",
  aggregate: "Collect reviews",
};

const gateConfigs: GateConfig[] = [];

for (const gate of registry.gates) {
  const afterEvents = Array.isArray(gate.after) ? gate.after : [gate.after];

  // Derive phase: the passEvent transitions to the next phase; the gate lives one phase prior
  const nextPhase = (EVENT_TO_PHASE as Record<string, string>)[gate.passEvent];
  const phase = nextPhase ? getPriorPhase(nextPhase) : "UNKNOWN";

  // Derive gate key from phase (e.g. "PLAN" → "plan-gate", "TEST-FIRST" → "test-gate")
  const key = phase.toLowerCase().split("-")[0] + "-gate";

  const label = GATE_TYPE_LABELS[gate.type] ?? gate.passEvent;

  // For aggregate gates with typed failEvents, use pattern matching
  const isFailEvent = gate.failEvents
    ? (ev: string) => ev.startsWith("hard-gate.") && ev.endsWith("-failed")
    : gate.failEvent
      ? (ev: string) => ev === gate.failEvent
      : undefined;

  gateConfigs.push({
    key,
    type: gate.type,
    label,
    phase,
    afterEvents,
    passEvent: gate.passEvent,
    failEvent: gate.failEvent,
    isFailEvent,
  });
}

for (const j of registry.joins) {
  // Derive key from produces field (e.g. "research.completed" → "research-join")
  // so adding more joins to the registry doesn't cause key collisions.
  const joinKey = j.produces.split(".")[0] + "-join";
  gateConfigs.push({
    key: joinKey,
    type: "join",
    label: "Merge results",
    phase: (EVENT_TO_PHASE as Record<string, string>)[j.produces]
      ? getPriorPhase((EVENT_TO_PHASE as Record<string, string>)[j.produces])
      : "UNKNOWN",
    afterEvents: j.wait,
    passEvent: j.produces,
  });
}

// Re-export shared types so existing imports from state.ts continue to work
export type { AgentStatus, GateStatus, TimelineEntry, RunState } from "./types.js";

function createEmptyState(): RunState {
  const agents: Record<string, AgentStatus> = {};
  for (const agent of registry.agents) {
    agents[agent.name] = { name: agent.name, status: "idle" };
  }
  const gates: Record<string, GateStatus> = {};
  for (const gc of gateConfigs) {
    gates[gc.key] = { type: gc.type, status: "pending", label: gc.label, phase: gc.phase };
  }
  return {
    phase: null,
    topic: null,
    title: null,
    startedAt: null,
    agents,
    gates,
    events: [],
    errors: [],
    progress: { step: null, total: null },
    duration: null,
    lastSeq: 0,
  };
}

// Set of all produced events in the current state (for agent status tracking)
function getProducedEvents(state: RunState): Set<string> {
  const produced = new Set<string>();
  for (const entry of state.events) {
    produced.add(entry.event);
  }
  return produced;
}

export function applyEvent(state: RunState, event: Record<string, unknown>): RunState {
  const newState = { ...state };
  const eventName = event.event as string;
  const producer = event.producer as string;
  const ts = event.ts as string;
  const seq = event.seq as number;
  const data = (event.data || {}) as Record<string, unknown>;

  // Add to timeline
  newState.events = [...state.events, { seq, event: eventName, producer, ts, data }];
  newState.lastSeq = seq;

  // Phase transition
  const phase = (EVENT_TO_PHASE as Record<string, string>)[eventName];
  if (phase !== undefined) {
    newState.phase = phase;
  }

  // Extract topic, title, and startedAt
  if (eventName === "feature.requested") {
    newState.topic = (data.topic as string) ?? null;
    newState.title = (data.description as string) || null;
    newState.startedAt = ts ?? null;
  }

  // Track errors from typed hard-gate failures
  if (eventName.startsWith("hard-gate.") && eventName.endsWith("-failed")) {
    newState.errors = [...state.errors, { event: eventName, data }];
  }

  // Track step progress (critic issue C1: use `step` not `stepId`)
  if (eventName === "step.completed") {
    newState.progress = {
      step: (data.step as string) ?? null,
      total: (data.totalTests as number) ?? null,
    };
  }

  // Compute duration from first to latest timestamp
  if (newState.startedAt && ts) {
    const start = new Date(newState.startedAt).getTime();
    const latest = new Date(ts).getTime();
    newState.duration = latest - start;
  }

  // Agent status tracking (critic issue M2)
  // When a produced event appears, mark the producing agent as done
  newState.agents = { ...state.agents };
  const producerAgent = agentByProducedEvent.get(eventName);
  if (producerAgent && newState.agents[producerAgent]) {
    newState.agents[producerAgent] = {
      ...newState.agents[producerAgent],
      status: "done",
      producedEvent: eventName,
    };
  }

  // When a consumed event appears, mark agents that consume it as running
  // (unless they are already done)
  const producedEvents = getProducedEvents(newState);
  for (const [agentName, consumed] of agentConsumedEvents.entries()) {
    if (consumed.includes(eventName) && newState.agents[agentName]) {
      const agent = newState.agents[agentName];
      // Only mark as running if agent hasn't already produced its output
      const agentEntry = registry.agents.find((a) => a.name === agentName);
      if (agentEntry && !producedEvents.has(agentEntry.produces) && agent.status === "idle") {
        newState.agents[agentName] = { ...agent, status: "running" };
      }
    }
  }

  // Gate status derivation
  // Scan events in reverse chronological order (critic M1: latest event wins)
  // to handle revision loops where passEvent appears after failEvent.
  const prevGates = state.gates ?? {};
  newState.gates = { ...prevGates };
  for (const gc of gateConfigs) {
    const prev = prevGates[gc.key] ?? { type: gc.type, status: "pending" as const, label: gc.label, phase: gc.phase };

    // Check events from newest to oldest for pass/fail (M1: reverse order)
    let hasPass = false;
    let hasFail = false;
    let passIdx = -1;
    let failIdx = -1;

    for (let i = newState.events.length - 1; i >= 0; i--) {
      const ev = newState.events[i].event;
      if (!hasPass && ev === gc.passEvent) {
        hasPass = true;
        passIdx = i;
      }
      if (!hasFail && gc.isFailEvent && gc.isFailEvent(ev)) {
        hasFail = true;
        failIdx = i;
      }
      if (hasPass && hasFail) break;
    }

    let status: GateStatus["status"];

    if (hasPass && hasFail) {
      // M1: whichever appeared later in timeline wins
      status = passIdx > failIdx ? "passed" : "failed";
    } else if (hasPass) {
      status = "passed";
    } else if (hasFail) {
      // M4: failEvent independently triggers "failed" regardless of afterEvents
      status = "failed";
    } else {
      // Check if all afterEvents have fired -> "waiting"
      const allAfterFired = gc.afterEvents.every((ae) => producedEvents.has(ae));
      status = allAfterFired ? "waiting" : "pending";
    }

    newState.gates[gc.key] = { ...prev, status };
  }

  return newState;
}

export function createStateEngine() {
  let state = createEmptyState();

  return {
    apply(events: Array<Record<string, unknown>>): void {
      for (const event of events) {
        const seq = event.seq as number;
        if (seq <= state.lastSeq) continue; // skip already-applied events
        state = applyEvent(state, event);
      }
    },
    getSnapshot(): RunState {
      return state;
    },
  };
}
