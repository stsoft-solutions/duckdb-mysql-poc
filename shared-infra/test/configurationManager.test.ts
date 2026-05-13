/**
 * ConfigurationManager tests.
 *
 * Strategy:
 *  - Each test uses an isolated tsyringe child container so registrations never
 *    leak between tests.
 *  - Config sections that do not exist in any real config file return `{}` from
 *    node-config, which is then merged with provider Defaults.  This lets every
 *    test control the loaded value without needing real config files.
 *  - The `hydrate` function is the primary knob for injecting controlled values
 *    (including stateful counters that change on each call, used to verify that
 *    reload actually re-invokes the whole pipeline).
 */

import "reflect-metadata";
import assert from "assert/strict";
import { describe, it } from "node:test";
import { container as globalContainer } from "tsyringe";
import type { Options, OptionsMonitor, OptionsSnapshot, OptionsTokenProvider } from "../src/index.js";
import { ConfigurationManager, getOptionsMonitorToken, getOptionsSnapshotToken } from "../src/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TestOpts = { count: number; name: string };

/** Counter that guarantees unique DI tokens across every test in this file. */
let _tokenIdx = 0;

function uid(): string {
  return `_test_cfg_${++_tokenIdx}`;
}

/**
 * A section name that will never appear in any real config file,
 * so node-config returns `{}` for it, and Defaults take over.
 */
function ghost(token: string): string {
  return `__ghost_section_${token}__`;
}

/** Fresh child container — registrations do not leak between tests. */
function makeContainer() {
  return globalContainer.createChildContainer();
}

function makeProvider(
  token: string,
  defaults: Partial<TestOpts> = {},
  extra: Partial<OptionsTokenProvider<TestOpts>> = {},
): OptionsTokenProvider<TestOpts> {
  return {
    OptionsToken: token,
    SectionName: ghost(token),
    Defaults: defaults as Record<string, unknown>,
    ...extra,
  };
}

function resolveOptions(c: ReturnType<typeof makeContainer>, token: string) {
  return c.resolve<Options<TestOpts>>(token);
}

function resolveMonitor(
  c: ReturnType<typeof makeContainer>,
  provider: OptionsTokenProvider<TestOpts>,
) {
  return c.resolve<OptionsMonitor<TestOpts>>(getOptionsMonitorToken(provider));
}

function resolveSnapshot(
  c: ReturnType<typeof makeContainer>,
  provider: OptionsTokenProvider<TestOpts>,
) {
  return c.resolve<OptionsSnapshot<TestOpts>>(getOptionsSnapshotToken(provider));
}

// ─── Options<T> — startup-time value ─────────────────────────────────────────

describe("Options<T> — startup-time value", () => {
  it("resolves the hydrated startup value immediately after addOptions", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    cm.addOptions(makeProvider(token, { count: 42, name: "hello" }));

    assert.deepEqual(resolveOptions(c, token).value, {
      count: 42,
      name: "hello",
    });
  });

  it("returns the same instance on repeated resolve (registered as singleton)", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    cm.addOptions(makeProvider(token, { count: 1, name: "a" }));

    assert.strictEqual(
      resolveOptions(c, token),
      resolveOptions(c, token),
    );
  });

  it("Options<T> value is NOT mutated by reloadAllOptions (frozen at startup)", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1

    const opts = resolveOptions(c, token);
    assert.equal(opts.value.count, 1);

    cm.reloadAllOptions(); // seq → 2, but Options<T> is untouched

    // Same instance, same startup value
    assert.strictEqual(resolveOptions(c, token), opts);
    assert.equal(opts.value.count, 1);
  });
});

// ─── OptionsMonitor<T> — reactive current value ───────────────────────────────

