import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../src/server.js";
import { registerDependencies } from "../src/container/registerDependencies.js";

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

  const headers = {
    "x-api-key": "dev-reader-key",
    "x-forwarded-for": "198.51.100.21",
  };

  for (let attempt = 0; attempt < 20; attempt++) {
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

  const headers = {
    "x-api-key": "dev-analyst-key",
    "x-forwarded-for": "198.51.100.22",
  };

  for (let attempt = 0; attempt < 10; attempt++) {
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

