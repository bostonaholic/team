/**
 * Shared types for the Teamflow dashboard.
 *
 * Imported by state.ts (server), App.svelte, and PhaseCards.svelte (client).
 * Single source of truth — no type duplication across files.
 */

export interface AgentStatus {
  name: string;
  status: "idle" | "running" | "done" | "error";
  producedEvent?: string;
}

export interface GateStatus {
  type: "human" | "mechanical" | "aggregate" | "interview" | "join" | "router-emit";
  status: "pending" | "waiting" | "passed" | "failed";
  label: string;
  phase: string;
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
  title: string | null;
  startedAt: string | null;
  agents: Record<string, AgentStatus>;
  gates: Record<string, GateStatus>;
  events: TimelineEntry[];
  errors: Array<{ event: string; data: Record<string, unknown> }>;
  progress: { step: string | null; total: number | null };
  duration: number | null;
  lastSeq: number;
}