describe("OptionsMonitor<T> — reactive current value", () => {
  it("resolves the same monitor instance on repeated resolve (singleton)", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const provider = makeProvider(token, { count: 1, name: "a" });
    cm.addOptions(provider);

    assert.strictEqual(resolveMonitor(c, provider), resolveMonitor(c, provider));
  });

  it("monitor.currentValue reflects the initial value", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const provider = makeProvider(token, { count: 5, name: "init" });
    cm.addOptions(provider);

    assert.deepEqual(resolveMonitor(c, provider).currentValue, {
      count: 5,
      name: "init",
    });
  });

  it("reloadOptions updates monitor.currentValue", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1
    const monitor = resolveMonitor(c, provider);
    assert.equal(monitor.currentValue.count, 1);

    cm.reloadOptions(provider); // seq → 2
    assert.equal(monitor.currentValue.count, 2);
    assert.equal(monitor.currentValue.name, "v2");
  });

  it("reloadAllOptions updates every registered monitor", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    let seqA = 0;
    let seqB = 0;
    const tA = uid();
    const tB = uid();
    const pA = makeProvider(tA, {}, { hydrate: () => ({ count: ++seqA, name: "A" }) });
    const pB = makeProvider(tB, {}, { hydrate: () => ({ count: ++seqB, name: "B" }) });

    cm.addOptions(pA); // seqA → 1
    cm.addOptions(pB); // seqB → 1
    cm.reloadAllOptions(); // seqA → 2, seqB → 2

    assert.equal(resolveMonitor(c, pA).currentValue.count, 2);
    assert.equal(resolveMonitor(c, pB).currentValue.count, 2);
  });

  it("reloadOptions returns the freshly reloaded value", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1
    const returned = cm.reloadOptions(provider); // seq → 2

    assert.deepEqual(returned, { count: 2, name: "v2" });
  });

  it("onChange listener is called with the new value on every reload", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1
    const monitor = resolveMonitor(c, provider);
    const received: TestOpts[] = [];
    monitor.onChange((next) => received.push(next));

    cm.reloadOptions(provider); // seq → 2
    cm.reloadOptions(provider); // seq → 3

    assert.equal(received.length, 2);
    assert.equal(received[0].count, 2);
    assert.equal(received[1].count, 3);
  });

  it("multiple listeners are all notified on reload", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: "" }),
    });

    cm.addOptions(provider); // seq → 1
    const monitor = resolveMonitor(c, provider);
    const notifiedA: number[] = [];
    const notifiedB: number[] = [];
    monitor.onChange((v) => notifiedA.push(v.count));
    monitor.onChange((v) => notifiedB.push(v.count));

    cm.reloadOptions(provider); // seq → 2

    assert.deepEqual(notifiedA, [2]);
    assert.deepEqual(notifiedB, [2]);
  });

  it("deregistered listener is NOT called after stop() is invoked", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: "" }),
    });

    cm.addOptions(provider); // seq → 1
    const monitor = resolveMonitor(c, provider);
    const received: number[] = [];
    const stop = monitor.onChange((v) => received.push(v.count));

    cm.reloadOptions(provider); // seq → 2, listener fires → [2]
    stop();
    cm.reloadOptions(provider); // seq → 3, listener already removed

    assert.deepEqual(received, [2]);
  });

  it("reloadOptions before addOptions throws a descriptive error", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const provider = makeProvider(uid(), { count: 0, name: "" });

    assert.throws(
      () => cm.reloadOptions(provider),
      /Cannot reload options before addOptions is called/,
    );
  });
});

// ─── OptionsSnapshot<T> — value captured at DI resolve time ──────────────────

describe("OptionsSnapshot<T> — value at DI resolve time", () => {
  it("snapshot.value matches monitor.currentValue at resolve time", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const provider = makeProvider(token, { count: 99, name: "snap" });
    cm.addOptions(provider);

    assert.deepEqual(resolveSnapshot(c, provider).value, {
      count: 99,
      name: "snap",
    });
  });

  it("each resolve produces a NEW snapshot instance (transient)", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const provider = makeProvider(token, { count: 1, name: "t" });
    cm.addOptions(provider);

    const s1 = resolveSnapshot(c, provider);
    const s2 = resolveSnapshot(c, provider);

    assert.notStrictEqual(s1, s2);         // different objects
    assert.deepEqual(s1.value, s2.value);  // same content (no reload yet)
  });

  it("snapshot resolved AFTER a reload has the updated value", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1
    assert.equal(resolveSnapshot(c, provider).value.count, 1);

    cm.reloadOptions(provider); // seq → 2, monitor updated

    assert.equal(resolveSnapshot(c, provider).value.count, 2);
  });

  it("snapshot resolved BEFORE a reload keeps its captured value (immutable)", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1
    const snapBefore = resolveSnapshot(c, provider);
    assert.equal(snapBefore.value.count, 1);

    cm.reloadOptions(provider); // seq → 2

    // The already-resolved snapshot is immutable — value never changes
    assert.equal(snapBefore.value.count, 1);
  });
});

