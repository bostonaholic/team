// tests/build-release-feed.test.ts
//
// Acceptance fence for Slice 1 of docs/plans/2026-08-28-rss-release-feed —
// the RSS 2.0 release feed served at /rss.xml.
//
// Two halves, both free and deterministic (docs/testing.md):
//
// - L1 pure unit on the exported builder `buildReleaseFeed(releases, siteUrl)`.
//   The builder is a pure f(input) -> XML string: no network, no clock, no
//   filesystem, so every channel value, the ordering, the two filter
//   predicates, the field contract, and the single-escape contract are pinned
//   here for microseconds (design.md:73-90, :363-398, :593-620).
//
// - L1 subprocess on the thin CLI in the same file. The five structural
//   failures (malformed stdin, non-array payload, missing site URL, an empty
//   array, and a payload where no item carries a `body_html` key) must each
//   exit non-zero, print nothing on stdout, and print `::error::` on stderr,
//   matching .github/scripts/pr-title-version.sh:26.
//
// Defensive load: `scripts/build-release-feed.ts` is imported dynamically
// behind an existence assertion, so a not-yet-written module FAILS an
// assertion rather than throwing at import time (the mechanical gate rejects
// crashes).
//
// Escaping and control-character assertions each carry a positive control in
// the shape of tests/changelog-links.test.ts:52-60 — a check that finds
// nothing has not distinguished "absent" from "blind"
// (docs/testing.md:172-212).

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = join(import.meta.dir, "..");
const BUILDER = join(REPO_ROOT, "scripts", "build-release-feed.ts");

// A fixture site URL, deliberately NOT the production one: the builder takes
// the origin as an argument (the bash wrapper prints it), so a hardcoded
// team.bostonaholic.dev anywhere in the output would fail these assertions.
const SITE_URL = "https://feed.example.test";

// Declared locally rather than imported, so this file typechecks before
// scripts/build-release-feed.ts exists.
type BuildReleaseFeed = (releases: unknown[], siteUrl: string) => string;

type ReleaseFixture = {
  tag_name?: string | null;
  name?: string | null;
  html_url?: string | null;
  published_at?: string | null;
  draft?: boolean;
  body_html?: string | null;
};

/**
 * Load the exported builder. The existence + type assertions come FIRST so a
 * missing module or a missing export surfaces as a failed assertion instead of
 * an unhandled import throw.
 */
async function loadBuilder(): Promise<BuildReleaseFeed> {
  expect(existsSync(BUILDER)).toBe(true);
  const mod = (await import(pathToFileURL(BUILDER).href)) as {
    buildReleaseFeed?: unknown;
  };
  expect(typeof mod.buildReleaseFeed).toBe("function");
  return mod.buildReleaseFeed as BuildReleaseFeed;
}

function release(over: ReleaseFixture = {}): ReleaseFixture {
  return {
    tag_name: "v1.0.0",
    name: "v1.0.0",
    html_url: "https://github.com/bostonaholic/team/releases/tag/v1.0.0",
    published_at: "2026-08-27T20:26:05Z",
    draft: false,
    body_html: "<h3>Fixed</h3>",
    ...over,
  };
}

// --- document readers -------------------------------------------------------

function itemBlocks(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1] ?? "");
}

function descriptionOf(itemXml: string): string {
  return /<description>([\s\S]*?)<\/description>/.exec(itemXml)?.[1] ?? "";
}

function elementOf(itemXml: string, tag: string): string {
  return new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(itemXml)?.[1] ?? "";
}

/** One XML decode. `&amp;` resolves LAST so the pass is genuinely single. */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// C0 controls XML 1.0 forbids — tab (09), newline (0A), and carriage return
// (0D) are the permitted three and are excluded from the class.
const FORBIDDEN_C0 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

// --- L1 unit: channel -------------------------------------------------------

describe("buildReleaseFeed: channel (design.md:73-80)", () => {
  test("carries the four pinned channel values verbatim", async () => {
    const build = await loadBuilder();
    const xml = build([release()], SITE_URL);

    expect(xml).toContain("<title>Team releases</title>");
    expect(xml).toContain(`<link>${SITE_URL}/</link>`);
    expect(xml).toContain(
      "<description>New releases of Team, a Claude Code plugin for autonomous feature delivery.</description>",
    );
    expect(xml).toContain("<language>en-us</language>");
  });

  test("declares xmlns:atom on the root element and a self atom:link", async () => {
    const build = await loadBuilder();
    const xml = build([release()], SITE_URL);

    const root = /<rss\b[^>]*>/.exec(xml)?.[0] ?? "";
    expect(root).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');

    const atomLink = /<atom:link\b[^>]*\/?>/.exec(xml)?.[0] ?? "";
    expect(atomLink).toContain(`href="${SITE_URL}/rss.xml"`);
    expect(atomLink).toContain('rel="self"');
    expect(atomLink).toContain('type="application/rss+xml"');
  });

  test("omits lastBuildDate (decision 13: no false claim, stable bytes)", async () => {
    const build = await loadBuilder();
    const xml = build([release()], SITE_URL);

    // Guard the absence check: a builder that returned "" would pass the
    // negative vacuously.
    expect(xml).toContain("<channel>");
    expect(xml).not.toMatch(/lastbuilddate/i);
  });
});

