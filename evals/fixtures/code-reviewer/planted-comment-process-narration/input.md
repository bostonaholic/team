---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
  - skills/reviewing-code/SKILL.md
  - skills/conventional-comments/SKILL.md
  - skills/engineering-standards/SKILL.md
---

# Synthetic implementer artifact: request token bucket

The implementer replaced the fixed-window rate limiter with a token
bucket. The code below is the slice's only material change.

```js
// src/auth/token-bucket.js

const REFILL_INTERVAL_MS = 15_000;

// Previously this used a fixed window; changed to a token bucket after the
// review pointed out the burst behavior.
export function createBucket(capacity) {
  return { capacity, tokens: capacity, updatedAt: 0 };
}

// Per the reviewer's request, the burst multiplier stays configurable.
export function burstAllowance(bucket, multiplier = 2) {
  return bucket.capacity * multiplier;
}

// Refills the bucket every 30 seconds.
export function refill(bucket, now) {
  const elapsed = now - bucket.updatedAt;
  const refills = Math.floor(elapsed / REFILL_INTERVAL_MS);
  if (refills < 1) return bucket;
  return {
    ...bucket,
    tokens: Math.min(bucket.capacity, bucket.tokens + refills),
    updatedAt: now,
  };
}

export function consume(bucket, cost) {
  // handle edge case
  if (cost > bucket.capacity) return null;
  if (bucket.tokens < cost) return null;
  return { ...bucket, tokens: bucket.tokens - cost };
}

// Mirrors the guard in the function two above.
export function canConsume(bucket, cost) {
  return cost <= bucket.capacity && bucket.tokens >= cost;
}

// Evict before refill: a refill that ran first would extend the lifetime of
// an entry that already expired, so the cache would never shed it.
export function sweep(cache, now) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  return cache;
}

// A user on the free tier shares one bucket across every device they sign
// in from, so the key deliberately omits the device id.
export function bucketKeyForUser(user) {
  return `bucket:${user.tier}:${user.id}`;
}

/**
 * Acquires one token for the caller.
 *
 * Throws RateLimitError when the bucket has no tokens left. Callers that
 * retry must back off first; an immediate retry cannot succeed, because the
 * bucket refills on a timer rather than on demand.
 */
export function acquireToken(bucket, now) {
  const refilled = refill(bucket, now);
  const consumed = consume(refilled, 1);
  if (consumed === null) throw new RateLimitError("bucket empty");
  return consumed;
}
```

```js
// test/auth/token-bucket.test.js
import {
  canConsume,
  consume,
  createBucket,
  refill,
} from "../../src/auth/token-bucket.js";

test("a fresh bucket starts full", () => {
  expect(createBucket(5).tokens).toBe(5);
});

test("refill adds one token per interval and caps at capacity", () => {
  const bucket = { capacity: 5, tokens: 1, updatedAt: 0 };
  expect(refill(bucket, 30_000).tokens).toBe(3);
  expect(refill(bucket, 600_000).tokens).toBe(5);
});

test("consume rejects a cost above capacity", () => {
  expect(consume(createBucket(5), 9)).toBeNull();
});

test("canConsume agrees with consume", () => {
  const bucket = createBucket(5);
  expect(canConsume(bucket, 3)).toBe(true);
  expect(consume(bucket, 3)).not.toBeNull();
});
```

The implementer notes: "All tests pass locally and in CI."