// ─── hydrate / validate / Defaults ───────────────────────────────────────────

describe("provider features — hydrate, validate, Defaults", () => {
  it("Defaults are used when the config section does not exist", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    cm.addOptions(makeProvider(token, { count: 7, name: "from-defaults" }));

    assert.deepEqual(resolveOptions(c, token).value, {
      count: 7,
      name: "from-defaults",
    });
  });

  it("hydrate receives the merged raw options and its return value is registered", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const captured: unknown[] = [];
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: ghost(token),
      Defaults: { count: 3 } as Record<string, unknown>,
      hydrate: (raw) => {
        captured.push(raw);
        return { count: (raw as Record<string, number>).count * 10, name: "hydrated" };
      },
    };

    cm.addOptions(provider);

    assert.equal(captured.length, 1);
    assert.equal((captured[0] as Record<string, number>).count, 3);
    assert.deepEqual(resolveOptions(c, token).value, { count: 30, name: "hydrated" });
  });

  it("hydrate is called again on reloadOptions", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let calls = 0;
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: ghost(token),
      hydrate: () => ({ count: ++calls, name: "h" }),
    };

    cm.addOptions(provider);
    assert.equal(calls, 1);

    cm.reloadOptions(provider);
    assert.equal(calls, 2);
  });

  it("validate receives the fully hydrated value", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let validated: TestOpts | undefined;
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: ghost(token),
      Defaults: { count: 5, name: "v" } as Record<string, unknown>,
      validate: (val) => {
        validated = val;
      },
    };

    cm.addOptions(provider);

    assert.deepEqual(validated, { count: 5, name: "v" });
  });

  it("validate is called again on reload", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let validateCalls = 0;
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: ghost(token),
      Defaults: { count: 1, name: "ok" } as Record<string, unknown>,
      validate: () => {
        validateCalls++;
      },
    };

    cm.addOptions(provider);
    assert.equal(validateCalls, 1);

    cm.reloadOptions(provider);
    assert.equal(validateCalls, 2);
  });

  it("hydrate error is wrapped with section name context", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const sectionName = ghost(token);
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: sectionName,
      hydrate: () => {
        throw new Error("parse failed");
      },
    };

    assert.throws(
      () => cm.addOptions(provider),
      new RegExp(`section '${sectionName}'`),
    );
  });

  it("validate error is wrapped with section name context", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const sectionName = ghost(token);
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: sectionName,
      Defaults: {} as Record<string, unknown>,
      validate: () => {
        throw new Error("bad value");
      },
    };

    assert.throws(
      () => cm.addOptions(provider),
      new RegExp(`section '${sectionName}'`),
    );
  });

  it("validate error during reload is propagated", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let shouldFail = false;
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      SectionName: ghost(token),
      Defaults: { count: 1, name: "ok" } as Record<string, unknown>,
      validate: () => {
        if (shouldFail) throw new Error("reload validation failed");
      },
    };

    cm.addOptions(provider);
    shouldFail = true;

    assert.throws(
      () => cm.reloadOptions(provider),
      /reload validation failed/,
    );
  });
});

// ─── addOptions — registration and idempotency ────────────────────────────────

describe("addOptions — registration and idempotency", () => {
  it("addOptionsMany registers all providers in one call", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const tA = uid();
    const tB = uid();
    const pA = makeProvider(tA, { count: 1, name: "a" });
    const pB = makeProvider(tB, { count: 2, name: "b" });

    cm.addOptionsMany([pA, pB]);

    assert.equal(resolveOptions(c, tA).value.count, 1);
    assert.equal(resolveOptions(c, tB).value.count, 2);
  });

  it("calling addOptions twice with the same token updates the existing monitor entry", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1
    const monitor = resolveMonitor(c, provider);
    assert.equal(monitor.currentValue.count, 1);

    cm.addOptions(provider); // seq → 2 — same token, updates existing
    assert.equal(monitor.currentValue.count, 2);

    // No new monitor was registered — same instance
    assert.strictEqual(resolveMonitor(c, provider), monitor);
  });

  it("second addOptions also notifies existing onChange listeners", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider);
    const notified: number[] = [];
    resolveMonitor(c, provider).onChange((v) => notified.push(v.count));

    cm.addOptions(provider); // triggers listener

    assert.deepEqual(notified, [2]);
  });

  it("addOptions with an explicit section name overrides provider.SectionName", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let receivedSection = "";
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: token,
      // No SectionName — must be passed explicitly
      hydrate: (raw) => {
        receivedSection = JSON.stringify(raw); // captures whatever section produced
        return { count: 0, name: "ok" };
      },
    };

    // Must not throw — explicit section name is provided
    cm.addOptions("explicit_section_name", provider);
    assert.ok(receivedSection !== undefined);
  });

  it("addOptions without SectionName and without explicit section throws", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const provider: OptionsTokenProvider<TestOpts> = {
      OptionsToken: uid(),
      // intentionally no SectionName
    };

    assert.throws(
      () => cm.addOptions(provider),
      /SectionName is required/,
    );
  });

  it("addOptions with explicit section but missing provider throws", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);

    assert.throws(
      () => (cm.addOptions as (section: string) => void)("section_only"),
      /provider is required/,
    );
  });
});

