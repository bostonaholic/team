<script lang="ts">
  interface Props {
    connected: boolean;
  }

  let { connected }: Props = $props();
</script>

<div class="empty-state" aria-live="polite">
  {#if !connected}
    <p class="connecting-message">Connecting to Teamflow<span class="dots"></span></p>
  {:else}
    <h2 class="heading">No pipeline running</h2>
    <p class="cta">Run <code>/team</code> to start a pipeline</p>
  {/if}
</div>

<style>
  .empty-state {
    grid-row: 2 / 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border-color, #30363d);
    border-radius: 8px;
    padding: var(--space-lg, 1.5rem);
  }

  .connecting-message {
    color: var(--text-secondary, #8b949e);
    font-size: 1rem;
  }

  .dots {
    display: inline-block;
    width: 1.5ch;
    text-align: left;
  }

  .dots::after {
    content: '.';
    animation: dots 1.5s steps(1) infinite;
  }

  @keyframes dots {
    0%   { content: '.'; }
    33%  { content: '..'; }
    66%  { content: '...'; }
  }

  .heading {
    color: var(--text-primary, #c9d1d9);
    font-size: 1.25rem;
    margin-bottom: var(--space-sm, 0.5rem);
  }

  .cta {
    color: var(--text-secondary, #8b949e);
    font-size: 0.875rem;
  }

  .cta code {
    color: var(--color-accent, #58a6ff);
    font-weight: 600;
  }

  :global(.has-tabs) .empty-state {
    grid-row: 3 / 5;
  }
</style>
