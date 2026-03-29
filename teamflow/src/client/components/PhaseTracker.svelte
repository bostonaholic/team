<script lang="ts">
  interface Props {
    phase: string | null;
  }

  let { phase }: Props = $props();

  const phases = ["RESEARCH", "PLAN", "TEST-FIRST", "IMPLEMENT", "VERIFY", "SHIP"];

  function phaseStatus(p: string): "completed" | "current" | "future" {
    if (!phase) return "future";
    // SHIPPED means all phases are complete
    if (phase === "SHIPPED") return "completed";
    const currentIdx = phases.indexOf(phase);
    const pIdx = phases.indexOf(p);
    if (pIdx < currentIdx) return "completed";
    if (pIdx === currentIdx) return "current";
    return "future";
  }
</script>

<div class="phase-tracker">
  {#each phases as p, i}
    <div class="phase-step {phaseStatus(p)}">
      <div class="phase-indicator"></div>
      <span class="phase-label">{p}</span>
    </div>
    {#if i < phases.length - 1}
      <div class="phase-connector {phaseStatus(phases[i + 1]) !== 'future' ? 'active' : ''}"></div>
    {/if}
  {/each}
</div>

<style>
  .phase-tracker {
    display: flex;
    align-items: center;
    gap: 0;
    padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
  }

  .phase-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .phase-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--border-color, #30363d);
    background: transparent;
  }

  .phase-label {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.5;
  }

  .phase-connector {
    flex: 1;
    height: 2px;
    background: var(--border-color, #30363d);
    margin: 0 4px;
    margin-bottom: 20px;
  }

  .phase-connector.active {
    background: var(--color-success, #3fb950);
  }

  .completed .phase-indicator {
    background: var(--color-success, #3fb950);
    border-color: var(--color-success, #3fb950);
  }

  .completed .phase-label {
    opacity: 0.8;
    color: var(--color-success, #3fb950);
  }

  .current .phase-indicator {
    background: var(--color-accent, #58a6ff);
    border-color: var(--color-accent, #58a6ff);
    box-shadow: 0 0 8px var(--color-accent, #58a6ff);
  }

  .current .phase-label {
    opacity: 1;
    color: var(--color-accent, #58a6ff);
    font-weight: 600;
  }
</style>
