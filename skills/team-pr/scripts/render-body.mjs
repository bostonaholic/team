#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function strings(value, field, required = false, multiline = false) {
  if (value == null && !required) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        !entry.trim() ||
        (!multiline && /[\r\n]/u.test(entry)),
    )
  ) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  if (required && value.length === 0) throw new Error(`${field} must not be empty`);
  return value.map((entry) => entry.trim());
}

function section(parts, heading, lines, prefix = "- ") {
  if (lines.length === 0) return;
  parts.push(`## ${heading}`, ...lines.map((line) => `${prefix}${line}`), "");
}

function reviewNotesSection(parts, lines) {
  if (lines.length === 0) return;
  const rendered = [];
  for (const line of lines) {
    if (line.startsWith(">")) {
      const block = line.split(/\r\n?|\n/);
      if (block.some((entry) => entry && !entry.startsWith(">"))) {
        throw new Error("blockquoted reviewNotes entries must keep every line blockquoted");
      }
      rendered.push(...block);
      continue;
    }
    if (/[\r\n]/u.test(line)) {
      throw new Error("non-blockquoted reviewNotes entries must be single-line strings");
    }
    rendered.push(`- ${line}`);
  }
  parts.push("## Review notes", ...rendered, "");
}

function validTicketFooter(footer) {
  if (/[\u0000-\u001f\u007f]/u.test(footer)) return false;
  return (
    /^Closes \S.*$/u.test(footer)
    || /^Part of [\w.-]+\/[\w.-]+#[1-9]\d*$/u.test(footer)
  );
}

export function renderBody(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("input must be a JSON object");
  }
  const summary = strings(input.summary, "summary", true);
  const decisions = strings(input.designDecisions, "designDecisions");
  const changes = strings(input.changes, "changes", true);
  const screenshots = strings(input.screenshots, "screenshots");
  const verification = strings(input.verification, "verification", true);
  const preMerge = strings(input.preMerge, "preMerge");
  const reviewNotes = strings(input.reviewNotes, "reviewNotes", false, true);
  const references = strings(input.references, "references");
  const companions = strings(input.companionPrs, "companionPrs");
  if (input.ticketFooter != null && typeof input.ticketFooter !== "string") {
    throw new Error("ticketFooter must be a string");
  }
  const footer = input.ticketFooter?.trim() ?? "";
  if (footer && !validTicketFooter(footer)) {
    throw new Error("ticketFooter must be a closing footer or qualified non-closing issue reference");
  }

  const parts = [];
  section(parts, "Summary", summary);
  section(parts, "Design Decisions", decisions);
  section(parts, "Changes", changes);
  section(parts, "Screenshots", screenshots, "");
  section(parts, "How to Verify", verification);
  section(parts, "Pre-merge", preMerge, "");
  reviewNotesSection(parts, reviewNotes);
  section(parts, "References", references);
  if (footer) parts.push(footer, "");
  if (companions.length > 0) {
    parts.push(
      "## Companion PRs",
      "This change spans multiple repos. The companion PRs are:",
      ...companions.map((entry) => `- ${entry}`),
      "",
    );
  }
  return `${parts.join("\n").trimEnd()}\n`;
}

async function main() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    process.stdout.write(renderBody(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
  } catch (error) {
    process.stderr.write(`render-body: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
