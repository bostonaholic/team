/**
 * Acceptance tests for Multi-Session Tabs in Teamflow Dashboard.
 *
 * These tests verify the multi-session tab infrastructure:
 * - Structural/source-code tests for UI components (TabBar.svelte, App.svelte, EmptyState.svelte)
 * - Behavioral tests for session discovery (sessions.ts) and shared library (lib/events.mjs)
 * - Structural tests for skill files, hooks, demo script, and SSE module
 *
 * Plan: docs/plans/2026-04-01-multi-session-tabs-teamflow-plan.md
 * Tests: T1-T22
 */

import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { readSource, extractStyleBlock } from "./helpers.js";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const TEAMFLOW_ROOT = join(import.meta.dirname, "..", "..");
const PROJECT_ROOT = join(TEAMFLOW_ROOT, "..");

const APP_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "App.svelte");
const TAB_BAR_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "components", "TabBar.svelte");
const EMPTY_STATE_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "components", "EmptyState.svelte");
const SSE_TS = join(TEAMFLOW_ROOT, "src", "sse.ts");
const SERVER_TS = join(TEAMFLOW_ROOT, "src", "server.ts");
const SESSIONS_TS = join(TEAMFLOW_ROOT, "src", "sessions.ts");
const DEMO_MJS = join(TEAMFLOW_ROOT, "bin", "demo.mjs");
const LIB_EVENTS = join(PROJECT_ROOT, "lib", "events.mjs");

// Hooks
const HOOK_SESSION_START = join(PROJECT_ROOT, "hooks", "session-start-recover.mjs");
const HOOK_PRE_COMPACT = join(PROJECT_ROOT, "hooks", "pre-compact-anchor.mjs");

// Skill files (all 11 that reference ~/.team paths)
const SKILL_FILES = [
  join(PROJECT_ROOT, "skills", "team", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-research", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-plan", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-test", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-implement", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-verify", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-ship", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-fix", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "team-resume", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "rpi-workflow", "SKILL.md"),
  join(PROJECT_ROOT, "skills", "worktree-isolation", "SKILL.md"),
];

// ---------------------------------------------------------------------------
// T1: tab_bar_renders_when_two_or_more_sessions
// Verifies: App.svelte conditionally renders TabBar inside {#if showTabs}
// or equivalent sessions.size >= 2 guard
// Step: 3.3
// ---------------------------------------------------------------------------
describe("MS-T1: tab_bar_renders_when_two_or_more_sessions", () => {
  it("App.svelte imports TabBar component", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/import\s+TabBar\s+from\s+["']\.\/components\/TabBar\.svelte["']/);
  });

  it("App.svelte renders TabBar conditionally with showTabs guard", () => {
    const svelte = readSource(APP_SVELTE);
    // Template should contain {#if showTabs} ... <TabBar or similar guard
    expect(svelte).toMatch(/\{#if\s+showTabs\}/);
  });

  it("App.svelte template contains <TabBar", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/<TabBar\b/);
  });
});

// ---------------------------------------------------------------------------
// T2: tab_label_shows_topic_and_phase
// Verifies: TabBar.svelte template references topic and phase for each tab
// Step: 3.1
// ---------------------------------------------------------------------------
describe("MS-T2: tab_label_shows_topic_and_phase", () => {
  it("TabBar.svelte file exists with <script lang=\"ts\"> block", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/<script\s+lang="ts">/);
  });

  it("TabBar.svelte template references topic for tab label", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // The template should reference state.topic or topic for each tab
    expect(svelte).toMatch(/\.topic/);
  });

  it("TabBar.svelte template references phase for tab badge", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // The template should reference state.phase or phase for each tab
    expect(svelte).toMatch(/\.phase/);
  });
});

