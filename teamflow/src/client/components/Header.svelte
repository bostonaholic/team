<script lang="ts">
  interface Props {
    topic: string | null;
    phase: string | null;
    duration: number | null;
    theme: "dark" | "light" | "system";
    onToggleTheme: () => void;
  }

  let { topic, phase, duration, theme, onToggleTheme }: Props = $props();

  function formatDuration(ms: number | null): string {
    if (ms === null) return "--";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

</script>

<header class="header">
  <div class="header-left">
    <h1 class="title">Teamflow{#if topic}<span class="separator">/</span><span class="topic">{topic}</span>{/if}</h1>
  </div>
  <div class="header-right">
    {#if phase}
      <span class="phase-badge">{phase}</span>
    {/if}
    <span class="duration">{formatDuration(duration)}</span>
    <button class="theme-toggle" onclick={onToggleTheme} title="Toggle theme ({theme})">
      {#if theme === "light"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      {:else if theme === "dark"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><clipPath id="half-left"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9" fill="currentColor" clip-path="url(#half-left)"/></svg>
      {/if}
    </button>
  </div>
</header>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-md, 1rem);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md, 1rem);
  }

  .title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0;
  }

  .separator {
    opacity: 0.3;
    font-weight: 400;
    margin: 0 0.25rem;
  }

  .topic {
    font-weight: 500;
    opacity: 0.85;
  }

  .phase-badge {
    background: var(--color-accent, #58a6ff);
    color: var(--bg-primary, #0d1117);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .duration {
    font-size: 0.875rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .theme-toggle {
    background: none;
    border: 1px solid var(--border-color, #30363d);
    color: var(--text-primary, #c9d1d9);
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s;
  }

  .theme-toggle:hover {
    border-color: var(--text-primary, #c9d1d9);
  }
</style>
