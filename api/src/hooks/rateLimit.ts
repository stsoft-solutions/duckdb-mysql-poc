import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { getOptionsMonitorToken, type OptionsMonitor } from "@duckdb-poc/shared-infra";
import { appContainer } from "../container/registerDependencies.js";
import { type ApiOptions, ApiOptionsProvider } from "../config/apiOptions.js";
import { getApiConsumerFromRequest } from "./apiKeyGuard.js";

export type RateLimitScope = "auth_endpoints" | "sensitive_endpoints";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitCheckResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
};

const ipCounters = new Map<string, RateLimitEntry>();
const consumerCounters = new Map<string, RateLimitEntry>();
let operationsSinceSweep = 0;
let apiOptionsMonitor: OptionsMonitor<ApiOptions> | null = null;

function resetCounters(): void {
  ipCounters.clear();
  consumerCounters.clear();
  operationsSinceSweep = 0;
}

function getApiOptionsMonitor(): OptionsMonitor<ApiOptions> {
  if (apiOptionsMonitor) {
    return apiOptionsMonitor;
  }

  const monitor = appContainer.resolve<OptionsMonitor<ApiOptions>>(
    getOptionsMonitorToken(ApiOptionsProvider)
  );

  monitor.onChange(() => {
    // Limits/windows may change on reload; clear stale counter-windows.
    resetCounters();
  });

  apiOptionsMonitor = monitor;
  return monitor;
}

function getApiOptions(): ApiOptions {
  return getApiOptionsMonitor().currentValue;
}

function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? request.ip;
  }

  return request.ip;
}

function sweepExpiredCounters(now: number): void {
  operationsSinceSweep++;
  if (operationsSinceSweep < 100) {
    return;
  }

  operationsSinceSweep = 0;

  for (const [key, entry] of ipCounters.entries()) {
    if (entry.resetAt <= now) {
      ipCounters.delete(key);
    }
  }

  for (const [key, entry] of consumerCounters.entries()) {
    if (entry.resetAt <= now) {
      consumerCounters.delete(key);
    }
  }
}

function consumeQuota(
  store: Map<string, RateLimitEntry>,
  key: string,
  windowMs: number,
  limit: number,
  now: number,
): RateLimitCheckResult {
  const current = store.get(key);

  let nextEntry: RateLimitEntry;
  if (!current || current.resetAt <= now) {
    nextEntry = {
      count: 1,
      resetAt: now + windowMs,
    };
  } else {
    nextEntry = {
      count: current.count + 1,
      resetAt: current.resetAt,
    };
  }

  store.set(key, nextEntry);

  const retryAfterSeconds = Math.max(1, Math.ceil((nextEntry.resetAt - now) / 1000));
  return {
    allowed: nextEntry.count <= limit,
    retryAfterSeconds,
    limit,
    remaining: Math.max(0, limit - nextEntry.count),
  };
}

function sendTooManyRequests(
  reply: FastifyReply,
  details: {
    scope: RateLimitScope;
    dimension: "ip" | "consumer";
    retryAfterSeconds: number;
    limit: number;
    remaining: number;
  },
) {
  reply.header("Retry-After", String(details.retryAfterSeconds));
  reply.header("X-RateLimit-Limit", String(details.limit));
  reply.header("X-RateLimit-Remaining", String(details.remaining));
  reply.header("X-RateLimit-Reset", String(details.retryAfterSeconds));

  return reply.status(429).send({
    message: "Too Many Requests",
    detail:
      details.dimension === "consumer"
        ? `Rate limit exceeded for authenticated consumer on '${details.scope}'. Try again in ${details.retryAfterSeconds} second(s).`
        : `Rate limit exceeded for client IP on '${details.scope}'. Try again in ${details.retryAfterSeconds} second(s).`,
  });
}

export function createRateLimitPreHandler(scope: RateLimitScope): preHandlerHookHandler {
  return (request, reply, done) => {
    const apiOptions = getApiOptions();
    if (!apiOptions.rate_limit.enabled) {
      done();
      return;
    }

    const bucket = apiOptions.rate_limit[scope];
    const now = Date.now();
    sweepExpiredCounters(now);

    const ipAddress = getClientIp(request);
    const ipResult = consumeQuota(
      ipCounters,
      `${scope}:ip:${ipAddress}`,
      bucket.window_ms,
      bucket.max_per_ip,
      now,
    );

    if (!ipResult.allowed) {
      request.log.warn(
        { scope, ipAddress, limit: bucket.max_per_ip },
        "Rate limit exceeded for client IP",
      );
      void sendTooManyRequests(reply, {
        scope,
        dimension: "ip",
        retryAfterSeconds: ipResult.retryAfterSeconds,
        limit: ipResult.limit,
        remaining: ipResult.remaining,
      });
      return;
    }

    const consumer = getApiConsumerFromRequest(request);
    if (consumer) {
      const consumerResult = consumeQuota(
        consumerCounters,
        `${scope}:consumer:${consumer.name}`,
        bucket.window_ms,
        bucket.max_per_consumer,
        now,
      );

      if (!consumerResult.allowed) {
        request.log.warn(
          { scope, consumer: consumer.name, limit: bucket.max_per_consumer },
          "Rate limit exceeded for authenticated consumer",
        );
        void sendTooManyRequests(reply, {
          scope,
          dimension: "consumer",
          retryAfterSeconds: consumerResult.retryAfterSeconds,
          limit: consumerResult.limit,
          remaining: consumerResult.remaining,
        });
        return;
      }
    }

    done();
  };
}

export const authRateLimitGuard: preHandlerHookHandler = createRateLimitPreHandler("auth_endpoints");
export const sensitiveRateLimitGuard: preHandlerHookHandler = createRateLimitPreHandler("sensitive_endpoints");