// --- L1 unit: ordering ------------------------------------------------------

describe("buildReleaseFeed: ordering (design.md:383-398)", () => {
  test("sorts items by published_at descending, not API order", async () => {
    const build = await loadBuilder();
    const xml = build(
      [
        release({ tag_name: "v0.2.0", name: "v0.2.0", published_at: "2026-05-06T19:22:07Z" }),
        release({ tag_name: "v0.58.0", name: "v0.58.0", published_at: "2026-08-27T20:26:05Z" }),
        release({ tag_name: "v0.30.0", name: "v0.30.0", published_at: "2026-07-01T00:00:00Z" }),
      ],
      SITE_URL,
    );

    const titles = itemBlocks(xml).map((item) => elementOf(item, "title"));
    expect(titles).toEqual(["v0.58.0", "v0.30.0", "v0.2.0"]);
  });

  test("breaks a published_at tie by plain lexicographic descending tag_name", async () => {
    const build = await loadBuilder();
    // Same instant to the second. Descending string comparison puts "v0.9.0"
    // ahead of "v0.10.0" ('9' > '1'); a semver-aware comparator would not.
    // Decision 13 pins the plain lexicographic one — no semver dependency.
    const xml = build(
      [
        release({ tag_name: "v0.10.0", name: "v0.10.0", published_at: "2026-07-01T00:00:00Z" }),
        release({ tag_name: "v0.9.0", name: "v0.9.0", published_at: "2026-07-01T00:00:00Z" }),
      ],
      SITE_URL,
    );

    const titles = itemBlocks(xml).map((item) => elementOf(item, "title"));
    expect(titles).toEqual(["v0.9.0", "v0.10.0"]);
  });
});

// --- L1 unit: filters -------------------------------------------------------

describe("buildReleaseFeed: filters (decision 12)", () => {
  test("drops a release whose published_at is null (never published)", async () => {
    const build = await loadBuilder();
    const xml = build(
      [
        release({ tag_name: "v1.0.0", name: "kept" }),
        release({ tag_name: "v0.9.0", name: "never-published", published_at: null }),
      ],
      SITE_URL,
    );

    const titles = itemBlocks(xml).map((item) => elementOf(item, "title"));
    expect(titles).toEqual(["kept"]);
  });

  test("drops a draft release even when published_at is non-null (re-drafted)", async () => {
    const build = await loadBuilder();
    // The case the date predicate alone cannot cover: published, then
    // converted back to a draft, keeping its original timestamp.
    const xml = build(
      [
        release({ tag_name: "v1.0.0", name: "kept" }),
        release({
          tag_name: "v0.9.0",
          name: "re-drafted",
          draft: true,
          published_at: "2026-08-01T00:00:00Z",
        }),
      ],
      SITE_URL,
    );

    const titles = itemBlocks(xml).map((item) => elementOf(item, "title"));
    expect(titles).toEqual(["kept"]);
  });
});

// --- L1 unit: item field contract -------------------------------------------

