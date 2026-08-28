// tests/build-release-feed-wrapper.test.ts
//
// Acceptance fence for Slice 1 of docs/plans/2026-08-28-rss-release-feed —
// the bash side-effect wrapper `script/build-release-feed`.
//
// L3 in-process integration (docs/testing.md:218-224): free, fast, and the
// cheapest layer that can catch what a source-pattern assertion cannot — a
// wrong working directory, a quote that survived the YAML parse, a broken
// `jq -s 'add'` flatten, or a partial write. So this file EXECUTES the
// wrapper.
//
// Hermetic by construction (docs/testing.md §8): every case builds its own
// temp tree keyed by `pid`, copies the wrapper and the CLI in at their real
// relative paths so decision 6's root anchoring resolves there, writes a
// fixture `docs/_config.yml`, puts a stub `gh` first on PATH that records its
// argv, and invokes the wrapper from an UNRELATED working directory. Nothing
// touches the network, the real repo, or the real `docs/rss.xml`.
//
// The `CI` variable is cleared explicitly for the local-branch cases:
// harness-checks.yml:80 runs `bun test` inside GitHub Actions, where `CI` is
// set and every child inherits it (design.md:443-447). Without the clear, the
// exit-0 assertion passes locally and fails in CI.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const WRAPPER_SRC = join(REPO_ROOT, "script", "build-release-feed");
const CLI_SRC = join(REPO_ROOT, "scripts", "build-release-feed.ts");

// The wrapper shells out to all five. A missing one is an environment gap,
// never a defect in the code under test, so the suite skips rather than
// reporting a red that means nothing (the `describe.if` shape at
// tests/pr-title-version.test.ts:109).
const REQUIRED_TOOLS = ["bash", "bun", "jq", "ruby", "xmllint"];
const HAS_TOOLS = REQUIRED_TOOLS.every(
  (tool) => spawnSync(tool, ["--version"], { encoding: "utf8" }).status === 0,
);

const FIXTURE_BODY_HTML =
  '<h3>Fixed</h3><ul><li><strong>a &amp; b</strong> <a href="https://x.test/?q=1&amp;r=2">link</a></li></ul>';

function fixtureRelease(tag: string, publishedAt: string) {
  return {
    tag_name: tag,
    name: tag,
    html_url: `https://github.com/bostonaholic/team/releases/tag/${tag}`,
    published_at: publishedAt,
    draft: false,
    prerelease: false,
    body_html: FIXTURE_BODY_HTML,
  };
}

// `gh api --paginate` prints ONE JSON array PER PAGE, which is why the wrapper
// flattens with `jq -s 'add'`. Two pages here, three items total.
const PAGE_ONE = JSON.stringify([
  fixtureRelease("v0.58.0", "2026-08-27T20:26:05Z"),
  fixtureRelease("v0.57.0", "2026-08-20T10:00:00Z"),
]);
const PAGE_TWO = JSON.stringify([fixtureRelease("v0.56.0", "2026-08-10T10:00:00Z")]);

// Double-quoted AND slash-suffixed, the two shapes that broke earlier design
// rounds: the quotes must not survive the YAML parse and the trailing slash
// must not produce `https://host//rss.xml`.
const CONFIG_OK = 'title: Team\nurl: "https://feed.example.test/"\nbaseurl: ""\n';

// An unterminated double-quoted scalar: Ruby's YAML load RAISES here, and the
// raise must route through the wrapper's `die()` as a real annotation rather
// than aborting under `set -e` with a backtrace (design-review-5.md:22).
const CONFIG_MALFORMED = 'title: Team\nurl: "https://feed.example.test\nbaseurl: ""\n';

function ghStub(argvLog: string, pages: string[]): string {
  return [
    "#!/usr/bin/env bash",
    `for arg in "$@"; do printf '%s\\n' "$arg" >> ${JSON.stringify(argvLog)}; done`,
    "cat <<'GH_PAGES'",
    ...pages,
    "GH_PAGES",
  ].join("\n");
}

