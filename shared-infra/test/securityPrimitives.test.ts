import assert from "assert/strict";
import { describe, it } from "node:test";
import {
  type ApiKeyPrincipal,
  findApiKeyPrincipal,
  FixedWindowRateLimiter,
  getMissingRoles,
  hasRequiredRoles
} from "../src/index.js";

describe("FixedWindowRateLimiter", () => {
  it("allows requests up to the limit and blocks the next one inside the same window", () => {
    const limiter = new FixedWindowRateLimiter();
    const now = 1_000;

    assert.equal(limiter.consume("ip:1", 60_000, 2, now).allowed, true);
    assert.equal(limiter.consume("ip:1", 60_000, 2, now + 1).allowed, true);

    const blocked = limiter.consume("ip:1", 60_000, 2, now + 2);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.limit, 2);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.count, 3);
  });

  it("starts a fresh window after the previous one expires", () => {
    const limiter = new FixedWindowRateLimiter();
    const now = 5_000;

    limiter.consume("consumer:a", 1_000, 1, now);
    const next = limiter.consume("consumer:a", 1_000, 1, now + 1_001);

    assert.equal(next.allowed, true);
    assert.equal(next.count, 1);
    assert.equal(next.remaining, 0);
  });

  it("calculates retryAfterSeconds by rounding up to at least one second", () => {
    const limiter = new FixedWindowRateLimiter();
    const first = limiter.consume("k", 1_500, 1, 10_000);
    const blocked = limiter.consume("k", 1_500, 1, 10_600);

    assert.equal(first.retryAfterSeconds, 2);
    assert.equal(blocked.retryAfterSeconds, 1);
  });

  it("reset clears all tracked counters", () => {
    const limiter = new FixedWindowRateLimiter();
    limiter.consume("a", 60_000, 1, 0);
    limiter.consume("b", 60_000, 1, 0);
    assert.equal(limiter.size, 2);

    limiter.reset();

    assert.equal(limiter.size, 0);
    assert.equal(limiter.consume("a", 60_000, 1, 1).count, 1);
  });

  it("sweeps expired entries after the configured sweep interval", () => {
    const limiter = new FixedWindowRateLimiter(2);

    limiter.consume("expired", 10, 1, 0);
    limiter.consume("fresh", 10_000, 1, 1);
    assert.equal(limiter.size, 2);

    // The second and fourth operations trigger a sweep when the interval is 2.
    limiter.consume("fresh", 10_000, 2, 11);
    limiter.consume("fresh", 10_000, 3, 12);

    assert.equal(limiter.size, 1);
    assert.equal(limiter.consume("expired", 10, 1, 13).count, 1);
  });
});

describe("apiKeyAuthorization", () => {
  const principals: ApiKeyPrincipal<"reader" | "admin">[] = [
    { name: "reader-client", apiKey: "reader-key", roles: ["reader"] },
    { name: "admin-client", apiKey: "admin-key", roles: ["reader", "admin"] }
  ];

  it("finds the matching principal by api key", () => {
    assert.deepEqual(findApiKeyPrincipal(principals, "reader-key"), principals[0]);
  });

  it("returns null when the api key is missing or unknown", () => {
    assert.equal(findApiKeyPrincipal(principals, undefined), null);
    assert.equal(findApiKeyPrincipal(principals, "missing"), null);
  });

  it("returns the missing roles in declaration order", () => {
    assert.deepEqual(getMissingRoles(["reader"], ["reader", "admin"]), ["admin"]);
  });

  it("detects whether the granted roles satisfy the required roles", () => {
    assert.equal(hasRequiredRoles(["reader", "admin"], ["admin"]), true);
    assert.equal(hasRequiredRoles(["reader"], ["admin"]), false);
  });
});



