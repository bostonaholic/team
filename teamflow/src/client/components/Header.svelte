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

  function themeIcon(t: "dark" | "light" | "system"): string {
    if (t === "dark") return "moon";
    if (t === "light") return "sun";
    return "auto";
  }
</script>

<header class="header">
  <div class="header-left">
    <h1 class="title">Teamflow</h1>
    {#if topic}
      <span class="topic">{topic}</span>
    {/if}
  </div>
  <div class="header-right">
    {#if phase}
      <span class="phase-badge">{phase}</span>
    {/if}
    <span class="duration">{formatDuration(duration)}</span>
    <button class="theme-toggle" onclick={onToggleTheme} title="Toggle theme ({theme})">
      {themeIcon(theme)}
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
  }

  .topic {
    font-size: 0.875rem;
    opacity: 0.7;
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
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }
</style>
