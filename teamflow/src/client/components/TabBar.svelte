<script lang="ts">
  import type { RunState } from "../../types.js";

  interface Props {
    sessions: Map<string, RunState>;
    activeSessionId: string | null;
    onSelect: (id: string) => void;
    onDismiss: (id: string) => void;
  }

  let { sessions, activeSessionId, onSelect, onDismiss }: Props = $props();

  /** Truncate a label to 40 characters, appending an ellipsis if needed */
  function truncate(text: string): string {
    return text.length > 40 ? text.slice(0, 40) + "…" : text;
  }
</script>

<div class="tab-bar">
  {#each [...sessions.entries()] as [sessionId, state]}
    {@const label = state.title ?? state.topic ?? sessionId}
    <div
      class="tab"
      class:active={sessionId === activeSessionId}
      class:completed={state.phase === "SHIPPED"}
      role="tab"
      tabindex="0"
      aria-selected={sessionId === activeSessionId}
      onclick={() => onSelect(sessionId)}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(sessionId); } }}
    >
      <span class="tab-label">{truncate(label)}</span>
      <span class="tab-phase">{state.phase ?? "..."}</span>
      {#if state.phase === "SHIPPED"}
        <button
          class="dismiss-btn"
          onclick={(e) => { e.stopPropagation(); onDismiss(sessionId); }}
          aria-label="Dismiss session"
        >&times;</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    gap: var(--space-xs, 0.25rem);
    overflow-x: auto;
    padding: 0 var(--space-sm, 0.5rem);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 0.25rem);
    padding: var(--space-xs, 0.25rem) var(--space-sm, 0.5rem);
    border: 1px solid var(--border-color, #30363d);
    border-bottom: 2px solid transparent;
    border-radius: 4px 4px 0 0;
    background: var(--bg-secondary, #161b22);
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .tab:hover {
    background: var(--bg-primary, #0d1117);
  }

  .active {
    border-bottom-color: var(--color-accent, #58a6ff);
    color: var(--text-primary, #c9d1d9);
    background: var(--bg-primary, #0d1117);
  }

  .completed {
    opacity: 0.7;
  }

  .tab-phase {
    font-size: 0.6875rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    background: var(--bg-tertiary, #21262d);
  }

  .dismiss-btn {
    margin-left: var(--space-xs, 0.25rem);
    background: none;
    border: none;
    color: var(--text-secondary, #8b949e);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0 0.2rem;
    line-height: 1;
  }

  .dismiss-btn:hover {
    color: var(--text-primary, #c9d1d9);
  }
</style>