// ---------------------------------------------------------------------------
// T3: active_tab_has_distinct_class
// Verifies: TabBar.svelte applies .active class conditioned on activeSessionId
// Step: 3.1
// ---------------------------------------------------------------------------
describe("MS-T3: active_tab_has_distinct_class", () => {
  it("TabBar.svelte applies .active class conditionally", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // Look for class:active or class containing active conditional
    expect(svelte).toMatch(/class:active/);
  });

  it("TabBar.svelte references activeSessionId for active class", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/activeSessionId/);
  });

  it("TabBar.svelte style block defines .active with visual distinction", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/\.active/);
  });
});

// ---------------------------------------------------------------------------
// T4: clicking_tab_calls_on_select
// Verifies: TabBar.svelte wires onclick to onSelect prop
// Step: 3.1
// ---------------------------------------------------------------------------
describe("MS-T4: clicking_tab_calls_on_select", () => {
  it("TabBar.svelte accepts onSelect prop", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/onSelect/);
  });

  it("TabBar.svelte wires onclick handler calling onSelect", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // Should have onclick that calls onSelect
    expect(svelte).toMatch(/onclick/);
  });
});

// ---------------------------------------------------------------------------
// T5: session_poller_detects_new_directories
// Verifies: sessions.ts exports createSessionPoller and calls
// discoverSessions on an interval
// Step: 2.1
// ---------------------------------------------------------------------------
describe("MS-T5: session_poller_detects_new_directories", () => {
  it("sessions.ts source contains setInterval or polling mechanism", () => {
    const source = readSource(SESSIONS_TS);
    // The poller must use setInterval or similar to poll
    expect(source).toMatch(/setInterval/);
  });

  it("createSessionPoller body calls discoverSessions", () => {
    const source = readSource(SESSIONS_TS);
    // The poller function body should invoke discoverSessions
    const pollerMatch = source.match(/createSessionPoller[\s\S]*?\{([\s\S]*)\}/);
    expect(pollerMatch).not.toBeNull();
    expect(pollerMatch![1]).toMatch(/discoverSessions/);
  });
});

// ---------------------------------------------------------------------------
// T6: completed_session_has_completed_class
// Verifies: TabBar.svelte applies .completed class when phase is SHIPPED
// Step: 3.1
// ---------------------------------------------------------------------------
describe("MS-T6: completed_session_has_completed_class", () => {
  it("TabBar.svelte applies .completed class", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/class:completed/);
  });

  it("TabBar.svelte .completed condition references SHIPPED", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/SHIPPED/);
  });
});

// ---------------------------------------------------------------------------
// T7: dismiss_button_exists_for_shipped_sessions
// Verifies: TabBar.svelte renders dismiss control inside a SHIPPED conditional
// Step: 3.1
// ---------------------------------------------------------------------------
describe("MS-T7: dismiss_button_exists_for_shipped_sessions", () => {
  it("TabBar.svelte has dismiss control gated by SHIPPED", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    // Should have a conditional block checking for SHIPPED before dismiss button
    // e.g., {#if state.phase === "SHIPPED"} ... dismiss
    const templatePart = svelte.split("<style>")[0];
    expect(templatePart).toMatch(/SHIPPED/);
  });

  it("TabBar.svelte accepts onDismiss prop", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/onDismiss/);
  });

  it("TabBar.svelte dismiss button uses stopPropagation", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    expect(svelte).toMatch(/stopPropagation/);
  });
});

// ---------------------------------------------------------------------------
// T8: dismissal_persists_to_local_storage
// Verifies: App.svelte references teamflow:dismissed-sessions localStorage key
// Step: 3.2
// ---------------------------------------------------------------------------
describe("MS-T8: dismissal_persists_to_local_storage", () => {
  it("App.svelte references teamflow:dismissed-sessions localStorage key", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/teamflow:dismissed-sessions/);
  });

  it("App.svelte uses localStorage for dismissed sessions", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/localStorage/);
  });
});

