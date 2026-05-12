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

test("formats numeric parquet max timestamp as SQL integer literal", async () => {
  const service = createServiceWithoutConstructor();
  const getMaxTimestamp = (service as unknown as {
    getMaxTimestampFromParquet(parquetGlob: string, field: string, fieldType: string, conn: unknown): Promise<string>;
  }).getMaxTimestampFromParquet.bind(service);
  let querySql = "";
  const conn = {
    async query(sql: string) {
      querySql = sql;
      return [{ max_timestamp: "1715414400000" }];
    },
  };

  const result = await getMaxTimestamp("C:/data/orders/**/*.parquet", "time", "epoch_milliseconds", conn);

  assert.equal(result, "1715414400000");
  assert.match(querySql, /MAX\("time"\)::VARCHAR/);
  assert.match(querySql, /read_parquet\('C:\/data\/orders\/\*\*\/\*\.parquet'/);
});

test("formats datetime parquet max timestamp as DuckDB timestamp literal", async () => {
  const service = createServiceWithoutConstructor();
  const getMaxTimestamp = (service as unknown as {
    getMaxTimestampFromParquet(parquetGlob: string, field: string, fieldType: string, conn: unknown): Promise<string>;
  }).getMaxTimestampFromParquet.bind(service);
  const conn = {
    async query() {
      return [{ max_timestamp: "2026-05-12 10:15:30.123456" }];
    },
  };

  const result = await getMaxTimestamp("C:/data/orders/**/*.parquet", "created_at", "datetime", conn);

  assert.equal(result, "TIMESTAMP '2026-05-12 10:15:30.123456'");
});

test("escapes parquet glob and timestamp field identifier in max timestamp query", async () => {
  const service = createServiceWithoutConstructor();
  const getMaxTimestamp = (service as unknown as {
    getMaxTimestampFromParquet(parquetGlob: string, field: string, fieldType: string, conn: unknown): Promise<string>;
  }).getMaxTimestampFromParquet.bind(service);
  let querySql = "";
  const conn = {
    async query(sql: string) {
      querySql = sql;
      return [{ max_timestamp: "2026-05-12 10:15:30" }];
    },
  };

  await getMaxTimestamp("C:/data/tenant's/**/*.parquet", 'weird"field', "datetime", conn);

  assert.match(querySql, /MAX\("weird""field"\)::VARCHAR/);
  assert.match(querySql, /read_parquet\('C:\/data\/tenant''s\/\*\*\/\*\.parquet'/);
});

test("uses minimum timestamp literal when parquet files contain no rows", async () => {
  const service = createServiceWithoutConstructor();
  const getMaxTimestamp = (service as unknown as {
    getMaxTimestampFromParquet(parquetGlob: string, field: string, fieldType: string, conn: unknown): Promise<string>;
  }).getMaxTimestampFromParquet.bind(service);
  const conn = {
    async query() {
      return [{ max_timestamp: null }];
    },
  };

  const epochResult = await getMaxTimestamp("C:/data/orders/**/*.parquet", "time", "epoch_seconds", conn);
  const datetimeResult = await getMaxTimestamp("C:/data/orders/**/*.parquet", "created_at", "datetime", conn);

  assert.equal(epochResult, "-9223372036854775808");
  assert.equal(datetimeResult, "TIMESTAMP '1000-01-01 00:00:00'");
});
