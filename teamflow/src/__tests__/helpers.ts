/**
 * Shared test utilities for structural/source-code tests.
 */

import { readFileSync } from "node:fs";

export function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

/**
 * Extract the CSS rule block for a given selector from Svelte <style> content.
 * Returns the content between the braces for the first matching selector.
 * Handles nested selectors by looking for the exact selector pattern.
 */
export function extractStyleBlock(source: string, selector: string): string {
  // Escape special regex chars in selector
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the selector followed by optional whitespace and opening brace
  const re = new RegExp(escaped + "\\s*\\{", "g");
  const match = re.exec(source);
  if (!match) return "";

  const braceStart = match.index + match[0].length - 1;
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  return source.slice(braceStart, end + 1);
}