describe("buildReleaseFeed: item field contract (design.md:593-620)", () => {
  test("maps name, html_url, and published_at onto title, link, guid, pubDate", async () => {
    const build = await loadBuilder();
    const xml = build(
      [
        release({
          name: "v0.58.0",
          tag_name: "v0.58.0",
          html_url: "https://github.com/bostonaholic/team/releases/tag/v0.58.0",
          published_at: "2026-08-27T20:26:05Z",
        }),
      ],
      SITE_URL,
    );

    const item = itemBlocks(xml)[0] ?? "";
    expect(elementOf(item, "title")).toBe("v0.58.0");
    expect(elementOf(item, "link")).toBe(
      "https://github.com/bostonaholic/team/releases/tag/v0.58.0",
    );
    expect(item).toContain(
      '<guid isPermaLink="true">https://github.com/bostonaholic/team/releases/tag/v0.58.0</guid>',
    );

    const pubDate = elementOf(item, "pubDate");
    // RFC-822, UTC, locale-independent.
    expect(pubDate).toMatch(
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} (GMT|\+0000)$/,
    );
    expect(new Date(pubDate).toISOString()).toBe("2026-08-27T20:26:05.000Z");
  });

  test("falls back to tag_name when name is null", async () => {
    const build = await loadBuilder();
    const xml = build([release({ name: null, tag_name: "v0.42.0" })], SITE_URL);

    expect(elementOf(itemBlocks(xml)[0] ?? "", "title")).toBe("v0.42.0");
  });

  test("emits an empty description when body_html is null", async () => {
    const build = await loadBuilder();
    const xml = build([release({ body_html: null })], SITE_URL);

    const item = itemBlocks(xml)[0] ?? "";
    // The item survives; only its description is empty.
    expect(elementOf(item, "title")).toBe("v1.0.0");
    expect(descriptionOf(item)).toBe("");
  });

  test("throws when a release is missing tag_name", async () => {
    const build = await loadBuilder();
    const missing: Record<string, unknown> = {
      name: "v1.0.0",
      html_url: "https://github.com/bostonaholic/team/releases/tag/v1.0.0",
      published_at: "2026-08-27T20:26:05Z",
      body_html: "<p>x</p>",
    };
    expect(() => build([missing], SITE_URL)).toThrow();
  });

  test("throws when a release is missing html_url", async () => {
    const build = await loadBuilder();
    const missing: Record<string, unknown> = {
      tag_name: "v1.0.0",
      name: "v1.0.0",
      published_at: "2026-08-27T20:26:05Z",
      body_html: "<p>x</p>",
    };
    expect(() => build([missing], SITE_URL)).toThrow();
  });

  test("throws when a release is missing published_at", async () => {
    const build = await loadBuilder();
    const missing: Record<string, unknown> = {
      tag_name: "v1.0.0",
      name: "v1.0.0",
      html_url: "https://github.com/bostonaholic/team/releases/tag/v1.0.0",
      body_html: "<p>x</p>",
    };
    expect(() => build([missing], SITE_URL)).toThrow();
  });

  test("throws on an unparseable published_at rather than coercing it", async () => {
    const build = await loadBuilder();
    expect(() => build([release({ published_at: "not-a-date" })], SITE_URL)).toThrow();
  });
});

// --- L1 unit: single-escape contract (decision 10) --------------------------

