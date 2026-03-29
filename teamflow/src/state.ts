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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load registry for agent-to-event mapping
interface RegistryAgent {
  name: string;
  consumes: string | string[];
  produces: string;
  parallel?: boolean;
}

interface Registry {
  agents: RegistryAgent[];
}

let registry: Registry;
try {
  const registryPath = join(__dirname, "..", "..", "skills", "team", "registry.json");
  registry = JSON.parse(readFileSync(registryPath, "utf-8"));
} catch {
  registry = { agents: [] };
}

// Build lookup maps from registry
const agentByProducedEvent = new Map<string, string>();
const agentConsumedEvents = new Map<string, string[]>();

for (const agent of registry.agents) {
  agentByProducedEvent.set(agent.produces, agent.name);
  const consumed = Array.isArray(agent.consumes) ? agent.consumes : [agent.consumes];
  agentConsumedEvents.set(agent.name, consumed);
}

export interface AgentStatus {
  name: string;
  status: "idle" | "running" | "done" | "error";
  producedEvent?: string;
}

export interface TimelineEntry {
  seq: number;
  event: string;
  producer: string;
  ts: string;
  data?: Record<string, unknown>;
}

export interface RunState {
  phase: string | null;
  topic: string | null;
  startedAt: string | null;
  agents: Record<string, AgentStatus>;
  events: TimelineEntry[];
  errors: Array<{ event: string; data: Record<string, unknown> }>;
  progress: { step: string | null; total: number | null };
  duration: number | null;
  lastSeq: number;
}

function createEmptyState(): RunState {
  const agents: Record<string, AgentStatus> = {};
  for (const agent of registry.agents) {
    agents[agent.name] = { name: agent.name, status: "idle" };
  }
  return {
    phase: null,
    topic: null,
    startedAt: null,
    agents,
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

  // Extract topic and startedAt
  if (eventName === "feature.requested") {
    newState.topic = (data.topic as string) ?? null;
    newState.startedAt = ts ?? null;
  }

  // Track errors from hard-gate.failed
  if (eventName === "hard-gate.failed") {
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
