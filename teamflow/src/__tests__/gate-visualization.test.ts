/**
 * Acceptance tests for Orchestrator Pipeline Visualization — UI Structure.
 *
 * These are structural/source-code tests that verify gate visualization
 * elements exist in the correct Svelte components and demo script. They read
 * source files as plain text (no DOM, no browser) following the pattern
 * established in animation.test.ts.
 *
 * Plan: docs/plans/2026-03-29-orchestrator-pipeline-visualization-plan.md
 * Tests: T6-T10
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Resolve paths relative to the teamflow package root
const TEAMFLOW_ROOT = join(import.meta.dirname, "..", "..");
const PHASE_CARDS = join(TEAMFLOW_ROOT, "src", "client", "components", "PhaseCards.svelte");
const DEMO_MJS = join(TEAMFLOW_ROOT, "bin", "demo.mjs");

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

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

// ---------------------------------------------------------------------------
// T6: phase_cards_accepts_gates_prop
// Verifies: PhaseCards.svelte script block destructures a `gates` property
// from $props()
// ---------------------------------------------------------------------------
describe("T6: phase_cards_accepts_gates_prop", () => {
  it("destructures gates from $props()", () => {
    const svelte = readSource(PHASE_CARDS);
    // The $props() destructuring should include `gates`
    // Pattern: let { ..., gates, ... }: Props = $props()
    // or: let { ..., gates }: Props = $props()
    expect(svelte).toMatch(/\$props\(\)/);
    // Look for gates in the destructuring pattern
    const propsLine = svelte.match(/let\s+\{[^}]*\}\s*(?::\s*\w+)?\s*=\s*\$props\(\)/);
    expect(propsLine).not.toBeNull();
    expect(propsLine![0]).toContain("gates");
  });

  it("Props interface includes gates field", () => {
    const svelte = readSource(PHASE_CARDS);
    // Should have gates in the Props interface
    expect(svelte).toMatch(/interface\s+Props\s*\{[^}]*gates\s*:/s);
  });
});

// ---------------------------------------------------------------------------
// T7: phase_cards_renders_gate_row
// Verifies: PhaseCards.svelte template contains a .gate-row element
// ---------------------------------------------------------------------------
describe("T7: phase_cards_renders_gate_row", () => {
  it("template contains a gate-row CSS class", () => {
    const svelte = readSource(PHASE_CARDS);
    // Look for class="gate-row" in the template (outside of <style>)
    const templatePart = svelte.split("<style>")[0];
    expect(templatePart).toMatch(/class="gate-row/);
  });

  it("gate-row contains a gate type label element", () => {
    const svelte = readSource(PHASE_CARDS);
    const templatePart = svelte.split("<style>")[0];
    expect(templatePart).toMatch(/gate-label/);
  });
});

// ---------------------------------------------------------------------------
// T8: gate_row_has_css_styles
// Verifies: PhaseCards.svelte style block contains .gate-row with layout
// properties
// ---------------------------------------------------------------------------
describe("T8: gate_row_has_css_styles", () => {
  it(".gate-row style block exists", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-row");
    expect(block).not.toBe("");
  });

  it(".gate-row has display: flex", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-row");
    expect(block).toMatch(/display\s*:\s*flex/);
  });

  it(".gate-row has a top border separator", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-row");
    expect(block).toMatch(/border-top\s*:/);
  });

  it(".gate-label style block exists with font-size", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-label");
    expect(block).not.toBe("");
    expect(block).toMatch(/font-size\s*:/);
  });
});

// ---------------------------------------------------------------------------
// T9: gate_arrow_has_status_classes
// Verifies: PhaseCards.svelte style block contains .gate-arrow.passed and
// .gate-arrow.failed
// ---------------------------------------------------------------------------
describe("T9: gate_arrow_has_status_classes", () => {
  it(".gate-arrow.passed style block exists", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-arrow.passed");
    expect(block).not.toBe("");
  });

  it(".gate-arrow.failed style block exists", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-arrow.failed");
    expect(block).not.toBe("");
  });

  it(".gate-arrow.waiting style block exists", () => {
    const svelte = readSource(PHASE_CARDS);
    const block = extractStyleBlock(svelte, ".gate-arrow.waiting");
    expect(block).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// T10: demo_emits_all_gate_trigger_events
// Verifies: demo.mjs contains plan.approved, tests.confirmed-failing,
// hard-gate.failed, and verification.passed
// ---------------------------------------------------------------------------
describe("T10: demo_emits_all_gate_trigger_events", () => {
  it("demo contains plan.approved event", () => {
    const demo = readSource(DEMO_MJS);
    expect(demo).toMatch(/plan\.approved/);
  });

  it("demo contains tests.confirmed-failing event", () => {
    const demo = readSource(DEMO_MJS);
    expect(demo).toMatch(/tests\.confirmed-failing/);
  });

  it("demo contains hard-gate.failed event", () => {
    const demo = readSource(DEMO_MJS);
    expect(demo).toMatch(/hard-gate\.failed/);
  });

  it("demo contains verification.passed event", () => {
    const demo = readSource(DEMO_MJS);
    expect(demo).toMatch(/verification\.passed/);
  });
});
