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

function reviewNotesSection(parts, notes) {
  if (notes.length === 0) return;
  const lines = [];
  for (const note of notes) {
    if (note.startsWith(">")) {
      const block = note.split(/\r\n?|\n/);
      if (block.some((line) => line && !line.startsWith(">"))) {
        throw new Error("blockquoted reviewNotes entries must keep every line blockquoted");
      }
      lines.push(...block);
    } else {
      if (/[\r\n]/u.test(note)) {
        throw new Error("non-blockquoted reviewNotes entries must be single-line strings");
      }
      lines.push(`- ${note}`);
    }
  }
  parts.push("## Review notes", ...lines, "");
}

const QUALIFIED_ISSUE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+#[1-9]\d*$/;

function validTicketFooter(footer) {
  if (/[\u0000-\u001f\u007f]/u.test(footer)) return false;
  if (footer.startsWith("Closes ")) return /^\S.*$/u.test(footer.slice("Closes ".length));
  if (footer.startsWith("Part of ")) return QUALIFIED_ISSUE.test(footer.slice("Part of ".length));
  return false;
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
    throw new Error("ticketFooter must be 'Closes <ticket>' or 'Part of owner/repo#<number>'");
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