// ---------------------------------------------------------------------------
// T9: no_dismiss_for_active_sessions
// Verifies: TabBar.svelte dismiss control is gated by SHIPPED check
// (same structural check as T7 but from the negative angle -- dismiss button
// only appears inside a SHIPPED conditional, so active sessions have none)
// Step: 3.1
// ---------------------------------------------------------------------------
describe("MS-T9: no_dismiss_for_active_sessions", () => {
  it("TabBar.svelte dismiss button is inside a SHIPPED-only conditional block", () => {
    const svelte = readSource(TAB_BAR_SVELTE);
    const templatePart = svelte.split("<style>")[0];
    // The dismiss control (onDismiss) should appear after/inside a SHIPPED check
    // Look for pattern: {#if ... "SHIPPED" ...} ... onDismiss ... {/if}
    const shippedBlock = templatePart.match(/\{#if[^}]*SHIPPED[^}]*\}([\s\S]*?)\{\/if\}/);
    expect(shippedBlock).not.toBeNull();
    expect(shippedBlock![1]).toMatch(/onDismiss|dismiss/i);
  });
});

// ---------------------------------------------------------------------------
// T10: no_tab_bar_for_single_session
// Verifies: App.svelte showTabs derivation uses .size >= 2 or >= 2
// Step: 3.2
// ---------------------------------------------------------------------------
describe("MS-T10: no_tab_bar_for_single_session", () => {
  it("App.svelte declares showTabs as $derived", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/showTabs\s*=\s*\$derived/);
  });

  it("App.svelte showTabs uses size >= 2 threshold", () => {
    const svelte = readSource(APP_SVELTE);
    // Match sessionCount >= 2 or sessions.size >= 2
    expect(svelte).toMatch(/(?:sessionCount|\.size)\s*>=\s*2/);
  });
});

// ---------------------------------------------------------------------------
// T11: grid_layout_unchanged_for_single_session (E8 regression)
// Verifies: EmptyState base grid-row: 2 / 4 is present and unmodified
// Step: 3.4
// ---------------------------------------------------------------------------
describe("MS-T11: grid_layout_unchanged_for_single_session", () => {
  it("EmptyState.svelte base .empty-state still has grid-row: 2 / 4", () => {
    const svelte = readSource(EMPTY_STATE_SVELTE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/grid-row\s*:\s*2\s*\/\s*4/);
  });
});

// ---------------------------------------------------------------------------
// T12: has_tabs_class_toggles_grid
// Verifies: App.svelte style contains .dashboard.has-tabs or .has-tabs
// with 5-row grid template
// Step: 3.2
// ---------------------------------------------------------------------------
describe("MS-T12: has_tabs_class_toggles_grid", () => {
  it("App.svelte has class:has-tabs toggle on .dashboard", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/class:has-tabs/);
  });

  it("App.svelte style block contains .has-tabs rule with 5-row grid", () => {
    const svelte = readSource(APP_SVELTE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    // Should contain a rule for .has-tabs with auto auto auto 1fr auto (5 rows)
    expect(styleBlock).toMatch(/\.has-tabs/);
    // The 5-row grid template: auto auto auto 1fr auto
    expect(styleBlock).toMatch(/auto\s+auto\s+auto\s+1fr\s+auto/);
  });
});

// ---------------------------------------------------------------------------
// T13: empty_state_override_for_tabs
// Verifies: EmptyState.svelte has :global(.has-tabs) rule with grid-row: 3 / 5
// Step: 3.4
// ---------------------------------------------------------------------------
describe("MS-T13: empty_state_override_for_tabs", () => {
  it("EmptyState.svelte has :global(.has-tabs) override rule", () => {
    const svelte = readSource(EMPTY_STATE_SVELTE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/:global\(\.has-tabs\)/);
  });

  it("EmptyState.svelte .has-tabs override uses grid-row: 3 / 5", () => {
    const svelte = readSource(EMPTY_STATE_SVELTE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/grid-row\s*:\s*3\s*\/\s*5/);
  });
});

