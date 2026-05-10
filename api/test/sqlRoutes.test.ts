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

test("sql endpoint rejects write statements with 400", async (t) => {
  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/sql/query",
    headers: {
      "x-api-key": "dev-reader-key",
      "x-forwarded-for": "198.51.100.31",
    },
    payload: {
      sql: "delete from users where id = 1",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "INVALID_SQL");
});

test("sql endpoint rejects multi statement payload with 400", async (t) => {
  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/sql/query",
    headers: {
      "x-api-key": "dev-reader-key",
      "x-forwarded-for": "198.51.100.32",
    },
    payload: {
      sql: "select 1; select 2;",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "INVALID_SQL");
});

