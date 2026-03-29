<script lang="ts">
  import Header from "./components/Header.svelte";
  import PhaseCards from "./components/PhaseCards.svelte";
  import Timeline from "./components/Timeline.svelte";
  import ErrorPanel from "./components/ErrorPanel.svelte";

  interface AgentStatus {
    name: string;
    status: "idle" | "running" | "done" | "error";
    producedEvent?: string;
  }

  interface TimelineEntry {
    seq: number;
    event: string;
    producer: string;
    ts: string;
    data?: Record<string, unknown>;
  }

  interface RunState {
    phase: string | null;
    topic: string | null;
    startedAt: string | null;
    agents: Record<string, AgentStatus>;
    events: TimelineEntry[];
    errors: Array<{ event: string; data: Record<string, unknown> }>;
    progress: { step: string | null; total: number | null };
    duration: number | null;
    lastSeq: number;
  }

  let state: RunState = $state({
    phase: null,
    topic: null,
    startedAt: null,
    agents: {},
    events: [],
    errors: [],
    progress: { step: null, total: null },
    duration: null,
    lastSeq: 0,
  });

  let connected = $state(false);
  let reconnecting = $state(false);

  // Tick every second so durations update live
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(id);
  });

  let theme = $state<"dark" | "light" | "system">("system");

  function applyTheme(t: "dark" | "light" | "system") {
    document.documentElement.classList.remove("theme-dark", "theme-light");
    if (t !== "system") {
      document.documentElement.classList.add(`theme-${t}`);
    }
  }

  $effect(() => {
    applyTheme(theme);
  });

  function toggleTheme() {
    const cycle: Array<"dark" | "light" | "system"> = ["system", "dark", "light"];
    const idx = cycle.indexOf(theme);
    theme = cycle[(idx + 1) % cycle.length];
  }

  function connectSSE() {
    const es = new EventSource("/api/events");

    es.addEventListener("snapshot", (e) => {
      state = JSON.parse(e.data);
      connected = true;
      reconnecting = false;
    });

    es.addEventListener("update", (e) => {
      state = JSON.parse(e.data);
    });

    es.onerror = () => {
      connected = false;
      reconnecting = true;
      es.close();
      // Retry with backoff
      setTimeout(connectSSE, 2000);
    };
  }

  $effect(() => {
    connectSSE();
  });
</script>

<div class="dashboard">
  <Header
    topic={state.topic}
    duration={state.startedAt && state.phase !== "SHIPPED" ? now - new Date(state.startedAt).getTime() : state.duration}
    {theme}
    onToggleTheme={toggleTheme}
  />

  {#if reconnecting}
    <div class="reconnecting">Reconnecting...</div>
  {/if}

  <PhaseCards phase={state.phase} agents={state.agents} events={state.events} {now} />

  <div class="main-content">
    <Timeline events={state.events} />
  </div>

  <ErrorPanel errors={state.errors} />
</div>

<style>
  .dashboard {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    height: 100vh;
    gap: var(--space-md, 1rem);
    padding: var(--space-md, 1rem);
    background: var(--bg-primary, #0d1117);
    color: var(--text-primary, #c9d1d9);
  }

  .reconnecting {
    text-align: center;
    padding: var(--space-sm, 0.5rem);
    background: var(--color-warning, #d29922);
    color: var(--bg-primary, #0d1117);
    border-radius: 4px;
    font-weight: 600;
  }

  .main-content {
    overflow-y: auto;
    min-height: 0;
  }
</style>
