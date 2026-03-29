<script lang="ts">
  import { tick } from "svelte";

  interface TimelineEntry {
    seq: number;
    event: string;
    producer: string;
    ts: string;
    data?: Record<string, unknown>;
  }

  interface Props {
    events: TimelineEntry[];
  }

  let { events }: Props = $props();

  let scrollContainer: HTMLDivElement | undefined = $state();

  // Auto-scroll to bottom when new events arrive
  $effect(() => {
    if (events.length && scrollContainer) {
      tick().then(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
    }
  });

  function formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString();
    } catch {
      return ts;
    }
  }

  function summarizeData(data?: Record<string, unknown>): string {
    if (!data) return "";
    const keys = Object.keys(data);
    if (keys.length === 0) return "";
    return keys.slice(0, 3).join(", ");
  }
</script>

<div class="timeline" bind:this={scrollContainer}>
  <h2 class="section-title">Timeline</h2>
  <div class="event-list">
    {#each events as entry}
      <div class="event-entry">
        <span class="event-time">{formatTime(entry.ts)}</span>
        <span class="event-name">{entry.event}</span>
        <span class="event-producer">{entry.producer}</span>
        {#if summarizeData(entry.data)}
          <span class="event-data">{summarizeData(entry.data)}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .timeline {
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

  .event-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .event-entry {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm, 0.5rem);
    padding: 4px 0;
    font-size: 0.8125rem;
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .event-entry:last-child {
    border-bottom: none;
  }

  .event-time {
    font-size: 0.6875rem;
    opacity: 0.5;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .event-name {
    font-weight: 500;
    color: var(--color-accent, #58a6ff);
  }

  .event-producer {
    font-size: 0.6875rem;
    opacity: 0.6;
  }

  .event-data {
    font-size: 0.6875rem;
    opacity: 0.4;
    margin-left: auto;
  }
</style>