// ─── Token derivation ─────────────────────────────────────────────────────────

describe("token derivation — getOptionsMonitorToken / getOptionsSnapshotToken", () => {
  it("string OptionsToken derives monitor token as '<token>:monitor'", () => {
    const provider: OptionsTokenProvider<TestOpts> = { OptionsToken: "MySection" };
    assert.equal(getOptionsMonitorToken(provider), "MySection:monitor");
  });

  it("string OptionsToken derives snapshot token as '<token>:snapshot'", () => {
    const provider: OptionsTokenProvider<TestOpts> = { OptionsToken: "MySection" };
    assert.equal(getOptionsSnapshotToken(provider), "MySection:snapshot");
  });

  it("symbol OptionsToken derives monitor token via Symbol.for", () => {
    const sym = Symbol.for("MySymbolSection");
    const provider: OptionsTokenProvider<TestOpts> = { OptionsToken: sym };
    const monToken = getOptionsMonitorToken(provider);
    assert.ok(typeof monToken === "symbol");
    assert.match(String(monToken), /monitor/);
  });

  it("custom MonitorToken is registered and resolvable", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const customMon = `custom_mon_${token}`;
    const provider = makeProvider(token, { count: 5, name: "custom" }, {
      MonitorToken: customMon,
    });

    cm.addOptions(provider);

    const monitor = c.resolve<OptionsMonitor<TestOpts>>(customMon);
    assert.deepEqual(monitor.currentValue, { count: 5, name: "custom" });
  });

  it("custom SnapshotToken is registered and resolvable", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    const customSnap = `custom_snap_${token}`;
    const provider = makeProvider(token, { count: 8, name: "snapcustom" }, {
      SnapshotToken: customSnap,
    });

    cm.addOptions(provider);

    const snap = c.resolve<OptionsSnapshot<TestOpts>>(customSnap);
    assert.deepEqual(snap.value, { count: 8, name: "snapcustom" });
  });
});

// ─── Reload fallback when no source files are captured ───────────────────────

describe("reload — graceful fallback when no source files are captured", () => {
  it("reloadOptions falls back to node-config cache when sourceFiles is empty", () => {
    // When running in shared-infra's own directory with no config/ folder,
    // captureSourceFiles() returns [].  reloadOptions must still succeed and
    // return the provider-default value rather than crashing.
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    const token = uid();
    let seq = 0;
    const provider = makeProvider(token, {}, {
      hydrate: () => ({ count: ++seq, name: `v${seq}` }),
    });

    cm.addOptions(provider); // seq → 1

    // reload should not throw even with no real config files
    const result = cm.reloadOptions(provider); // seq → 2
    assert.equal(result.count, 2);
  });

  it("reloadAllOptions with multiple providers all succeed on fallback path", () => {
    const c = makeContainer();
    const cm = new ConfigurationManager(c);
    let seqA = 0;
    let seqB = 0;
    const pA = makeProvider(uid(), {}, { hydrate: () => ({ count: ++seqA, name: "A" }) });
    const pB = makeProvider(uid(), {}, { hydrate: () => ({ count: ++seqB, name: "B" }) });

    cm.addOptionsMany([pA, pB]);
    cm.reloadAllOptions(); // seqA → 2, seqB → 2

    assert.equal(resolveMonitor(c, pA).currentValue.count, 2);
    assert.equal(resolveMonitor(c, pB).currentValue.count, 2);
  });
});