function failingGhStub(argvLog: string): string {
  return [
    "#!/usr/bin/env bash",
    `for arg in "$@"; do printf '%s\\n' "$arg" >> ${JSON.stringify(argvLog)}; done`,
    "printf 'gh: could not reach api.github.com\\n' >&2",
    "exit 1",
  ].join("\n");
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

type Tree = { root: string; feed: string; argvLog: string };

/**
 * Build the hermetic tree. The existence assertions come FIRST so a
 * not-yet-written wrapper or CLI fails an assertion instead of throwing out of
 * copyFileSync.
 */
function makeTree(opts: { config?: string; gh?: (log: string) => string } = {}): Tree {
  expect(existsSync(WRAPPER_SRC)).toBe(true);
  expect(existsSync(CLI_SRC)).toBe(true);

  const root = mkdtempSync(join(tmpdir(), `rss-wrapper-${process.pid}-`));
  tempDirs.push(root);

  for (const dir of ["script", "scripts", "docs", "stub-bin", "elsewhere"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }

  const wrapper = join(root, "script", "build-release-feed");
  copyFileSync(WRAPPER_SRC, wrapper);
  chmodSync(wrapper, 0o755);
  copyFileSync(CLI_SRC, join(root, "scripts", "build-release-feed.ts"));

  writeFileSync(join(root, "docs", "_config.yml"), opts.config ?? CONFIG_OK);

  const argvLog = join(root, "gh-argv.txt");
  const gh = join(root, "stub-bin", "gh");
  writeFileSync(gh, (opts.gh ?? ((log) => ghStub(log, [PAGE_ONE, PAGE_TWO])))(argvLog));
  chmodSync(gh, 0o755);

  return { root, feed: join(root, "docs", "rss.xml"), argvLog };
}

/** Run the wrapper from an unrelated cwd. `ci: false` clears inherited CI. */
function runWrapper(tree: Tree, opts: { ci: boolean }) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "CI" || value === undefined) continue;
    env[key] = value;
  }
  env.PATH = `${join(tree.root, "stub-bin")}:${process.env.PATH ?? ""}`;
  if (opts.ci) env.CI = "1";

  const result = spawnSync(join(tree.root, "script", "build-release-feed"), [], {
    // Deliberately NOT the tree root: decision 6 anchors every path at the
    // script's own location, so the wrapper must be correct from anywhere.
    cwd: join(tree.root, "elsewhere"),
    encoding: "utf8",
    env,
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function itemBlocks(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1] ?? "");
}

function descriptionOf(itemXml: string): string {
  return /<description>([\s\S]*?)<\/description>/.exec(itemXml)?.[1] ?? "";
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

/** The channel `<link>`: the first one, before any `<item>`. */
function channelLink(xml: string): string {
  const channel = xml.split("<item>")[0] ?? "";
  return /<link>([^<]*)<\/link>/.exec(channel)?.[1] ?? "";
}

function selfHref(xml: string): string {
  return /<atom:link\b[^>]*href="([^"]*)"/.exec(xml)?.[1] ?? "";
}

