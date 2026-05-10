import assert from "node:assert/strict";
import test from "node:test";
import { getOptionsMonitorToken, type OptionsMonitor } from "@duckdb-poc/shared-infra";
import { type ApiOptions, ApiOptionsProvider } from "../src/config/apiOptions.js";
import { buildServer } from "../src/server.js";
import { appContainer, registerDependencies } from "../src/container/registerDependencies.js";

let dependenciesRegistered = false;

function ensureDependenciesRegistered(): void {
  if (dependenciesRegistered) {
    return;
  }

  registerDependencies();
  dependenciesRegistered = true;
}

async function createApp() {
  ensureDependenciesRegistered();
  return buildServer({ logger: false });
}

function getCurrentApiOptions(): ApiOptions {
  ensureDependenciesRegistered();

  return appContainer.resolve<OptionsMonitor<ApiOptions>>(
    getOptionsMonitorToken(ApiOptionsProvider)
  ).currentValue;
}

test("invalid API key still returns 401 while under the rate limit", async (t) => {
  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/example/secured/profile",
    headers: {
      "x-api-key": "wrong-key",
      "x-forwarded-for": "198.51.100.20",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    message: "Unauthorized",
    detail: "Missing or invalid 'x-api-key' header",
  });
});

test("auth endpoints enforce the configured per-IP rate limit", async (t) => {
  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const configuredLimit = getCurrentApiOptions().rate_limit.auth_endpoints.max_per_ip;

  const headers = {
    "x-api-key": "dev-reader-key",
    "x-forwarded-for": "198.51.100.21",
  };

  for (let attempt = 0; attempt < configuredLimit; attempt++) {
    const response = await app.inject({
      method: "GET",
      url: "/v1/example/secured/profile",
      headers,
    });

    assert.equal(response.statusCode, 200);
  }

  const throttled = await app.inject({
    method: "GET",
    url: "/v1/example/secured/profile",
    headers,
  });

  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.headers["retry-after"] !== undefined, true);
  assert.match(throttled.body, /auth_endpoints/);
});

test("sensitive endpoints enforce the configured per-IP rate limit", async (t) => {
  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const configuredLimit = getCurrentApiOptions().rate_limit.sensitive_endpoints.max_per_ip;

  const headers = {
    "x-api-key": "dev-analyst-key",
    "x-forwarded-for": "198.51.100.22",
  };

  for (let attempt = 0; attempt < configuredLimit; attempt++) {
    const response = await app.inject({
      method: "GET",
      url: "/v1/example/secured/analyst-insights",
      headers,
    });

    assert.equal(response.statusCode, 200);
  }

  const throttled = await app.inject({
    method: "GET",
    url: "/v1/example/secured/analyst-insights",
    headers,
  });

  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.headers["retry-after"] !== undefined, true);
  assert.match(throttled.body, /sensitive_endpoints/);
});

test("admin config reload endpoint requires admin role and returns success for admin", async (t) => {
  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const forbidden = await app.inject({
    method: "POST",
    url: "/v1/example/secured/admin/reload-config",
    headers: {
      "x-api-key": "dev-reader-key",
      "x-forwarded-for": "198.51.100.23",
    },
  });

  assert.equal(forbidden.statusCode, 403);

  const success = await app.inject({
    method: "POST",
    url: "/v1/example/secured/admin/reload-config",
    headers: {
      "x-api-key": "dev-admin-key",
      "x-forwarded-for": "198.51.100.24",
    },
  });

  assert.equal(success.statusCode, 200);
  assert.equal(success.json().message, "Configuration reloaded");
  assert.equal(typeof success.json().reloadedAt, "string");
});

