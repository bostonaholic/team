// tests/site-feed-links.test.ts
//
// Acceptance fence for feed discovery from the site.
//
// L2 tripwire (free, deterministic): the autodiscovery `<link>` in
// docs/_layouts/default.html and the visible rss link in
// docs/_includes/footer.html. Both hrefs must be built with Jekyll's
// `relative_url` filter, exactly like every other internal path in the
// layout — a hardcoded absolute URL would freeze the domain into the markup
// and diverge from the local preview.
//
// Defensive reads: a missing file → "" so content assertions FAIL cleanly
// rather than throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const LAYOUT = join(REPO_ROOT, "docs", "_layouts", "default.html");
const FOOTER = join(REPO_ROOT, "docs", "_includes", "footer.html");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

/** The first tag whose attributes mention the feed path. */
function tagLinkingTheFeed(html: string, tagName: string): string {
  const re = new RegExp(`<${tagName}\\b[^>]*rss\\.xml[^>]*>`);
  return re.exec(html)?.[0] ?? "";
}

function hrefOf(tag: string): string {
  return /href="([^"]*)"/.exec(tag)?.[1] ?? "";
}

// The href contract: the feed path routed through Jekyll's `relative_url`
// filter. A hardcoded absolute URL freezes the domain into the markup and
// diverges from the local preview.
const FEED_HREF = /\{\{\s*['"]\/rss\.xml['"]\s*\|\s*relative_url\s*\}\}/;
const ABSOLUTE_URL = /^https?:\/\//;

describe("site: the feed is offered by autodiscovery (docs/_layouts/default.html)", () => {
  const layout = readIf(LAYOUT);

  test("docs/_layouts/default.html exists", () => {
    expect(existsSync(LAYOUT)).toBe(true);
  });

  test("the head carries an RSS autodiscovery link with the pinned attributes", () => {
    const tag = tagLinkingTheFeed(layout, "link");
    // Guard the guard: a missing tag would pass every attribute check below
    // vacuously.
    expect(tag.length).toBeGreaterThan(0);

    expect(tag).toContain('rel="alternate"');
    expect(tag).toContain('type="application/rss+xml"');
    expect(tag).toContain('title="Team releases"');
  });

  test("the autodiscovery href is built with relative_url, not a hardcoded URL", () => {
    const href = hrefOf(tagLinkingTheFeed(layout, "link"));

    expect(href).toMatch(FEED_HREF);
    expect(href).not.toMatch(ABSOLUTE_URL);
  });
});

describe("site: the footer carries a visible feed link (docs/_includes/footer.html)", () => {
  const footer = readIf(FOOTER);

  test("docs/_includes/footer.html exists", () => {
    expect(existsSync(FOOTER)).toBe(true);
  });

  test("the footer links to the feed through relative_url", () => {
    const href = hrefOf(tagLinkingTheFeed(footer, "a"));

    expect(href).toMatch(FEED_HREF);
    expect(href).not.toMatch(ABSOLUTE_URL);
  });
});

describe("site: the href matcher can find a positive (guard the guard)", () => {
  // A matcher that never fails is not a tripwire. Point it at the exact shapes
  // it exists to reject and watch it fire.
  test("rejects a hardcoded absolute feed URL", () => {
    expect(FEED_HREF.test("https://team.bostonaholic.dev/rss.xml")).toBe(false);
    expect(ABSOLUTE_URL.test("https://team.bostonaholic.dev/rss.xml")).toBe(true);
  });

  test("rejects a relative_url href that points somewhere other than the feed", () => {
    expect(FEED_HREF.test("{{ '/assets/css/site.css' | relative_url }}")).toBe(false);
  });

  test("accepts the relative_url form the site actually uses", () => {
    expect(FEED_HREF.test("{{ '/rss.xml' | relative_url }}")).toBe(true);
    expect(FEED_HREF.test('{{ "/rss.xml" | relative_url }}')).toBe(true);
  });
});