// The two shapes an unvalidated `url:` used to leak into the feed: a quote
// that survived the YAML read, and a `//` left by naive slash stripping.
const STRAY_QUOTE = /["']/;
const DOUBLE_SLASH_AFTER_SCHEME = /^[a-z]+:\/\/[^\s]*\/\//;

describe.if(HAS_TOOLS)("script/build-release-feed: a successful run", () => {
  test("writes docs/rss.xml when invoked from an unrelated working directory", () => {
    const tree = makeTree();
    const { status, output } = runWrapper(tree, { ci: true });

    expect(status).toBe(0);
    expect(output).not.toContain("::error::");
    expect(existsSync(tree.feed)).toBe(true);
  });

  test("derives the channel link and self href from the quoted, slash-suffixed url", () => {
    const tree = makeTree();
    runWrapper(tree, { ci: true });
    expect(existsSync(tree.feed)).toBe(true);
    const xml = readFileSync(tree.feed, "utf8");

    expect(channelLink(xml)).toBe("https://feed.example.test/");
    expect(selfHref(xml)).toBe("https://feed.example.test/rss.xml");
  });

  test("neither URL carries a stray quote or a double slash after the scheme", () => {
    const tree = makeTree();
    runWrapper(tree, { ci: true });
    expect(existsSync(tree.feed)).toBe(true);
    const xml = readFileSync(tree.feed, "utf8");

    const link = channelLink(xml);
    const self = selfHref(xml);

    // Guard the guard: an empty URL would pass both matchers vacuously.
    expect(link.length).toBeGreaterThan(0);
    expect(link).not.toMatch(STRAY_QUOTE);
    expect(link).not.toMatch(DOUBLE_SLASH_AFTER_SCHEME);

    expect(self.length).toBeGreaterThan(0);
    expect(self).not.toMatch(STRAY_QUOTE);
    expect(self).not.toMatch(DOUBLE_SLASH_AFTER_SCHEME);
  });

  test("positive control: the URL matchers fire on a bad URL", () => {
    expect(STRAY_QUOTE.test('"https://feed.example.test"')).toBe(true);
    expect(DOUBLE_SLASH_AFTER_SCHEME.test("https://feed.example.test//rss.xml")).toBe(true);
    expect(STRAY_QUOTE.test("https://feed.example.test/rss.xml")).toBe(false);
    expect(DOUBLE_SLASH_AFTER_SCHEME.test("https://feed.example.test/rss.xml")).toBe(false);
  });

  test("flattens every page of the paginated response into one item list", () => {
    const tree = makeTree();
    runWrapper(tree, { ci: true });
    expect(existsSync(tree.feed)).toBe(true);
    const xml = readFileSync(tree.feed, "utf8");

    // Two pages, two items then one — a broken `jq -s 'add'` yields 2, not 3.
    expect(itemBlocks(xml)).toHaveLength(3);
  });

  test("requests GitHub's rendered HTML media type on the fetch", () => {
    const tree = makeTree();
    runWrapper(tree, { ci: true });
    expect(existsSync(tree.argvLog)).toBe(true);

    const argv = readFileSync(tree.argvLog, "utf8");
    expect(argv).toContain("Accept: application/vnd.github.html+json");
  });

  test("one XML decode of an item description returns the fixture body_html", () => {
    const tree = makeTree();
    runWrapper(tree, { ci: true });
    expect(existsSync(tree.feed)).toBe(true);
    const xml = readFileSync(tree.feed, "utf8");

    const description = descriptionOf(itemBlocks(xml)[0] ?? "");
    expect(decodeXml(description)).toBe(FIXTURE_BODY_HTML);
  });
});

describe.if(HAS_TOOLS)("script/build-release-feed: failures never leave a partial feed", () => {
  test("a failing CLI leaves no docs/rss.xml behind", () => {
    // No item carries `body_html`, so the CLI's structural guard fires and the
    // wrapper must fail before the move (temp file -> xmllint -> mv).
    const noBodyHtml = JSON.stringify([
      {
        tag_name: "v0.58.0",
        name: "v0.58.0",
        html_url: "https://github.com/bostonaholic/team/releases/tag/v0.58.0",
        published_at: "2026-08-27T20:26:05Z",
        draft: false,
      },
    ]);
    const tree = makeTree({ gh: (log) => ghStub(log, [noBodyHtml]) });

    const { status } = runWrapper(tree, { ci: true });

    expect(status).not.toBe(0);
    expect(existsSync(tree.feed)).toBe(false);
  });
});

describe.if(HAS_TOOLS)("script/build-release-feed: the CI-versus-local branch (decision 9)", () => {
  test("a failing gh warns and exits 0 when CI is unset, so `dev docs` survives", () => {
    const tree = makeTree({ gh: failingGhStub });

    const { status, output } = runWrapper(tree, { ci: false });

    expect(status).toBe(0);
    expect(output).toContain("warning:");
    expect(existsSync(tree.feed)).toBe(false);
  });

  test("the same failing gh is fatal with ::error:: under CI=1", () => {
    const tree = makeTree({ gh: failingGhStub });

    const { status, output } = runWrapper(tree, { ci: true });

    expect(status).not.toBe(0);
    expect(/^::error::/m.test(output)).toBe(true);
  });
});

describe.if(HAS_TOOLS)("script/build-release-feed: a malformed _config.yml is loud on BOTH branches", () => {
  // A broken config is a repository defect, not an offline condition, so it
  // sits outside the local tolerance (decision 5).
  test("exits non-zero with an ::error:: line when CI is unset", () => {
    const tree = makeTree({ config: CONFIG_MALFORMED });

    const { status, output } = runWrapper(tree, { ci: false });

    expect(status).not.toBe(0);
    expect(/^::error::/m.test(output)).toBe(true);
  });

  test("exits non-zero with an ::error:: line under CI=1", () => {
    const tree = makeTree({ config: CONFIG_MALFORMED });

    const { status, output } = runWrapper(tree, { ci: true });

    expect(status).not.toBe(0);
    expect(/^::error::/m.test(output)).toBe(true);
  });
});
