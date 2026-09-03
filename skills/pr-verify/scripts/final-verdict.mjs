#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ITEM_VERDICTS = new Set(["PASS", "FAIL", "PARTIAL"]);
const CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);

export function finalVerdict(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array");
  }
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object" || !ITEM_VERDICTS.has(item.verdict)) {
      throw new Error("item " + index + " has an invalid verdict");
    }
    if (!CONFIDENCE.has(item.confidence)) {
      throw new Error("item " + index + " has invalid confidence");
    }
  }
  if (items.some((item) => item.verdict === "FAIL")) return "NOT READY";
  if (items.some((item) => item.verdict === "PARTIAL" || item.confidence === "LOW")) {
    return "NEEDS ATTENTION";
  }
  return "READY";
}

async function main() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const items = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    process.stdout.write(JSON.stringify({ verdict: finalVerdict(items) }) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("final-verdict: " + message + "\n");
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
