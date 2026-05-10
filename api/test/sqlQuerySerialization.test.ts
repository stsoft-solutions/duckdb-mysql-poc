import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { SqlQueryService } from "../src/services/sqlQueryService.js";

function createServiceWithoutConstructor(): SqlQueryService {
  return Object.create(SqlQueryService.prototype) as SqlQueryService;
}

test("serializes safe-range bigint as number", () => {
  const service = createServiceWithoutConstructor();
  const convert = (service as unknown as { toJsonSafeValue(value: unknown): unknown }).toJsonSafeValue.bind(service);

  const result = convert({ value: 42n }) as { value: unknown };

  assert.equal(typeof result.value, "number");
  assert.equal(result.value, 42);
});

test("serializes out-of-range bigint as string", () => {
  const service = createServiceWithoutConstructor();
  const convert = (service as unknown as { toJsonSafeValue(value: unknown): unknown }).toJsonSafeValue.bind(service);

  const result = convert({ value: BigInt(Number.MAX_SAFE_INTEGER) + 2n }) as { value: unknown };

  assert.equal(typeof result.value, "string");
  assert.equal(result.value, (BigInt(Number.MAX_SAFE_INTEGER) + 2n).toString());
});