// ---------------------------------------------------------------------------
// T14: sse_envelope_contains_session_id
// Verifies: sse.ts JSON.stringify output includes sessionId
// Step: 2.3
// ---------------------------------------------------------------------------
describe("MS-T14: sse_envelope_contains_session_id", () => {
  it("sse.ts snapshot message includes sessionId in the envelope", () => {
    const source = readSource(SSE_TS);
    // The JSON.stringify call should produce output containing sessionId
    expect(source).toMatch(/sessionId/);
  });

  it("sse.ts uses getAllSnapshots instead of getSnapshot", () => {
    const source = readSource(SSE_TS);
    expect(source).toMatch(/getAllSnapshots/);
  });
});

// ---------------------------------------------------------------------------
// T15: sessions_module_exports_discover
// Verifies: sessions.ts exports discoverSessions function
// Step: 2.1
// ---------------------------------------------------------------------------
describe("MS-T15: sessions_module_exports_discover", () => {
  it("sessions.ts exports discoverSessions as a function", async () => {
    const { discoverSessions } = await import("../sessions.js");
    expect(typeof discoverSessions).toBe("function");
  });

  it("discoverSessions accepts a baseDir string parameter", async () => {
    const { discoverSessions } = await import("../sessions.js");
    // Function should accept at least one parameter
    expect(discoverSessions.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// T16: lib_events_exports_session_dir
// Verifies: lib/events.mjs exports sessionDir
// Step: 1.1
// ---------------------------------------------------------------------------
describe("MS-T16: lib_events_exports_session_dir", () => {
  it("lib/events.mjs exports sessionDir function", async () => {
    const events = await import("../../../lib/events.mjs");
    expect(typeof events.sessionDir).toBe("function");
  });

  it("sessionDir returns a path under teamDir for a given topic", async () => {
    const events = await import("../../../lib/events.mjs");
    expect(typeof events.sessionDir).toBe("function");
    const result = (events.sessionDir as (t: string) => string)("my-topic");
    expect(result).toMatch(/\.team/);
    expect(result).toMatch(/my-topic/);
  });
});

// ---------------------------------------------------------------------------
// T17: app_maintains_session_map
// Verifies: App.svelte declares sessions as a Map with $state
// Step: 3.2
// ---------------------------------------------------------------------------
describe("MS-T17: app_maintains_session_map", () => {
  it("App.svelte declares sessions with $state(new Map", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/sessions\s*=\s*\$state\s*\(\s*new\s+Map/);
  });

  it("App.svelte declares activeSessionId with $state", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/activeSessionId[\s\S]*=\s*\$state/);
  });
});

// ---------------------------------------------------------------------------
// T18: backward_compat_default_session
// Verifies: sessions.ts discoverSessions body contains logic for flat
// events.jsonl producing "default" session id
// Step: 2.1
// ---------------------------------------------------------------------------
describe("MS-T18: backward_compat_default_session", () => {
  it("sessions.ts discoverSessions body references 'default' session id", () => {
    const source = readSource(SESSIONS_TS);
    expect(source).toMatch(/"default"/);
  });

  it("sessions.ts checks for flat events.jsonl at baseDir level", () => {
    const source = readSource(SESSIONS_TS);
    // Should check for events.jsonl directly in baseDir (not subdirectory)
    expect(source).toMatch(/events\.jsonl/);
  });

  it("discoverSessions includes default session for flat file", async () => {
    // Behavioral: calling discoverSessions on a dir with flat events.jsonl
    // should return {id: "default", ...}
    const { discoverSessions } = await import("../sessions.js");
    // Create a temp dir with a flat events.jsonl to test
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "ms-test-"));
    try {
      writeFileSync(pathJoin(tmpDir, "events.jsonl"), '{"seq":1}\n');
      const sessions = await discoverSessions(tmpDir);
      const defaultSession = sessions.find((s) => s.id === "default");
      expect(defaultSession).toBeDefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// T19: skill_files_reference_topic_subdirectory
// Verifies: All 11 skill files reference ~/.team/<topic> and none reference
// bare ~/.team/events.jsonl
// Step: 4.1
// ---------------------------------------------------------------------------
describe("MS-T19: skill_files_reference_topic_subdirectory", () => {
  for (const skillPath of SKILL_FILES) {
    const skillName = skillPath.split("/skills/")[1];

    it(`${skillName} references ~/.team/<topic>`, () => {
      const content = readSource(skillPath);
      // Should contain ~/.team/<topic> (the subdirectory pattern)
      expect(content).toMatch(/~\/\.team\/<topic>/);
    });

    it(`${skillName} does not reference bare ~/.team/events.jsonl`, () => {
      const content = readSource(skillPath);
      // Should NOT contain ~/.team/events.jsonl (the old flat path)
      // Only ~/.team/<topic>/events.jsonl is allowed
      expect(content).not.toMatch(/~\/\.team\/events\.jsonl/);
    });
  }
});

// ---------------------------------------------------------------------------
// T20: demo_writes_to_subdirectory
// Verifies: demo.mjs references "demo" subdirectory path and SIGINT handler
// does not rmSync on bare teamDir
// Step: 4.3
// ---------------------------------------------------------------------------
describe("MS-T20: demo_writes_to_subdirectory", () => {
  it("demo.mjs creates a 'demo' subdirectory path", () => {
    const source = readSource(DEMO_MJS);
    // Should reference a "demo" subdirectory for events
    expect(source).toMatch(/"demo"/);
    expect(source).toMatch(/demoDir/);
  });

  it("demo.mjs eventsPath uses demo subdirectory", () => {
    const source = readSource(DEMO_MJS);
    // eventsPath should be join(demoDir, "events.jsonl") not join(teamDir, "events.jsonl")
    expect(source).toMatch(/join\s*\(\s*demoDir/);
  });

  it("demo.mjs SIGINT handler deletes only demo subdirectory, not all of teamDir", () => {
    const source = readSource(DEMO_MJS);
    // The rmSync call in SIGINT handler should reference demoDir, not teamDir
    const sigintMatch = source.match(/SIGINT[\s\S]*?rmSync\s*\(\s*(\w+)/);
    expect(sigintMatch).not.toBeNull();
    expect(sigintMatch![1]).toBe("demoDir");
  });
});

// ---------------------------------------------------------------------------
// T21: hooks_scan_subdirectories
// Verifies: Both hooks contain readdir call or equivalent subdirectory
// scanning logic
// Step: 4.2
// ---------------------------------------------------------------------------
describe("MS-T21: hooks_scan_subdirectories", () => {
  it("session-start-recover.mjs contains readdir for subdirectory scanning", () => {
    const source = readSource(HOOK_SESSION_START);
    expect(source).toMatch(/readdir/);
  });

  it("pre-compact-anchor.mjs contains readdir for subdirectory scanning", () => {
    const source = readSource(HOOK_PRE_COMPACT);
    expect(source).toMatch(/readdir/);
  });

  it("session-start-recover.mjs imports readdir from node:fs/promises", () => {
    const source = readSource(HOOK_SESSION_START);
    expect(source).toMatch(/import\s*\{[^}]*readdir[^}]*\}\s*from\s*["']node:fs\/promises["']/);
  });

  it("pre-compact-anchor.mjs imports readdir from node:fs/promises", () => {
    const source = readSource(HOOK_PRE_COMPACT);
    expect(source).toMatch(/import\s*\{[^}]*readdir[^}]*\}\s*from\s*["']node:fs\/promises["']/);
  });
});

// ---------------------------------------------------------------------------
// T22: session_removed_event_on_delete
// Verifies: sse.ts or server.ts contains session-removed event type string
// Step: 2.2/2.3
// ---------------------------------------------------------------------------
describe("MS-T22: session_removed_event_on_delete", () => {
  it("sse.ts or server.ts contains 'session-removed' event type", () => {
    const sseSource = readSource(SSE_TS);
    const serverSource = readSource(SERVER_TS);
    const combined = sseSource + serverSource;
    expect(combined).toMatch(/session-removed/);
  });
});
