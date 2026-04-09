/**
 * Acceptance tests for Persist Active Tab Across Page Refresh.
 *
 * These tests verify that the Teamflow dashboard persists the active session
 * tab to localStorage and restores it on refresh. All tests use structural
 * source-code pattern matching against App.svelte.
 *
 * Plan: docs/plans/2026-04-08-teamflow-persist-active-tab-plan.md
 * Tests: PT-T1 through PT-T12
 */

import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { readSource } from "./helpers.js";

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const APP_SVELTE = join(import.meta.dirname, "..", "client", "App.svelte");

// ---------------------------------------------------------------------------
// Helper: extract the <script> block from App.svelte
// ---------------------------------------------------------------------------

function scriptBlock(): string {
  const source = readSource(APP_SVELTE);
  const end = source.indexOf("</script>");
  return end > -1 ? source.slice(0, end) : source;
}

// ---------------------------------------------------------------------------
// Helper: extract the snapshot event handler block
// ---------------------------------------------------------------------------

function snapshotHandlerBlock(): string {
  const script = scriptBlock();
  const match = script.match(
    /es\.addEventListener\(\s*["']snapshot["'][\s\S]*?\n\s*\}\)/,
  );
  return match ? match[0] : "";
}

// ---------------------------------------------------------------------------
// Helper: extract the update event handler block
// ---------------------------------------------------------------------------

function updateHandlerBlock(): string {
  const script = scriptBlock();
  const match = script.match(
    /es\.addEventListener\(\s*["']update["'][\s\S]*?\n\s*\}\)/,
  );
  return match ? match[0] : "";
}

// ---------------------------------------------------------------------------
// Helper: extract the session-removed event handler block
// ---------------------------------------------------------------------------

function sessionRemovedHandlerBlock(): string {
  const script = scriptBlock();
  const match = script.match(
    /es\.addEventListener\(\s*["']session-removed["'][\s\S]*?\n\s*\}\)/,
  );
  return match ? match[0] : "";
}

// ---------------------------------------------------------------------------
// Helper: extract the handleSelect function body
// ---------------------------------------------------------------------------

function handleSelectBody(): string {
  const script = scriptBlock();
  const match = script.match(
    /function\s+handleSelect\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/,
  );
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// Helper: extract the handleDismiss function body
// ---------------------------------------------------------------------------

function handleDismissBody(): string {
  const script = scriptBlock();
  const match = script.match(
    /function\s+handleDismiss\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/,
  );
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// Helper: extract a named function body (for getStoredActiveSession /
// saveActiveSession)
// ---------------------------------------------------------------------------

function functionBody(name: string): string {
  const script = scriptBlock();
  const re = new RegExp(
    `function\\s+${name}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\{([\\s\\S]*?)\\n\\s*\\}`,
  );
  const match = script.match(re);
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// PT-T1: active_session_key_exists
// App.svelte contains `teamflow:active-session` localStorage key string
// Step: 1.1
// ---------------------------------------------------------------------------
describe("PT-T1: active_session_key_exists", () => {
  it("App.svelte contains the teamflow:active-session localStorage key", () => {
    const source = readSource(APP_SVELTE);
    expect(source).toMatch(/teamflow:active-session/);
  });
});

// ---------------------------------------------------------------------------
// PT-T2: get_stored_has_try_catch_guard
// getStoredActiveSession wraps localStorage read in try/catch
// Step: 1.1
// ---------------------------------------------------------------------------
describe("PT-T2: get_stored_has_try_catch_guard", () => {
  it("App.svelte declares getStoredActiveSession function", () => {
    const script = scriptBlock();
    expect(script).toMatch(/function\s+getStoredActiveSession/);
  });

  it("getStoredActiveSession body contains try/catch", () => {
    const body = functionBody("getStoredActiveSession");
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch/);
  });
});

// ---------------------------------------------------------------------------
// PT-T3: handle_select_persists_to_storage
// handleSelect references saveActiveSession and activeSetByUser = true
// Step: 1.2
// ---------------------------------------------------------------------------
describe("PT-T3: handle_select_persists_to_storage", () => {
  it("handleSelect calls saveActiveSession", () => {
    const body = handleSelectBody();
    expect(body).toMatch(/saveActiveSession/);
  });

  it("handleSelect sets activeSetByUser = true", () => {
    const body = handleSelectBody();
    expect(body).toMatch(/activeSetByUser\s*=\s*true/);
  });
});

// ---------------------------------------------------------------------------
// PT-T4: snapshot_handler_reads_stored_session
// Snapshot event handler references getStoredActiveSession
// Step: 1.3
// ---------------------------------------------------------------------------
describe("PT-T4: snapshot_handler_reads_stored_session", () => {
  it("snapshot handler references getStoredActiveSession", () => {
    const block = snapshotHandlerBlock();
    expect(block).toMatch(/getStoredActiveSession/);
  });
});

// ---------------------------------------------------------------------------
// PT-T5: snapshot_checks_stored_session_in_map
// Snapshot handler has sessions.has guard near getStoredActiveSession
// Step: 1.3
// ---------------------------------------------------------------------------
describe("PT-T5: snapshot_checks_stored_session_in_map", () => {
  it("snapshot handler has sessions.has guard near getStoredActiveSession", () => {
    const block = snapshotHandlerBlock();
    // Both must appear in the snapshot handler, and sessions.has should be
    // used to validate the stored session exists in the map
    expect(block).toMatch(/getStoredActiveSession/);
    expect(block).toMatch(/sessions\.has/);
  });
});

// ---------------------------------------------------------------------------
// PT-T6: dismiss_clears_stored_session
// handleDismiss calls saveActiveSession(null), compares against
// getStoredActiveSession(), and assigns activeSetByUser = false
// Step: 1.5
// ---------------------------------------------------------------------------
describe("PT-T6: dismiss_clears_stored_session", () => {
  it("handleDismiss calls saveActiveSession(null)", () => {
    const body = handleDismissBody();
    expect(body).toMatch(/saveActiveSession\s*\(\s*null\s*\)/);
  });

  it("handleDismiss compares against getStoredActiveSession()", () => {
    const body = handleDismissBody();
    expect(body).toMatch(/getStoredActiveSession\s*\(\)/);
  });

  it("handleDismiss sets activeSetByUser = false", () => {
    const body = handleDismissBody();
    expect(body).toMatch(/activeSetByUser\s*=\s*false/);
  });
});

// ---------------------------------------------------------------------------
// PT-T7: session_removed_clears_stored_session
// session-removed handler calls saveActiveSession(null), compares against
// getStoredActiveSession(), and assigns activeSetByUser = false
// Step: 1.6
// ---------------------------------------------------------------------------
describe("PT-T7: session_removed_clears_stored_session", () => {
  it("session-removed handler calls saveActiveSession(null)", () => {
    const block = sessionRemovedHandlerBlock();
    expect(block).toMatch(/saveActiveSession\s*\(\s*null\s*\)/);
  });

  it("session-removed handler compares against getStoredActiveSession()", () => {
    const block = sessionRemovedHandlerBlock();
    expect(block).toMatch(/getStoredActiveSession\s*\(\)/);
  });

  it("session-removed handler sets activeSetByUser = false", () => {
    const block = sessionRemovedHandlerBlock();
    expect(block).toMatch(/activeSetByUser\s*=\s*false/);
  });
});

// ---------------------------------------------------------------------------
// PT-T8: auto_select_fallback_unchanged
// Snapshot handler still contains `activeSessionId = sessionId` as fallback
// Step: 1.3
// ---------------------------------------------------------------------------
describe("PT-T8: auto_select_fallback_unchanged", () => {
  it("snapshot handler contains activeSessionId = sessionId fallback assignment", () => {
    const block = snapshotHandlerBlock();
    expect(block).toMatch(/activeSessionId\s*=\s*sessionId/);
  });
});

// ---------------------------------------------------------------------------
// PT-T9: snapshot_handler_does_not_persist_auto_selection
// Auto-select fallback does NOT call saveActiveSession -- confirms
// auto-selections are not written to storage.
// This test requires that the snapshot handler DOES reference
// saveActiveSession somewhere (for the stored-session restore path) but
// the fallback line (activeSessionId = sessionId) is NOT adjacent to
// saveActiveSession.
// Step: 1.3
// ---------------------------------------------------------------------------
describe("PT-T9: snapshot_handler_does_not_persist_auto_selection", () => {
  it("snapshot handler uses saveActiveSession (precondition: feature exists)", () => {
    // This precondition fails until the persist feature is implemented,
    // ensuring the overall test fails on unimplemented code.
    const block = snapshotHandlerBlock();
    expect(block).toMatch(/saveActiveSession/);
  });

  it("auto-select fallback block does not call saveActiveSession", () => {
    const block = snapshotHandlerBlock();
    // Extract the fallback section: from the auto-select assignment to the
    // end of its enclosing block. The fallback is the else/final branch
    // containing `activeSessionId = sessionId`.
    const fallbackMatch = block.match(
      /activeSessionId\s*=\s*sessionId\s*;[^}]*/,
    );
    if (fallbackMatch) {
      expect(fallbackMatch[0]).not.toMatch(/saveActiveSession/);
    }
  });
});

// ---------------------------------------------------------------------------
// PT-T10: update_handler_checks_stored_session
// The update event handler references getStoredActiveSession
// Step: 1.4
// ---------------------------------------------------------------------------
describe("PT-T10: update_handler_checks_stored_session", () => {
  it("update handler references getStoredActiveSession", () => {
    const block = updateHandlerBlock();
    expect(block).toMatch(/getStoredActiveSession/);
  });
});

// ---------------------------------------------------------------------------
// PT-T11: active_set_by_user_flag_exists
// App.svelte declares activeSetByUser variable
// Step: 1.1
// ---------------------------------------------------------------------------
describe("PT-T11: active_set_by_user_flag_exists", () => {
  it("App.svelte declares activeSetByUser variable", () => {
    const script = scriptBlock();
    expect(script).toMatch(/let\s+activeSetByUser\b/);
  });
});

// ---------------------------------------------------------------------------
// PT-T12: save_active_has_try_catch_guard
// saveActiveSession wraps localStorage write in try/catch
// Step: 1.1
// ---------------------------------------------------------------------------
describe("PT-T12: save_active_has_try_catch_guard", () => {
  it("App.svelte declares saveActiveSession function", () => {
    const script = scriptBlock();
    expect(script).toMatch(/function\s+saveActiveSession/);
  });

  it("saveActiveSession body contains try/catch", () => {
    const body = functionBody("saveActiveSession");
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch/);
  });
});
