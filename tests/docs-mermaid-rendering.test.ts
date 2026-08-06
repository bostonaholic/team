// tests/docs-mermaid-rendering.test.ts
//
// L2 tripwire (free, deterministic): the docs site renders its ```mermaid
// fenced blocks client-side, and that only works while four separate files
// agree. Jekyll ships a mermaid fence as a plain <pre><code>, so nothing here
// fails visibly in a build — a broken contract shows up only as a code block
// where a diagram should be, on a page nobody reruns locally.
//
// Per docs/testing.md ("A tripwire asserts a contract, never a wording") these
// assert the machine-read seams only: the script the layout loads, the selector
// and class names the JS and CSS share, the custom property they hand across,
// and the exact CDN version pin. Comments, palette, and spacing are free.
//
// Defensive reads: a missing file → "" so assertions FAIL cleanly rather than
// throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const DOCS = join(REPO_ROOT, "docs");
const LAYOUT = join(DOCS, "_layouts", "default.html");
const RENDERER = join(DOCS, "assets", "js", "mermaid.js");
const SITE_CSS = join(DOCS, "assets", "css", "site.css");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// Every ```mermaid fence body across the docs' markdown pages.
function mermaidFences(): { page: string; body: string }[] {
  const out: { page: string; body: string }[] = [];
  for (const entry of readdirSync(DOCS)) {
    if (!entry.endsWith(".md")) continue;
    const text = read(join(DOCS, entry));
    for (const match of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
      out.push({ page: entry, body: match[1]! });
    }
  }
  return out;
}

describe("docs site: the mermaid renderer is wired into the layout", () => {
  const layout = readIf(LAYOUT);

  test("every page loads the renderer", () => {
    expect(layout).toContain("assets/js/mermaid.js");
  });

  test("the renderer exists", () => {
    expect(existsSync(RENDERER)).toBe(true);
  });
});

describe("docs site: the renderer and the stylesheet agree", () => {
  const renderer = readIf(RENDERER);
  const css = readIf(SITE_CSS);

  // The JS creates the figure with this class and the CSS styles it. Renaming
  // one alone leaves diagrams unstyled, which no build step notices.
  test("the figure class the JS sets is styled", () => {
    expect(renderer).toContain('figure.className = "mermaid-figure"');
    expect(css).toContain(".mermaid-figure");
  });

  // The breakout for a diagram wider than the prose column: the JS decides,
  // the CSS applies. Both halves must name the same class.
  test("the breakout class the JS toggles is styled", () => {
    expect(renderer).toMatch(/classList\.(add|remove|toggle)\("is-wide"/);
    expect(css).toContain(".mermaid-figure.is-wide");
  });

  // The measured natural width crosses from JS to CSS through this property.
  test("the custom property the JS sets is consumed by the CSS", () => {
    expect(renderer).toContain('"--diagram-width"');
    expect(css).toContain("var(--diagram-width");
  });

  // Jekyll emits `<pre><code class="language-mermaid">`. A selector that stops
  // matching that shape silently renders nothing.
  test("the renderer targets the markup Jekyll emits", () => {
    expect(renderer).toContain("code.language-mermaid");
  });
});

describe("docs site: the mermaid dependency is pinned", () => {
  const renderer = readIf(RENDERER);

  // An exact version keeps a mermaid release from changing how the docs render
  // without a commit here. A floating tag would.
  test("the CDN URL carries an exact version", () => {
    expect(renderer).toMatch(/mermaid@\d+\.\d+\.\d+\//);
  });

  test("the CDN URL floats no tag", () => {
    expect(renderer).not.toMatch(/mermaid@(latest|next|\d+(\.\d+)?)\//);
  });
});

describe("docs site: every mermaid fence declares a diagram type", () => {
  // The renderer feeds a fence body straight to mermaid, which throws on a
  // body whose first directive it does not recognize — and that failure is
  // only visible in a browser. Catch a typo'd or empty fence here instead.
  const TYPES =
    /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|zenuml|sankey(-beta)?|xychart-beta|block-beta|packet-beta|architecture-beta|kanban|radar|treemap)\b/;

  const fences = mermaidFences();

  test("the docs carry at least one diagram", () => {
    expect(fences.length).toBeGreaterThan(0);
  });

  test.each(fences.map((fence, index) => [`${fence.page} #${index}`, fence]))(
    "%s opens with a mermaid diagram type",
    (_label, fence) => {
      const first = (fence as { body: string }).body
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("%%"));
      expect(first ?? "").toMatch(TYPES);
    }
  );
});
