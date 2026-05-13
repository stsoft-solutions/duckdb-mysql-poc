import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { FixedWindowRateLimiter, getOptionsMonitorToken, type OptionsMonitor } from "@duckdb-poc/shared-infra";
import { appContainer } from "../container/registerDependencies.js";
import { type ApiOptions, ApiOptionsProvider } from "../config/apiOptions.js";
import { getApiConsumerFromRequest } from "./apiKeyGuard.js";

export type RateLimitScope = "auth_endpoints" | "sensitive_endpoints";

const ipRateLimiter = new FixedWindowRateLimiter();
const consumerRateLimiter = new FixedWindowRateLimiter();
let apiOptionsMonitor: OptionsMonitor<ApiOptions> | null = null;

function resetCounters(): void {
  ipRateLimiter.reset();
  consumerRateLimiter.reset();
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

    const ipAddress = getClientIp(request);
    const ipResult = ipRateLimiter.consume(
      `${scope}:ip:${ipAddress}`,
      bucket.window_ms,
      bucket.max_per_ip,
      now
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
      const consumerResult = consumerRateLimiter.consume(
        `${scope}:consumer:${consumer.name}`,
        bucket.window_ms,
        bucket.max_per_consumer,
        now
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

