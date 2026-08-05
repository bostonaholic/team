// tests/regression-blink-cursor-delay.test.ts
//
// L2 tripwire (free, deterministic): the home-page block cursor must start
// blinking on the first frame. Regression pin for the defect where
// `body.home main>h1::after` carried `animation: blink 1.1s steps(1) 1.6s
// infinite` — in the `animation` shorthand the SECOND <time> is the delay, so
// the cursor sat solid for 1.6s (first visible blink at 1.6s + 0.55s) and the
// page read as unresponsive on load.
//
// Asserted as a numeric constant that bounds behavior, per docs/testing.md
// ("A tripwire asserts a contract, never a wording"). The rule's colors,
// spacing, and glyph are free to change; a non-zero delay is not.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const SITE_CSS = join(REPO_ROOT, "docs/assets/css/site.css");

// Declaration block of the first rule whose selector list contains `selector`,
// i.e. the text between that rule's `{` and its closing `}`. Returns null when
// no such rule exists, so a renamed selector fails loudly rather than passing
// on an empty string.
function ruleBody(css: string, selector: string): string | null {
  const at = css.indexOf(selector);
  if (at === -1) return null;
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

// Value of the `animation` shorthand in a declaration block.
function animationShorthand(body: string): string | null {
  const m = /(?:^|;)\s*animation\s*:\s*([^;}]+)/.exec(body);
  return m ? m[1]!.trim() : null;
}

// Ordered <time> values in a shorthand, in seconds. Per the CSS Animations
// spec the first is `animation-duration` and the second is `animation-delay`.
function times(shorthand: string): number[] {
  const out: number[] = [];
  const re = /(-?\d*\.?\d+)(ms|s)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(shorthand)) !== null) {
    const n = Number(m[1]);
    out.push(m[2] === "ms" ? n / 1000 : n);
  }
  return out;
}

// `animation-delay` per the shorthand's positional rule: the second <time>,
// defaulting to 0 when the shorthand names only a duration.
function delaySeconds(shorthand: string): number {
  return times(shorthand)[1] ?? 0;
}

describe("docs home page: the block cursor blinks immediately", () => {
  const css = read(SITE_CSS);
  const body = ruleBody(css, "body.home main>h1::after");

  test("the cursor rule exists and animates", () => {
    expect(body).not.toBeNull();
    expect(animationShorthand(body!)).not.toBeNull();
  });

  test("the cursor animation has no start delay", () => {
    const shorthand = animationShorthand(body!)!;
    // Surfaces the offending shorthand in the failure message.
    expect({ shorthand, delaySeconds: delaySeconds(shorthand) }).toEqual({
      shorthand,
      delaySeconds: 0,
    });
  });

  // Guards the guard: prove the positional parse actually reads the SECOND
  // time as the delay, so a future refactor cannot turn this into a no-op.
  test("the shorthand parser reads the second <time> as the delay", () => {
    expect(delaySeconds("blink 1.1s steps(1) 1.6s infinite")).toBe(1.6);
    expect(delaySeconds("blink 1.1s steps(1) infinite")).toBe(0);
    expect(delaySeconds("blink 1.1s steps(1) 0s infinite")).toBe(0);
    expect(delaySeconds("blink 1100ms steps(1) 250ms infinite")).toBe(0.25);
  });
});
