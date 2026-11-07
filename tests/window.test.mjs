/**
 * Host log replay + client peak/off-peak blending.
 *
 * The Host route is the only place that can see event timestamps; these tests
 * pin the wire shape between `bucketEvents()` and `factorOfMix()` so a change
 * on one side cannot silently turn every session into a flat estimate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bucketEvents } from "../lib/index.js";

const CLIENT = fileURLToPath(new URL("../lib/client.js", import.meta.url));
const SOURCE = readFileSync(CLIENT, "utf8");

function loadClient() {
  const fakeRequire = (id) => {
    if (id === "react") {
      return {
        createElement: () => null,
        Fragment: function Fragment() {},
        useState: () => [false, () => {}],
        useRef: () => ({ current: null }),
        useEffect: () => {},
        useSyncExternalStore: () => "CNY",
      };
    }
    if (id === "react-dom") return { createPortal: () => null };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return {};
    throw new Error("unexpected require: " + id);
  };
  let captured;
  const windowStub = {
    localStorage: { getItem: () => null, setItem: () => {} },
    __ModuleLoader__: {
      load: ({ factory }) => {
        captured = factory(fakeRequire);
      },
    },
  };
  new Function("window", SOURCE)(windowStub);
  return captured.__test;
}

// Beijing Thursday 10:00 (peak) and Saturday 10:00 (off-peak), both whole hours.
const PEAK_HOUR = Date.parse("2026-11-05T02:00:00Z");
const OFF_HOUR = Date.parse("2026-11-07T02:00:00Z");
const RATES = { input: 1, cacheRead: 0.02, cacheWrite: 1, output: 4 };
const usage = (patch = {}) => ({
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  ...patch,
});

test("bucketEvents maps raw TokenUsage into the client's disjoint buckets", () => {
  const result = bucketEvents([
    { type: "assistant/message", time: PEAK_HOUR, data: { usage: { inputTokens: 100, cacheReadTokens: 200, outputTokens: 50 } } },
    { type: "assistant/message", time: PEAK_HOUR + 60_000, data: { usage: { inputTokens: 10, outputTokens: 5 } } },
    { type: "user/message", time: PEAK_HOUR, data: { usage: { inputTokens: 999, outputTokens: 999 } } },
    { type: "assistant/message", time: OFF_HOUR, data: { usage: { cacheReadTokens: 1000, outputTokens: 1 } } },
    { type: "assistant/message", time: OFF_HOUR, data: {} },
    { type: "assistant/message", time: OFF_HOUR, data: { usage: { inputTokens: 0, outputTokens: 0 } } },
  ]);

  assert.equal(result.messages, 3);
  assert.equal(result.tokens, 350 + 15 + 1001);
  assert.equal(result.from, PEAK_HOUR);
  assert.equal(result.to, OFF_HOUR);
  assert.equal(result.buckets.length, 2);
  assert.equal(result.buckets[0][0], PEAK_HOUR);
  assert.deepEqual(result.buckets[0][1], usage({ uncachedInputTokens: 110, cacheReadTokens: 200, outputTokens: 55 }));
  assert.equal(result.buckets[1][0], OFF_HOUR);
  assert.deepEqual(result.buckets[1][1], usage({ cacheReadTokens: 1000, outputTokens: 1 }));
});

test("bucketEvents drops junk counters and undated events without crashing", () => {
  assert.deepEqual(bucketEvents(undefined).buckets, []);
  assert.equal(bucketEvents(null).messages, 0);
  const result = bucketEvents([
    { type: "assistant/message", time: PEAK_HOUR, data: { usage: { inputTokens: -5, outputTokens: NaN, cacheReadTokens: "7", cacheWriteTokens: 3 } } },
    { type: "assistant/message", time: Number.NaN, data: { usage: { outputTokens: 5 } } },
  ]);
  assert.equal(result.messages, 2);
  assert.equal(result.tokens, 3 + 5, "only the valid cache-write counter survives");
  assert.equal(result.buckets.length, 1);
  assert.deepEqual(result.buckets[0][1], usage({ cacheWriteTokens: 3 }));
});

test("factorOfMix prices each hour at its own window, not by token count", () => {
  const api = loadClient();
  const mix = {
    share: 0.5,
    buckets: [
      [PEAK_HOUR, usage({ outputTokens: 1_000_000 })], // 4 CNY off-peak, 8 at peak
      [OFF_HOUR, usage({ cacheReadTokens: 1_000_000 })], // 0.02 CNY either way
    ],
  };
  const factor = api.factorOfMix(mix, RATES);
  assert.ok(Math.abs(factor - 8.02 / 4.02) < 1e-9);
  assert.ok(factor > 1.9, "expensive output tokens dominate the blended rate");
  assert.ok(factor > 1 + mix.share, "a flat token share would understate it");
});

test("factorOfMix is exactly 2 for a pure peak session and 1 for pure off-peak", () => {
  const api = loadClient();
  const one = (hour) => ({ share: 0, buckets: [[hour, usage({ uncachedInputTokens: 100, outputTokens: 100 })]] });
  assert.equal(api.factorOfMix(one(PEAK_HOUR), RATES), 2);
  assert.equal(api.factorOfMix(one(OFF_HOUR), RATES), 1);
  assert.equal(api.factorOfMix(null, RATES), null, "unknown log falls back to the live window");
  assert.equal(api.factorOfMix(one(PEAK_HOUR), null), null);
  assert.equal(api.factorOfMix({ share: 0, buckets: [] }, RATES), null);
});

test("windowKey keeps the live badge until a mix is known", () => {
  const api = loadClient();
  assert.equal(api.windowKey(null, true), "window.peak");
  assert.equal(api.windowKey(null, false), "window.offPeak");
  assert.equal(api.windowKey(0, true), "window.offPeak");
  assert.equal(api.windowKey(1, false), "window.peak");
  assert.equal(api.windowKey(0.4, false), "window.mixed");
});

test("windowMix store rejects malformed values and ignores unchanged polls", () => {
  const api = loadClient();
  const store = api.windowMix;
  let calls = 0;
  const unsubscribe = store.subscribe(() => (calls += 1));
  const bucket = [PEAK_HOUR, usage({ outputTokens: 10 })];

  store.set({ share: 0.5, buckets: [bucket] });
  assert.equal(store.get().share, 0.5);
  assert.equal(calls, 1);
  store.set({ share: 0.5, buckets: [[PEAK_HOUR, usage({ outputTokens: 10 })]] });
  assert.equal(calls, 1, "a 60s poll with the same split must not re-render");
  store.set({ share: 0.6, buckets: [bucket] });
  assert.equal(calls, 2);
  store.set({ share: "bad", buckets: [] });
  assert.equal(store.get(), null);
  store.set(null);
  unsubscribe();
});
