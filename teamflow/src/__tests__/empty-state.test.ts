/**
 * Acceptance tests for Teamflow Empty State Screen feature.
 *
 * These are structural/source-code tests that verify the EmptyState component
 * exists with the correct structure and that App.svelte integrates it. They
 * read source files as plain text (no DOM, no browser) following the pattern
 * established in animation.test.ts and gate-visualization.test.ts.
 *
 * Plan: docs/plans/2026-04-01-teamflow-empty-state-plan.md
 * Tests: E1-E8
 */

import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { readSource, extractStyleBlock } from "./helpers.js";

// Resolve paths relative to the teamflow package root
const TEAMFLOW_ROOT = join(import.meta.dirname, "..", "..");
const EMPTY_STATE = join(TEAMFLOW_ROOT, "src", "client", "components", "EmptyState.svelte");
const APP_SVELTE = join(TEAMFLOW_ROOT, "src", "client", "App.svelte");

// ---------------------------------------------------------------------------
// E1: empty_state_component_exists
// Verifies: EmptyState.svelte exists with <script lang="ts">, $props(), and
// <style> sections
// ---------------------------------------------------------------------------
describe("E1: empty_state_component_exists", () => {
  it("EmptyState.svelte file exists and has a <script lang=\"ts\"> block", () => {
    const svelte = readSource(EMPTY_STATE);
    expect(svelte).toMatch(/<script\s+lang="ts">/);
  });

  it("EmptyState.svelte uses $props()", () => {
    const svelte = readSource(EMPTY_STATE);
    expect(svelte).toMatch(/\$props\(\)/);
  });

  it("EmptyState.svelte has a <style> block", () => {
    const svelte = readSource(EMPTY_STATE);
    expect(svelte).toMatch(/<style>/);
  });
});

// ---------------------------------------------------------------------------
// E2: empty_state_accepts_connected_prop
// Verifies: Props interface includes connected: boolean and destructures it
// from $props()
// ---------------------------------------------------------------------------
describe("E2: empty_state_accepts_connected_prop", () => {
  it("Props interface includes connected: boolean", () => {
    const svelte = readSource(EMPTY_STATE);
    expect(svelte).toMatch(/interface\s+Props\s*\{[^}]*connected\s*:\s*boolean/s);
  });

  it("destructures connected from $props()", () => {
    const svelte = readSource(EMPTY_STATE);
    const propsLine = svelte.match(/let\s+\{[^}]*\}\s*(?::\s*\w+)?\s*=\s*\$props\(\)/);
    expect(propsLine).not.toBeNull();
    expect(propsLine![0]).toContain("connected");
  });
});

