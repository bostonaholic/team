#!/usr/bin/env bun
// scripts/build-release-feed.ts
//
// CLI: `... | bun scripts/build-release-feed.ts <site-url>`
// Reads the GitHub Releases JSON array on stdin and prints an RSS 2.0 feed to
// stdout. Its only caller is `script/build-release-feed`, the bash wrapper that
// owns every side effect (fetch, temp file, xmllint, move).
//
// Two invariants make this file cheap to test and safe to pipe:
//
// - Stdout carries the feed and nothing else. Every failure goes to stderr as
//   `::error::<msg>` with a non-zero exit, so CI surfaces it as an annotation.
// - Zero dependencies: only `node:` builtins are imported, because the Pages
//   build runs this with no `bun install` step.
//
// `buildReleaseFeed` is pure — no network, no clock, no filesystem — so the
// whole document contract is unit-tested for free in
// tests/build-release-feed.test.ts.

import { readFileSync } from "node:fs";

const CHANNEL_TITLE = "Team releases";
const CHANNEL_DESCRIPTION =
  "New releases of Team, a Claude Code plugin for autonomous feature delivery.";
const CHANNEL_LANGUAGE = "en-us";
const ATOM_NS = "http://www.w3.org/2005/Atom";

/** A release, after the required-field contract has been checked. */
interface Release {
  tag_name: string;
  name?: string | null;
  html_url: string;
  published_at: string | null;
  draft?: boolean;
  body_html?: string | null;
}

// Tab (9), newline (10), and carriage return (13) are the C0 controls XML 1.0
// permits; every other one below 0x20 would produce a document no reader can
// parse, so it is dropped.
const PERMITTED_C0 = new Set([9, 10, 13]);

function stripForbiddenControls(text: string): string {
  let kept = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 && !PERMITTED_C0.has(code)) continue;
    kept += character;
  }
  return kept;
}

/** Escape text for an XML text node or attribute value, exactly once. */
function escapeXml(text: string): string {
  return stripForbiddenControls(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Check the required half of the item field contract. `tag_name`, `html_url`,
 * and `published_at` anchor identity, link, and date, so a release missing any
 * of them fails loud rather than emitting an item with an empty element.
 * A `published_at` of null is a different case: it means never published, and
 * the filter drops it.
 */
function toRelease(value: unknown, index: number): Release {
  if (typeof value !== "object" || value === null) {
    throw new Error(`release ${index} is not an object`);
  }
  const raw = value as Record<string, unknown>;
  for (const key of ["tag_name", "html_url", "published_at"]) {
    if (!(key in raw)) throw new Error(`release ${index} is missing '${key}'`);
  }
  if (!isNonEmptyString(raw.tag_name)) {
    throw new Error(`release ${index} has no usable 'tag_name'`);
  }
  if (!isNonEmptyString(raw.html_url)) {
    throw new Error(`release ${index} has no usable 'html_url'`);
  }
  if (raw.published_at !== null && typeof raw.published_at !== "string") {
    throw new Error(`release ${index} has a non-string 'published_at'`);
  }
  return raw as unknown as Release;
}

/** Keep a release only when it is published and is not a draft. */
function isPublished(release: Release): boolean {
  return isNonEmptyString(release.published_at) && release.draft !== true;
}

function parsePublishedAt(release: Release): number {
  const time = Date.parse(release.published_at ?? "");
  if (Number.isNaN(time)) {
    throw new Error(`release ${release.tag_name} has an unparseable 'published_at'`);
  }
  return time;
}

function renderItem(release: Release, time: number): string {
  const title = isNonEmptyString(release.name) ? release.name : release.tag_name;
  const description = typeof release.body_html === "string" ? release.body_html : "";
  return [
    "    <item>",
    `      <title>${escapeXml(title)}</title>`,
    `      <link>${escapeXml(release.html_url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(release.html_url)}</guid>`,
    `      <pubDate>${new Date(time).toUTCString()}</pubDate>`,
    `      <description>${escapeXml(description)}</description>`,
    "    </item>",
  ].join("\n");
}

/**
 * Build the RSS 2.0 document. Pure: the same releases and site URL always
 * produce the same bytes, which is why the channel omits `lastBuildDate`.
 *
 * @param releases the GitHub Releases API payload, already flattened
 * @param siteUrl the site origin, with no trailing slash
 */
export function buildReleaseFeed(releases: unknown[], siteUrl: string): string {
  const dated = releases
    .map(toRelease)
    .filter(isPublished)
    .map((release) => ({ release, time: parsePublishedAt(release) }));

  // Newest first. A tie on the second breaks on plain lexicographic descending
  // `tag_name` — no semver dependency for an ordering nobody will see.
  dated.sort((a, b) => {
    if (a.time !== b.time) return b.time - a.time;
    if (a.release.tag_name === b.release.tag_name) return 0;
    return a.release.tag_name < b.release.tag_name ? 1 : -1;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0" xmlns:atom="${ATOM_NS}">`,
    "  <channel>",
    `    <title>${CHANNEL_TITLE}</title>`,
    `    <link>${siteUrl}/</link>`,
    `    <description>${CHANNEL_DESCRIPTION}</description>`,
    `    <language>${CHANNEL_LANGUAGE}</language>`,
    `    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />`,
    ...dated.map(({ release, time }) => renderItem(release, time)),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

function die(message: string): never {
  process.stderr.write(`::error::${message}\n`);
  process.exit(1);
}

if (import.meta.main) {
  const siteUrl = process.argv[2];
  if (!siteUrl) die("site URL argument is required");

  let stdin: string;
  try {
    stdin = readFileSync(0, "utf8");
  } catch {
    die("could not read the releases payload on stdin");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stdin);
  } catch {
    die("the releases payload on stdin is not valid JSON");
  }

  // Structural guards. Each of these would otherwise produce a document that
  // looks like a working feed.
  if (!Array.isArray(payload)) die("the releases payload is not a JSON array");
  if (payload.length === 0) die("the releases payload is empty");
  if (
    !payload.some(
      (item) => typeof item === "object" && item !== null && "body_html" in item,
    )
  ) {
    die("no release carries 'body_html' — was the Accept header dropped?");
  }

  try {
    process.stdout.write(buildReleaseFeed(payload, siteUrl));
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
}
