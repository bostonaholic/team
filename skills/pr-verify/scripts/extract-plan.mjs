#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = new Map([
  ["test plan", "Test plan"],
  ["how to verify", "How to Verify"],
]);

function heading(line) {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return {
    level: match[1].length,
    title: match[2].trim(),
  };
}

function bullet(line) {
  const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  const checkbox = match[1].match(/^\[([ xX])\]\s+(.+)$/);
  return checkbox
    ? { text: checkbox[2].trim(), checked: checkbox[1].toLowerCase() === "x" }
    : { text: match[1].trim(), checked: null };
}

export function extractPlan(markdown) {
  if (typeof markdown !== "string") throw new Error("input must be Markdown text");

  const sections = [];
  const items = [];
  let active = null;
  let current = null;
  let fence = null;

  for (const line of markdown.split(/\r\n?|\n/)) {
    const fenceLine = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        fenceLine
        && fenceLine[1][0] === fence.marker
        && fenceLine[1].length >= fence.length
        && /^[ \t]*$/u.test(fenceLine[2])
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceLine && !(fenceLine[1][0] === "`" && fenceLine[2].includes("`"))) {
      fence = { marker: fenceLine[1][0], length: fenceLine[1].length };
      continue;
    }

    const parsedHeading = heading(line);
    if (parsedHeading) {
      current = null;
      if (parsedHeading.level <= 2) {
        const title = TARGETS.get(parsedHeading.title.toLowerCase());
        active = parsedHeading.level === 2 && title ? title : null;
        if (active && !sections.includes(active)) sections.push(active);
      }
      continue;
    }
    if (!active) continue;

    const parsedBullet = bullet(line);
    if (parsedBullet) {
      current = { section: active, ...parsedBullet };
      items.push(current);
      continue;
    }

    if (current && /^\s{2,}\S/.test(line)) {
      current.text = current.text + " " + line.trim();
    } else if (line.trim()) {
      current = null;
    }
  }

  return { sections, items };
}

async function main() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const output = JSON.stringify(extractPlan(Buffer.concat(chunks).toString("utf8")));
    process.stdout.write(output + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("extract-plan: " + message + "\n");
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