// ---------------------------------------------------------------------------
// E3: empty_state_shows_connecting_message
// Verifies: Template contains "Connecting" text in an {#if !connected} branch
// ---------------------------------------------------------------------------
describe("E3: empty_state_shows_connecting_message", () => {
  it("template has an {#if !connected} branch", () => {
    const svelte = readSource(EMPTY_STATE);
    // Template part is before <style>
    const templatePart = svelte.split("<style>")[0];
    expect(templatePart).toMatch(/\{#if\s+!connected\}/);
  });

  it("the !connected branch contains Connecting text", () => {
    const svelte = readSource(EMPTY_STATE);
    const templatePart = svelte.split("<style>")[0];
    // Find the {#if !connected} section — everything before {:else} or {/if}
    const ifMatch = templatePart.match(/\{#if\s+!connected\}([\s\S]*?)(?:\{:else\}|\{\/if\})/);
    expect(ifMatch).not.toBeNull();
    expect(ifMatch![1]).toMatch(/Connecting/);
  });
});

// ---------------------------------------------------------------------------
// E4: empty_state_shows_no_pipeline_message
// Verifies: Template contains "No pipeline running" and "/team" text in the
// else branch
// ---------------------------------------------------------------------------
describe("E4: empty_state_shows_no_pipeline_message", () => {
  it("template has an {:else} branch", () => {
    const svelte = readSource(EMPTY_STATE);
    const templatePart = svelte.split("<style>")[0];
    expect(templatePart).toMatch(/\{:else\}/);
  });

  it("the else branch contains No pipeline running", () => {
    const svelte = readSource(EMPTY_STATE);
    const templatePart = svelte.split("<style>")[0];
    const elseMatch = templatePart.match(/\{:else\}([\s\S]*?)\{\/if\}/);
    expect(elseMatch).not.toBeNull();
    expect(elseMatch![1]).toMatch(/No pipeline running/);
  });

  it("the else branch contains /team call-to-action text", () => {
    const svelte = readSource(EMPTY_STATE);
    const templatePart = svelte.split("<style>")[0];
    const elseMatch = templatePart.match(/\{:else\}([\s\S]*?)\{\/if\}/);
    expect(elseMatch).not.toBeNull();
    expect(elseMatch![1]).toMatch(/\/team/);
  });
});

// ---------------------------------------------------------------------------
// E5: empty_state_uses_theme_variables
// Verifies: Scoped style block references --bg-secondary and --text-secondary
// ---------------------------------------------------------------------------
describe("E5: empty_state_uses_theme_variables", () => {
  it("style block references --bg-secondary", () => {
    const svelte = readSource(EMPTY_STATE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/--bg-secondary/);
  });

  it("style block references --text-secondary", () => {
    const svelte = readSource(EMPTY_STATE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/--text-secondary/);
  });
});

// ---------------------------------------------------------------------------
// E6: app_imports_empty_state
// Verifies: App.svelte imports EmptyState from components
// ---------------------------------------------------------------------------
describe("E6: app_imports_empty_state", () => {
  it("App.svelte imports EmptyState component", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/import\s+EmptyState\s+from\s+["']\.\/components\/EmptyState\.svelte["']/);
  });
});

// ---------------------------------------------------------------------------
// E7: app_uses_has_ever_connected_for_empty_state
// Verifies: App.svelte declares hasEverConnected as a $state and showEmptyState
// derived binding references hasEverConnected
// ---------------------------------------------------------------------------
describe("E7: app_uses_has_ever_connected_for_empty_state", () => {
  it("App.svelte declares hasEverConnected as $state", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/hasEverConnected\s*=\s*\$state\s*\(/);
  });

  it("App.svelte declares showEmptyState as $derived", () => {
    const svelte = readSource(APP_SVELTE);
    expect(svelte).toMatch(/showEmptyState\s*=\s*\$derived\s*\(/);
  });

  it("showEmptyState derived binding references hasEverConnected", () => {
    const svelte = readSource(APP_SVELTE);
    const derivedMatch = svelte.match(/showEmptyState\s*=\s*\$derived\s*\(([\s\S]*?)\)/);
    expect(derivedMatch).not.toBeNull();
    expect(derivedMatch![1]).toMatch(/hasEverConnected/);
  });
});

// ---------------------------------------------------------------------------
// E8: empty_state_spans_grid_rows
// Verifies: EmptyState.svelte style block contains grid-row property spanning
// rows 2 through 4 (e.g., grid-row: 2 / 4)
// ---------------------------------------------------------------------------
describe("E8: empty_state_spans_grid_rows", () => {
  it("EmptyState root element style block contains grid-row", () => {
    const svelte = readSource(EMPTY_STATE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    expect(styleBlock).toMatch(/grid-row\s*:/);
  });

  it("grid-row value spans rows 2 through 4", () => {
    const svelte = readSource(EMPTY_STATE);
    const styleStart = svelte.indexOf("<style>");
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = svelte.slice(styleStart);
    // Matches: grid-row: 2 / 4  or  grid-row: 2/4  or similar
    expect(styleBlock).toMatch(/grid-row\s*:\s*2\s*\/\s*4/);
  });
});
