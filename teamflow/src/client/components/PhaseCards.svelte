<script lang="ts">
  import type { AgentStatus, GateStatus, TimelineEntry } from "../../types.js";

  interface Props {
    phase: string | null;
    agents: Record<string, AgentStatus>;
    gates: Record<string, GateStatus>;
    events: TimelineEntry[];
    now: number;
  }

  let { phase, agents, gates, events, now }: Props = $props();

  const pipeline: Array<{ name: string; agents: string[]; gate?: string }> = [
    { name: "QUESTION", agents: ["questioner"] },
    { name: "RESEARCH", agents: ["file-finder", "researcher"], gate: "research-join" },
    { name: "DESIGN", agents: ["design-author"], gate: "design-gate" },
    { name: "STRUCTURE", agents: ["structure-planner"], gate: "structure-gate" },
    { name: "PLAN", agents: ["planner"] },
    { name: "WORKTREE", agents: ["router"], gate: "worktree-gate" },
    { name: "IMPLEMENT", agents: ["test-architect", "implementer", "code-reviewer", "security-reviewer", "technical-writer", "ux-reviewer", "verifier"], gate: "verification-gate" },
    { name: "PR", agents: ["router"], gate: "feature-gate" },
  ];

  const gateCount = pipeline.length - 1;

  const phaseNames = pipeline.map((p) => p.name);

  const EVENT_TO_PHASE: Record<string, string> = {
    "feature.requested": "QUESTION",
    "bug.reported": "QUESTION",
    "task.captured": "RESEARCH",
    "files.found": "RESEARCH",
    "research.completed": "DESIGN",
    "design.drafted": "DESIGN",
    "design.approved": "STRUCTURE",
    "design.revision-requested": "DESIGN",
    "structure.drafted": "STRUCTURE",
    "structure.approved": "PLAN",
    "structure.revision-requested": "STRUCTURE",
    "plan.drafted": "WORKTREE",
    "worktree.prepared": "IMPLEMENT",
    "tests.written": "IMPLEMENT",
    "tests.confirmed-failing": "IMPLEMENT",
    "slice.completed": "IMPLEMENT",
    "implementation.completed": "IMPLEMENT",
    "review.completed": "IMPLEMENT",
    "security-review.completed": "IMPLEMENT",
    "docs-review.completed": "IMPLEMENT",
    "ux-review.completed": "IMPLEMENT",
    "verification.completed": "IMPLEMENT",
    "hard-gate.security-failed": "IMPLEMENT",
    "hard-gate.lint-failed": "IMPLEMENT",
    "hard-gate.typecheck-failed": "IMPLEMENT",
    "hard-gate.build-failed": "IMPLEMENT",
    "hard-gate.test-failed": "IMPLEMENT",
    "hard-gate.review-failed": "IMPLEMENT",
    "verification.passed": "PR",
    "feature.shipped": "SHIPPED",
  };

  function phaseStatus(p: string): "completed" | "active" | "pending" {
    if (!phase) return "pending";
    if (phase === "SHIPPED") return "completed";
    const currentIdx = phaseNames.indexOf(phase);
    const pIdx = phaseNames.indexOf(p);
    if (pIdx < currentIdx) return "completed";
    if (pIdx === currentIdx) return "active";
    return "pending";
  }

  function phaseDuration(phaseName: string): string {
    let enterTs: string | null = null;
    let exitTs: string | null = null;

    for (const ev of events) {
      const evPhase = EVENT_TO_PHASE[ev.event];
      if (evPhase === phaseName && !enterTs) {
        enterTs = ev.ts;
      }
      if (enterTs && !exitTs && evPhase) {
        const pIdx = phaseNames.indexOf(phaseName);
        const evIdx = phaseNames.indexOf(evPhase);
        if (evIdx > pIdx) {
          exitTs = ev.ts;
          break;
        }
      }
    }

    if (!enterTs) return "";

    const start = new Date(enterTs).getTime();
    const end = exitTs ? new Date(exitTs).getTime() : now;
    const ms = end - start;

    if (ms < 1000) return "<1s";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function agentStatus(name: string, phaseName: string): "idle" | "running" | "done" | "error" {
    if (agents[name]) return agents[name].status;
    // Agent not in registry — derive from phase status
    const ps = phaseStatus(phaseName);
    if (ps === "completed") return "done";
    if (ps === "active") return "running";
    return "idle";
  }

  function gateTypeLabel(type: GateStatus["type"]): string {
    switch (type) {
      case "human": return "Human Gate";
      case "mechanical": return "Mechanical Gate";
      case "aggregate": return "Aggregate Gate";
      case "join": return "Join";
      case "router-emit": return "Router Action";
    }
  }

  // Returns the gate status for the connector arrow leaving a phase.
  // IMPLEMENT has no gate (it is purely agent work), so its arrow to VERIFY
  // stays at the default dimmed style — this is intentional.
  function connectorStatus(phaseName: string): string {
    const entry = pipeline.find((p) => p.name === phaseName);
    if (!entry?.gate || !gates[entry.gate]) return "";
    return gates[entry.gate].status;
  }
</script>

<div class="phase-cards">
  {#each pipeline as p, i}
    <div class="phase-card {phaseStatus(p.name)}">
      <div class="card-header">
        <span class="phase-name">{p.name}</span>
        <span class="status-badge {phaseStatus(p.name)}">{phaseStatus(p.name).toUpperCase()}</span>
      </div>
      {#if phaseDuration(p.name)}
        <div class="phase-duration">{phaseDuration(p.name)}</div>
      {/if}
      {#if p.agents.length > 0}
        <div class="agent-list">
          {#each p.agents as agentName}
            <div class="agent-row">
              <span class="agent-icon {agentStatus(agentName, p.name)}">
                {#if agentStatus(agentName, p.name) === "done"}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect width="16" height="16" rx="3" fill="var(--color-success)"/>
                    <path d="M4.5 8L7 10.5L11.5 5.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else if agentStatus(agentName, p.name) === "running"}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect width="16" height="16" rx="3" fill="var(--color-accent)"/>
                    <circle cx="8" cy="8" r="3" fill="white"/>
                  </svg>
                {:else if agentStatus(agentName, p.name) === "error"}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect width="16" height="16" rx="3" fill="var(--color-danger)"/>
                    <path d="M5 5L11 11M11 5L5 11" stroke="white" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" stroke="var(--border-color)"/>
                  </svg>
                {/if}
              </span>
              <span class="agent-name">{agentName}</span>
            </div>
          {/each}
        </div>
      {/if}
      {#if p.gate && gates[p.gate]}
        <div class="gate-row">
          <span class="gate-icon {gates[p.gate].status}">
            {#if gates[p.gate].status === "passed"}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect width="16" height="16" rx="3" fill="var(--color-success)"/>
                <path d="M4.5 8L7 10.5L11.5 5.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else if gates[p.gate].status === "waiting"}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect width="16" height="16" rx="3" fill="var(--color-accent)"/>
                <circle cx="8" cy="8" r="3" fill="white"/>
              </svg>
            {:else if gates[p.gate].status === "failed"}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect width="16" height="16" rx="3" fill="var(--color-danger)"/>
                <path d="M5 5L11 11M11 5L5 11" stroke="white" stroke-width="2" stroke-linecap="round"/>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="0.5" y="0.5" width="15" height="15" rx="2.5" stroke="var(--border-color)"/>
              </svg>
            {/if}
          </span>
          <span class="gate-label">{gateTypeLabel(gates[p.gate].type)}</span>
        </div>
      {/if}
    </div>

    {#if i < gateCount}
      <div class="gate">
        <span class="gate-arrow {connectorStatus(p.name)}">&rarr;</span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .phase-cards {
    display: flex;
    align-items: stretch;
    gap: 0;
    padding: var(--space-sm) var(--space-md);
    overflow-x: auto;
  }

  .phase-card {
    flex: 1 1 0;
    min-width: 140px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    transition: border-color var(--duration-normal) var(--ease-in-out),
                opacity var(--duration-normal) var(--ease-in-out),
                box-shadow var(--duration-normal) var(--ease-in-out);
  }

  .phase-card.completed {
    border-color: color-mix(in srgb, var(--color-success) 30%, var(--border-color));
  }

  .phase-card.active {
    border-color: var(--color-success);
    box-shadow: inset 0 0 0 1px var(--color-success);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { box-shadow: inset 0 0 0 1px var(--color-success); }
    50% { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-success) 40%, transparent); }
  }

  .phase-card.pending {
    opacity: 0.5;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: 2px;
  }

  .phase-name {
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .status-badge {
    font-size: 0.5625rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    white-space: nowrap;
    transition: background var(--duration-normal) var(--ease-in-out),
                border-color var(--duration-normal) var(--ease-in-out),
                color var(--duration-normal) var(--ease-in-out);
  }

  .status-badge.completed {
    border-color: var(--color-success);
    color: var(--color-success);
  }

  .status-badge.active {
    background: var(--color-success);
    border-color: var(--color-success);
    color: var(--bg-primary);
  }

  .phase-duration {
    font-size: 0.6875rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
  }

  .agent-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .agent-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .agent-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    line-height: 0;
    transition: opacity var(--duration-fast) var(--ease-out),
                transform var(--duration-fast) var(--ease-out);
  }

  .agent-icon.running {
    transform: scale(1.15);
    animation: agent-pulse 1.5s ease-in-out infinite;
  }

  @keyframes agent-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .agent-icon.done {
    transform: scale(1);
    opacity: 1;
  }

  .agent-icon.idle {
    opacity: 0.5;
  }

  .agent-icon.error {
    opacity: 1;
  }

  .agent-name {
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .phase-card.pending .agent-name {
    color: var(--text-secondary);
  }

  /* Gate connectors — vertically centered */
  .gate {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    flex-shrink: 0;
  }

  .gate-arrow {
    font-size: 1.125rem;
    color: var(--text-secondary);
    opacity: 0.5;
    transition: color var(--duration-normal) var(--ease-in-out),
                opacity var(--duration-normal) var(--ease-in-out);
  }

  .gate-arrow.passed {
    color: var(--color-success);
    opacity: 1;
  }

  .gate-arrow.waiting {
    color: var(--color-accent);
    opacity: 1;
    animation: agent-pulse 1.5s ease-in-out infinite;
  }

  .gate-arrow.failed {
    color: var(--color-danger);
    opacity: 1;
  }

  .gate-row {
    display: flex;
    align-items: center;
    gap: 6px;
    border-top: 1px solid var(--border-color);
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
  }

  .gate-label {
    font-size: 0.6875rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .gate-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    line-height: 0;
    transition: opacity var(--duration-fast) var(--ease-out),
                transform var(--duration-fast) var(--ease-out);
  }

  .gate-icon.waiting {
    animation: agent-pulse 1.5s ease-in-out infinite;
  }

  .gate-icon.passed {
    color: var(--color-success);
  }

  .gate-icon.failed {
    color: var(--color-danger);
  }
</style>
