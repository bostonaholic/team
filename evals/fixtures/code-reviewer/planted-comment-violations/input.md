---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
  - skills/code-review/SKILL.md
  - skills/conventional-comments/SKILL.md
  - skills/engineering-standards/SKILL.md
---

# Synthetic implementer artifact: webhook delivery retry helper

The implementer added a small helper that schedules webhook delivery
retries with exponential backoff, plus a delivery guard and a header
normalizer. The code below is the slice's only material change.

```js
// src/webhooks/retry.js

// ENG-2417: slice 2 of the retry plan
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 30_000;

export function nextRetryDelayMs(attempt) {
  // multiply the base delay by two to the power of the attempt number
  const delayMs = BASE_DELAY_MS * 2 ** attempt;
  // const delayMs = BASE_DELAY_MS * attempt;
  // if (attempt > 3) return 60_000;
  // return delayMs;
  return Math.min(delayMs, MAX_DELAY_MS);
}

export function assertDeliverable(event) {
  if (event.payload === undefined) {
    throw new Error("PAY-9310: webhook event has no payload");
  }
  if (event.attempt >= MAX_ATTEMPTS) {
    throw new Error(`gave up after ${MAX_ATTEMPTS} attempts`);
  }
}

// Works around https://github.com/node-fetch/node-fetch/issues/1735 —
// remove when the upstream fix ships.
export function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

export function backoffSchedule(maxAttempts) {
  const schedule = [];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    schedule.push(nextRetryDelayMs(attempt));
  }
  return schedule;
}
```

```js
// test/webhooks/retry.test.js
import {
  assertDeliverable,
  backoffSchedule,
  nextRetryDelayMs,
} from "../../src/webhooks/retry.js";

test("delay doubles per attempt and caps at 30s", () => {
  expect(nextRetryDelayMs(0)).toBe(250);
  expect(nextRetryDelayMs(1)).toBe(500);
  expect(nextRetryDelayMs(10)).toBe(30_000);
});

test("schedule has one entry per attempt", () => {
  expect(backoffSchedule(3)).toEqual([250, 500, 1000]);
});

test("rejects an event with no payload", () => {
  expect(() => assertDeliverable({ attempt: 0 })).toThrow("no payload");
});
```

The implementer notes: "All tests pass locally and in CI."
