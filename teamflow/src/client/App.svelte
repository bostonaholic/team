<script lang="ts">
  import Header from "./components/Header.svelte";
  import PhaseCards from "./components/PhaseCards.svelte";
  import Timeline from "./components/Timeline.svelte";
  import ErrorPanel from "./components/ErrorPanel.svelte";
  import EmptyState from "./components/EmptyState.svelte";
  import TabBar from "./components/TabBar.svelte";
  import type { RunState } from "../types.js";

  const emptyRunState: RunState = {
    phase: null,
    topic: null,
    title: null,
    startedAt: null,
    agents: {},
    gates: {},
    events: [],
    errors: [],
    progress: { step: null, total: null },
    duration: null,
    lastSeq: 0,
  };

  let sessions = $state(new Map<string, RunState>());
  let sessionCount = $state(0);
  let activeSessionId: string | null = $state(null);

  // Svelte 5's $state(Map) proxy does not reliably trigger re-renders
  // when mutated from async callbacks (EventSource handlers). Reassigning
  // the Map to a new reference forces Svelte to detect the change.
  function updateSessions() {
    sessions = new Map(sessions);
    sessionCount = sessions.size;
  }

  const activeState: RunState = $derived(sessions.get(activeSessionId ?? "") ?? emptyRunState);

  let connected = $state(false);
  let reconnecting = $state(false);
  let hasEverConnected = $state(false);

  // Invariant: EmptyState and the reconnecting banner are never simultaneously visible.
  // When hasEverConnected && !connected, reconnecting is true and showEmptyState is false,
  // so EmptyState is hidden. This matters because EmptyState uses grid-row: 2 / 4 and
  // would collide with the reconnecting banner if both rendered at once.
  // Note: sessionCount is tracked explicitly because Svelte 5's Map proxy
  // does not reliably trigger $derived re-evaluation on .size changes.
  const showEmptyState = $derived(!hasEverConnected || (connected && sessionCount === 0));

  const showTabs = $derived(sessionCount >= 1);

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

  function getDismissedSessions(): string[] {
    try {
      const raw = localStorage.getItem("teamflow:dismissed-sessions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveDismissedSessions(ids: string[]) {
    localStorage.setItem("teamflow:dismissed-sessions", JSON.stringify(ids));
  }

  function getStoredActiveSession(): string | null {
    try { return localStorage.getItem("teamflow:active-session"); }
    catch { return null; }
  }

  function saveActiveSession(id: string | null) {
    try {
      if (id === null) localStorage.removeItem("teamflow:active-session");
      else localStorage.setItem("teamflow:active-session", id); }
    catch { /* ignore */ }
  }

  let activeSetByUser = false;

  function handleSelect(id: string) {
    activeSessionId = id;
    saveActiveSession(id);
    activeSetByUser = true;
  }

  function handleDismiss(id: string) {
    if (getStoredActiveSession() === id) { saveActiveSession(null); activeSetByUser = false; }
    sessions.delete(id);
    updateSessions();
    const dismissed = getDismissedSessions();
    if (!dismissed.includes(id)) {
      dismissed.push(id);
      saveDismissedSessions(dismissed);
    }
    if (activeSessionId === id) {
      const remaining = [...sessions.keys()];
      activeSessionId = remaining.length > 0 ? remaining[0] : null;
      // Programmatic fallback — not a user choice, so allow storage-based restore later
      activeSetByUser = false;
    }
  }

  function connectSSE() {
    const es = new EventSource("/api/events");

    es.onopen = () => {
      connected = true;
      hasEverConnected = true;
      reconnecting = false;
    };

    es.addEventListener("snapshot", (e) => {
      const data = JSON.parse(e.data);
      const { sessionId, state } = data;

      // Skip dismissed sessions (read fresh each time to catch mid-connection dismissals)
      if (getDismissedSessions().includes(sessionId)) return;

      sessions.set(sessionId, state);
      updateSessions();

      // Auto-select logic: user choice > stored session > first arriving session
      if (activeSetByUser && activeSessionId && sessions.has(activeSessionId)) {
        // User made an explicit choice — never override it
      } else {
        const storedId = getStoredActiveSession();
        if (storedId && sessions.has(storedId)) {
          activeSessionId = storedId;
          // No saveActiveSession — storedId was just read from localStorage
          activeSetByUser = true;
        } else {
          activeSessionId = sessionId;
        }
      }
    });

    es.addEventListener("update", (e) => {
      const data = JSON.parse(e.data);
      const { sessionId, state } = data;

      // Skip dismissed sessions (read fresh each time to catch mid-connection dismissals)
      if (getDismissedSessions().includes(sessionId)) return;

      sessions.set(sessionId, state);
      updateSessions();

      // Auto-select logic: user choice > stored session > first arriving session
      if (activeSetByUser && activeSessionId !== null) {
        // User made an explicit choice — never override it
      } else {
        const storedId = getStoredActiveSession();
        if (storedId && sessions.has(storedId)) {
          activeSessionId = storedId;
          // No saveActiveSession — storedId was just read from localStorage, no need to write it back
          activeSetByUser = true;
        } else {
          activeSessionId = sessionId;
        }
      }
    });

    es.addEventListener("session-removed", (e) => {
      const data = JSON.parse(e.data);
      const { sessionId } = data;

      sessions.delete(sessionId);
      updateSessions();

      if (getStoredActiveSession() === sessionId) {
        saveActiveSession(null);
        activeSetByUser = false;
      }

      if (activeSessionId === sessionId) {
        const remaining = [...sessions.keys()];
        activeSessionId = remaining.length > 0 ? remaining[0] : null;
        // Programmatic fallback — not a user choice, so allow storage-based restore later
        activeSetByUser = false;
      }
    });

    es.onerror = () => {
      connected = false;
      reconnecting = true;
      es.close();
      // Clear sessions map on reconnect -- snapshots will repopulate
      sessions = new Map<string, RunState>();
      sessionCount = 0;
      // Retry with backoff
      setTimeout(connectSSE, 2000);
    };
  }

  $effect(() => {
    connectSSE();
  });
</script>

<div class="dashboard" class:has-tabs={showTabs}>
  <Header
    topic={activeState.topic}
    title={activeState.title}
    duration={activeState.startedAt && activeState.phase !== "SHIPPED" ? now - new Date(activeState.startedAt).getTime() : activeState.duration}
    {theme}
    onToggleTheme={toggleTheme}
  />

  {#if showTabs}
    <TabBar {sessions} {activeSessionId} onSelect={handleSelect} onDismiss={handleDismiss} />
  {/if}

  {#if reconnecting}
    <div class="reconnecting">Reconnecting<span class="dots"></span></div>
  {/if}

  {#if !showEmptyState}
    <PhaseCards phase={activeState.phase} agents={activeState.agents} gates={activeState.gates} events={activeState.events} {now} />

    <div class="main-content">
      <Timeline events={activeState.events} />
    </div>
  {:else}
    <EmptyState {connected} />
  {/if}

  <ErrorPanel errors={activeState.errors} />
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

  .dashboard.has-tabs {
    grid-template-rows: auto auto auto 1fr auto;
  }

  .reconnecting {
    text-align: center;
    padding: var(--space-sm, 0.5rem);
    background: var(--color-warning, #d29922);
    color: var(--bg-primary, #0d1117);
    border-radius: 4px;
    font-weight: 600;
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

  .main-content {
    overflow-y: auto;
    min-height: 0;
  }
</style>
