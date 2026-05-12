import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { SqlRewriteError, SqlRewriteService } from "../src/services/sqlRewriteService.js";

const rewriteService = new SqlRewriteService();

test("keeps configured federated table unqualified and qualifies other tables", () => {
  const result = rewriteService.rewrite({
    sql: "select * from order_mt4 o join users u on o.login = u.login",
    mysqlSchema: "mysql_db",
    preservedTables: ["order_mt4", "order_mt5", "order_mt6"],
  });

  assert.equal(result.statementType, "select");
  assert.match(result.rewrittenSql, /from\s+"order_mt4"/i);
  assert.match(result.rewrittenSql, /join\s+"mysql_db"\."users"/i);
});

test("does not qualify CTE names", () => {
  const result = rewriteService.rewrite({
    sql: "with q as (select * from users) select * from q",
    mysqlSchema: "mysql_db",
    preservedTables: ["order_mt4"],
  });

  assert.match(result.rewrittenSql, /from\s+"mysql_db"\."users"/i);
  assert.match(result.rewrittenSql, /from\s+"q"/i);
});

test("replaces existing database qualifiers with the remote alias", () => {
  const result = rewriteService.rewrite({
    sql: "select * from stat_ms.users",
    mysqlSchema: "mysql_db",
    preservedTables: [],
  });

  assert.match(result.rewrittenSql, /from\s+"mysql_db"\."users"/i);
});

test("qualifies tables in nested FROM clauses", () => {
  const result = rewriteService.rewrite({
    sql: "select * from (select * from users) u where exists (select 1 from orders)",
    mysqlSchema: "mysql_db",
    preservedTables: [],
  });

  assert.match(result.rewrittenSql, /from\s+\(select\s+\*\s+from\s+"mysql_db"\."users"\)/i);
  assert.match(result.rewrittenSql, /from\s+"mysql_db"\."orders"/i);
});

test("rejects non-read-only SQL", () => {
  assert.throws(() => {
    rewriteService.rewrite({
      sql: "delete from users where id = 1",
      mysqlSchema: "mysql_db",
      preservedTables: [],
    });
  }, SqlRewriteError);
});

test("rejects multi-statement SQL payload", () => {
  assert.throws(() => {
    rewriteService.rewrite({
      sql: "select 1; select 2;",
      mysqlSchema: "mysql_db",
      preservedTables: [],
    });
  }, SqlRewriteError);
});