describe("buildReleaseFeed: body_html is XML-escaped exactly once (decision 10)", () => {
  test("escapes markup once: <h3>Fixed</h3> becomes &lt;h3&gt;Fixed&lt;/h3&gt;", async () => {
    const build = await loadBuilder();
    const xml = build([release({ body_html: "<h3>Fixed</h3>" })], SITE_URL);

    const description = descriptionOf(itemBlocks(xml)[0] ?? "");
    expect(description).toContain("&lt;h3&gt;Fixed&lt;/h3&gt;");
    expect(description).not.toContain("&amp;lt;");
  });

  test("escapes GitHub's own entity once: &amp; becomes &amp;amp;", async () => {
    const build = await loadBuilder();
    const xml = build([release({ body_html: "<p>a &amp; b</p>" })], SITE_URL);

    const description = descriptionOf(itemBlocks(xml)[0] ?? "");
    expect(description).toContain("&amp;amp;");
  });

  test("one XML decode returns the fixture body_html byte for byte", async () => {
    const build = await loadBuilder();
    const body = '<h3>Fixed</h3><ul><li><strong>a &amp; b</strong> <a href="https://x.test/?q=1&amp;r=2">link</a></li></ul>';
    const xml = build([release({ body_html: body })], SITE_URL);

    const description = descriptionOf(itemBlocks(xml)[0] ?? "");
    expect(decodeXml(description)).toBe(body);
  });

  test("never emits a CDATA section", async () => {
    const build = await loadBuilder();
    const xml = build([release({ body_html: "<p>a ]]> b</p>" })], SITE_URL);

    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<![CDATA[");
  });

  test("strips C0 controls, keeping tab, newline, and carriage return", async () => {
    const build = await loadBuilder();
    const xml = build(
      [release({ body_html: "<p>a\u0000b\u0007c</p>\t\n\r<p>d</p>" })],
      SITE_URL,
    );

    const description = descriptionOf(itemBlocks(xml)[0] ?? "");
    expect(description).not.toMatch(FORBIDDEN_C0);
    expect(description).toContain("\t");
  });
});

describe("buildReleaseFeed: escape matchers can find a positive (guard the guard)", () => {
  // Every assertion above is only as good as these readers and matchers. Point
  // each at a known-bad document and watch it fire, so a refactor cannot turn
  // the tripwires above into permanently green no-ops.
  const doubleEscaped =
    "<rss><channel><item><description>&amp;lt;h3&amp;gt;Fixed&amp;lt;/h3&amp;gt;</description></item></channel></rss>";

  test("itemBlocks and descriptionOf actually read a planted item", () => {
    expect(itemBlocks(doubleEscaped)).toHaveLength(1);
    expect(descriptionOf(itemBlocks(doubleEscaped)[0] ?? "")).toContain("&amp;lt;");
  });

  test("the double-escape check fires on a double-escaped description", () => {
    const description = descriptionOf(itemBlocks(doubleEscaped)[0] ?? "");
    expect(description).toContain("&amp;lt;");
    expect(description).not.toContain("&lt;h3&gt;Fixed&lt;/h3&gt;");
  });

  test("one decode recovers a single escape and does NOT recover a double one", () => {
    expect(decodeXml("&lt;h3&gt;Fixed&lt;/h3&gt;")).toBe("<h3>Fixed</h3>");
    expect(decodeXml("&amp;lt;h3&amp;gt;")).toBe("&lt;h3&gt;");
    expect(decodeXml("&amp;lt;h3&amp;gt;")).not.toBe("<h3>");
  });

  test("the C0 matcher sees a forbidden control and passes the permitted three", () => {
    expect(FORBIDDEN_C0.test("a\u0000b")).toBe(true);
    expect(FORBIDDEN_C0.test("a\u001Fb")).toBe(true);
    expect(FORBIDDEN_C0.test("a\tb\nc\rd")).toBe(false);
  });
});

// --- L1 subprocess: the CLI fails loud --------------------------------------

function runCli(args: string[], stdin: string) {
  // Existence assertion first: a missing script must fail an assertion, not
  // pass this suite by exiting non-zero for the wrong reason.
  expect(existsSync(BUILDER)).toBe(true);
  const result = spawnSync("bun", [BUILDER, ...args], {
    encoding: "utf8",
    input: stdin,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const VALID_PAYLOAD = JSON.stringify([release()]);

describe("build-release-feed CLI: structural guards fail loud (design.md:589-613)", () => {
  test("malformed stdin exits non-zero with ::error:: and no stdout", () => {
    const { status, stdout, stderr } = runCli([SITE_URL], "{not json");

    expect(status).not.toBe(0);
    expect(stdout.trim()).toBe("");
    expect(/^::error::/m.test(stderr)).toBe(true);
  });

  test("a non-array payload exits non-zero with ::error:: and no stdout", () => {
    const { status, stdout, stderr } = runCli([SITE_URL], '{"releases": []}');

    expect(status).not.toBe(0);
    expect(stdout.trim()).toBe("");
    expect(/^::error::/m.test(stderr)).toBe(true);
  });

  test("a missing site-URL argument exits non-zero with ::error:: and no stdout", () => {
    const { status, stdout, stderr } = runCli([], VALID_PAYLOAD);

    expect(status).not.toBe(0);
    expect(stdout.trim()).toBe("");
    expect(/^::error::/m.test(stderr)).toBe(true);
  });

  test("an empty array exits non-zero with ::error:: and no stdout", () => {
    // An empty feed would be a silent regression, so zero releases is fatal.
    const { status, stdout, stderr } = runCli([SITE_URL], "[]");

    expect(status).not.toBe(0);
    expect(stdout.trim()).toBe("");
    expect(/^::error::/m.test(stderr)).toBe(true);
  });

  test("a payload where no item carries body_html exits non-zero with ::error::", () => {
    // The dropped-Accept-header case: emitting 80 empty descriptions would
    // look like a working feed (design.md:610-613).
    const payload = JSON.stringify([
      {
        tag_name: "v1.0.0",
        name: "v1.0.0",
        html_url: "https://github.com/bostonaholic/team/releases/tag/v1.0.0",
        published_at: "2026-08-27T20:26:05Z",
        draft: false,
      },
    ]);
    const { status, stdout, stderr } = runCli([SITE_URL], payload);

    expect(status).not.toBe(0);
    expect(stdout.trim()).toBe("");
    expect(/^::error::/m.test(stderr)).toBe(true);
  });
});

describe("build-release-feed CLI: the happy path prints only XML", () => {
  test("a valid payload exits 0 and prints the feed on stdout", () => {
    // Guards the guard for the five failure cases above: prove the CLI can
    // succeed, so "exits non-zero" is never a vacuous pass.
    const { status, stdout } = runCli([SITE_URL], VALID_PAYLOAD);

    expect(status).toBe(0);
    expect(stdout).toContain("<title>Team releases</title>");
    expect(itemBlocks(stdout)).toHaveLength(1);
  });
});
