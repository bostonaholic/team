<script lang="ts">
  interface AgentStatus {
    name: string;
    status: "idle" | "running" | "done" | "error";
    producedEvent?: string;
  }

  interface Props {
    agents: Record<string, AgentStatus>;
  }

  let { agents }: Props = $props();

  function statusColor(status: string): string {
    switch (status) {
      case "running": return "var(--color-accent, #58a6ff)";
      case "done": return "var(--color-success, #3fb950)";
      case "error": return "var(--color-danger, #f85149)";
      default: return "var(--border-color, #30363d)";
    }
  }
</script>

<div class="agent-list">
  <h2 class="section-title">Agents</h2>
  {#each Object.values(agents) as agent}
    <div class="agent-row">
      <div class="status-dot" style="background: {statusColor(agent.status)}"></div>
      <div class="agent-info">
        <span class="agent-name">{agent.name}</span>
        {#if agent.producedEvent}
          <span class="agent-event">{agent.producedEvent}</span>
        {/if}
      </div>
      <span class="agent-status">{agent.status}</span>
    </div>
  {/each}
</div>

<style>
  .agent-list {
    overflow-y: auto;
    padding: var(--space-sm, 0.5rem);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 8px;
    background: var(--bg-secondary, #161b22);
  }

  .section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.6;
    margin: 0 0 var(--space-sm, 0.5rem) 0;
    padding-bottom: var(--space-sm, 0.5rem);
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .agent-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 0.5rem);
    padding: 4px 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .agent-info {
    flex: 1;
    min-width: 0;
  }

  .agent-name {
    font-size: 0.8125rem;
    display: block;
  }

  .agent-event {
    font-size: 0.6875rem;
    opacity: 0.5;
    display: block;
  }

  .agent-status {
    font-size: 0.6875rem;
    text-transform: uppercase;
    opacity: 0.6;
  }
</style>
