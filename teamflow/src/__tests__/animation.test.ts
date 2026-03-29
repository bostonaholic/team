/**
 * Acceptance tests for Teamflow Motion & Animation feature.
 *
 * These are structural/source-code tests that verify animation tokens,
 * transitions, and directives exist in the correct files. They read source
 * files as plain text since DOM animation testing requires a browser.
 *
 * Plan: docs/plans/2026-03-29-teamflow-motion-animation-plan.md
 * Approval: .team/events.jsonl seq 7 (plan.approved)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Resolve paths relative to the teamflow package root
const TEAMFLOW_ROOT = join(import.meta.dirname, "..", "..");
const THEME_CSS = join(TEAMFLOW_ROOT, "src", "client", "styles", "theme.css");
const PHASE_CARDS = join(TEAMFLOW_ROOT, "src", "client", "components", "PhaseCards.svelte");
const TIMELINE = join(TEAMFLOW_ROOT, "src", "client", "components", "Timeline.svelte");
const ERROR_PANEL = join(TEAMFLOW_ROOT, "src", "client", "components", "ErrorPanel.svelte");
const DEMO_MJS = join(TEAMFLOW_ROOT, "bin", "demo.mjs");

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// T1: Motion tokens present in :root (Plan step 1.1)
// ---------------------------------------------------------------------------
describe("T1: motion_tokens_present_in_root", () => {
  it("defines --duration-fast in :root", () => {
    const css = readSource(THEME_CSS);
    expect(css).toMatch(/--duration-fast\s*:\s*150ms/);
  });

  it("defines --duration-normal in :root", () => {
    const css = readSource(THEME_CSS);
    expect(css).toMatch(/--duration-normal\s*:\s*250ms/);
  });

  it("defines --duration-slow in :root", () => {
    const css = readSource(THEME_CSS);
    expect(css).toMatch(/--duration-slow\s*:\s*400ms/);
  });

  it("defines --ease-out in :root", () => {
    const css = readSource(THEME_CSS);
    expect(css).toMatch(/--ease-out\s*:/);
  });

  it("defines --ease-in-out in :root", () => {
    const css = readSource(THEME_CSS);
    expect(css).toMatch(/--ease-in-out\s*:/);
  });

  it("defines --ease-spring in :root", () => {
    const css = readSource(THEME_CSS);
    expect(css).toMatch(/--ease-spring\s*:/);
  });
});

// ---------------------------------------------------------------------------
// T3/T4: Agent icon CSS transitions (Plan step 2.1)
// Structural check: .agent-icon has transition for opacity and transform
// ---------------------------------------------------------------------------
describe("T3/T4: agent_icon_transitions", () => {
  it(".agent-icon has a CSS transition property", () => {
    const svelte = readSource(PHASE_CARDS);
    // Look for a transition rule within the .agent-icon style block
    const agentIconBlock = extractStyleBlock(svelte, ".agent-icon");
    expect(agentIconBlock).toMatch(/transition\s*:/);
  });

  it(".agent-icon transition includes opacity", () => {
    const svelte = readSource(PHASE_CARDS);
    const agentIconBlock = extractStyleBlock(svelte, ".agent-icon");
    expect(agentIconBlock).toMatch(/opacity/);
  });

  it(".agent-icon transition includes transform", () => {
    const svelte = readSource(PHASE_CARDS);
    const agentIconBlock = extractStyleBlock(svelte, ".agent-icon");
    expect(agentIconBlock).toMatch(/transform/);
  });
});

// ---------------------------------------------------------------------------
// T5: Active phase card pulses (Plan step 2.2)
// ---------------------------------------------------------------------------
describe("T5: active_phase_card_pulses", () => {
  it("defines a @keyframes pulse animation", () => {
    const svelte = readSource(PHASE_CARDS);
    expect(svelte).toMatch(/@keyframes\s+pulse/);
  });

  it(".phase-card.active uses the pulse animation", () => {
    const svelte = readSource(PHASE_CARDS);
    const activeBlock = extractStyleBlock(svelte, ".phase-card.active");
    expect(activeBlock).toMatch(/animation\s*:/);
  });

  it("pulse animation uses infinite iteration", () => {
    const svelte = readSource(PHASE_CARDS);
    // Could be in the shorthand or as a separate property
    expect(svelte).toMatch(/infinite/);
  });

});

// ---------------------------------------------------------------------------
// T6: Phase card status transitions (Plan step 2.3)
// Uses box-shadow not border-width for active indicator (seq 7 constraint)
// ---------------------------------------------------------------------------
describe("T6: phase_card_transitions_smooth", () => {
  it(".phase-card has a CSS transition property", () => {
    const svelte = readSource(PHASE_CARDS);
    const cardBlock = extractStyleBlock(svelte, ".phase-card");
    expect(cardBlock).toMatch(/transition\s*:/);
  });

  it(".phase-card.active uses box-shadow instead of border-width", () => {
    const svelte = readSource(PHASE_CARDS);
    const activeBlock = extractStyleBlock(svelte, ".phase-card.active");
    expect(activeBlock).toMatch(/box-shadow\s*:/);
    // Verify border-width is NOT used (plan critic finding, seq 6/7 constraint)
    expect(activeBlock).not.toMatch(/border-width\s*:/);
  });
});

// ---------------------------------------------------------------------------
// T7: Timeline events keyed by seq (Plan step 3.1)
// ---------------------------------------------------------------------------
describe("T7: timeline_events_keyed_by_seq", () => {
  it("{#each} block uses (entry.seq) as key expression", () => {
    const svelte = readSource(TIMELINE);
    // Svelte keyed each syntax: {#each items as item (key)}
    expect(svelte).toMatch(/\{#each\s+\S+\s+as\s+\S+\s+\(entry\.seq\)\}/);
  });
});

// ---------------------------------------------------------------------------
// T8: Timeline entry flies in (Plan step 3.2)
// ---------------------------------------------------------------------------
describe("T8: timeline_entry_flies_in", () => {
  it("imports fly (or slide) from svelte/transition", () => {
    const svelte = readSource(TIMELINE);
    expect(svelte).toMatch(/import\s+\{[^}]*(?:fly|slide)[^}]*\}\s+from\s+["']svelte\/transition["']/);
  });

  it("uses an in: or transition: directive on event entries", () => {
    const svelte = readSource(TIMELINE);
    // Look for in:fly or in:slide or transition:fly or transition:slide
    expect(svelte).toMatch(/(?:in|transition)\s*:\s*(?:fly|slide)/);
  });
});

// ---------------------------------------------------------------------------
// T9: Error panel slides in on mount (Plan step 4.1)
// ---------------------------------------------------------------------------
describe("T9: error_panel_slides_in_on_mount", () => {
  it("imports slide from svelte/transition", () => {
    const svelte = readSource(ERROR_PANEL);
    expect(svelte).toMatch(/import\s+\{[^}]*slide[^}]*\}\s+from\s+["']svelte\/transition["']/);
  });

  it("uses transition:slide on the .error-panel div", () => {
    const svelte = readSource(ERROR_PANEL);
    expect(svelte).toMatch(/transition\s*:\s*slide/);
  });
});

// ---------------------------------------------------------------------------
// T10: demo.mjs includes hard-gate.failed event (seq 7 constraint)
// ---------------------------------------------------------------------------
describe("T10: demo_includes_hard_gate_failed", () => {
  it("demo timeline contains a hard-gate.failed event", () => {
    const demo = readSource(DEMO_MJS);
    expect(demo).toMatch(/hard-gate\.failed/);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the CSS rule block for a given selector from Svelte <style> content.
 * Returns the content between the braces for the first matching selector.
 * Handles nested selectors by looking for the exact selector pattern.
 */
function extractStyleBlock(source: string, selector: string): string {
  // Escape special regex chars in selector
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the selector followed by optional whitespace and opening brace
  const re = new RegExp(escaped + "\\s*\\{", "g");
  const match = re.exec(source);
  if (!match) return "";

  const braceStart = match.index + match[0].length - 1;
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  return source.slice(braceStart, end + 1);
}
