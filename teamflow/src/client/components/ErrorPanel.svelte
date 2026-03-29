<script lang="ts">
  import { slide } from "svelte/transition";

  interface ErrorEntry {
    event: string;
    data: Record<string, unknown>;
  }

  interface Props {
    errors: ErrorEntry[];
  }

  let { errors }: Props = $props();
</script>

{#if errors.length > 0}
  <div class="error-panel" transition:slide={{ duration: 250 }}>
    <h2 class="section-title">Errors</h2>
    {#each errors as error}
      <div class="error-entry">
        <span class="error-event">{error.event}</span>
        {#if error.data.retryCount != null}
          <span class="error-retry">retry {error.data.retryCount}/{error.data.maxRetries ?? 3}</span>
        {/if}
        {#if Array.isArray(error.data.findings)}
          <ul class="error-findings">
            {#each error.data.findings as finding}
              <li>{finding}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .error-panel {
    padding: var(--space-sm, 0.5rem);
    border: 1px solid var(--color-danger, #f85149);
    border-radius: 8px;
    background: var(--bg-danger, #1a0a0a);
  }

  .section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-danger, #f85149);
    margin: 0 0 var(--space-sm, 0.5rem) 0;
    padding-bottom: var(--space-sm, 0.5rem);
    border-bottom: 1px solid var(--color-danger, #f85149);
  }

  .error-entry {
    padding: 4px 0;
  }

  .error-event {
    font-weight: 500;
    color: var(--color-danger, #f85149);
  }

  .error-retry {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-left: var(--space-sm, 0.5rem);
  }

  .error-findings {
    margin: 4px 0;
    padding-left: 1.5rem;
    font-size: 0.8125rem;
    opacity: 0.8;
  }
</style>
