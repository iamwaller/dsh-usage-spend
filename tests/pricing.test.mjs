import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT = fileURLToPath(new URL("../lib/client.js", import.meta.url));
const SOURCE = readFileSync(CLIENT, "utf8");

function loadClient(storage = {}) {
  const values = new Map(Object.entries(storage));
  const localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
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
    localStorage,
    __ModuleLoader__: {
      load: ({ factory }) => {
        captured = factory(fakeRequire);
      },
    },
  };
  new Function("window", SOURCE)(windowStub);
  return { api: captured.__test, localStorage };
}

test("deepseek-flash rates resolve through the provider alias", () => {
  const { api } = loadClient();
  const priced = api.priceFor({ provider: "deepseek-account", model: "deepseek-flash" });
  assert.ok(priced);
  assert.equal(priced.rates.input, 0.15);
  assert.equal(priced.rates.cacheRead, 0.003);
  assert.equal(priced.rates.output, 0.6);
  assert.equal(priced.custom, false);
});

test("unknown models have no price", () => {
  const { api } = loadClient();
  assert.equal(api.priceFor({ provider: "deepseek-account", model: "no-such-model" }), null);
  assert.equal(api.priceFor(null), null);
});

test("cost sums disjoint buckets per million tokens", () => {
  const { api } = loadClient();
  const rates = { input: 0.15, cacheRead: 0.003, cacheWrite: 0.15, output: 0.6 };
  const usage = {
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 0,
    outputTokens: 1_000_000,
  };
  assert.ok(Math.abs(api.costOf(usage, rates) - 0.753) < 1e-12);
  assert.equal(api.costOf(usage, null), null);
});

test("billed input and total include every prompt bucket", () => {
  const { api } = loadClient();
  const usage = {
    uncachedInputTokens: 10,
    cacheReadTokens: 20,
    cacheWriteTokens: 30,
    outputTokens: 40,
  };
  assert.equal(api.billedInput(usage), 60);
  assert.equal(api.totalTokens(usage), 100);
});

test("cache hit never rounds a partial hit up to 100", () => {
  const { api } = loadClient();
  assert.equal(api.cacheHitPercent({ uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }), null);
  assert.equal(api.cacheHitPercent({ uncachedInputTokens: 0, cacheReadTokens: 10, cacheWriteTokens: 0, outputTokens: 1 }), "100");
  assert.equal(api.cacheHitPercent({ uncachedInputTokens: 5, cacheReadTokens: 15, cacheWriteTokens: 0, outputTokens: 1 }), "75");
  assert.equal(api.cacheHitPercent({ uncachedInputTokens: 1, cacheReadTokens: 99_999, cacheWriteTokens: 0, outputTokens: 1 }), "99.9");
});

test("token and amount formatting stay compact", () => {
  const { api } = loadClient();
  assert.equal(api.formatTokens(0), "0");
  assert.equal(api.formatTokens(999), "999");
  assert.equal(api.formatTokens(1234), "1.2K");
  assert.equal(api.formatTokens(2_400_000), "2.4M");
  assert.equal(api.amount(0.00012), "0.0001");
  assert.equal(api.amount(0.0123), "0.012");
  assert.equal(api.amount(1.234), "1.23");
});

test("localStorage price overrides win over the built-in table", () => {
  const { api } = loadClient({
    "dsh.cost.prices": JSON.stringify({
      "deepseek-flash": { input: 1, cacheRead: 0.1, cacheWrite: 1, output: 2 },
    }),
  });
  const priced = api.priceFor({ provider: "deepseek-account", model: "deepseek-flash" });
  assert.ok(priced);
  assert.equal(priced.custom, true);
  assert.equal(priced.rates.input, 1);
  assert.equal(priced.rates.output, 2);
});

test("currency formatting honours the stored rate", () => {
  const { api } = loadClient({ "dsh.cost.usdToCny": "7" });
  assert.equal(api.moneyText(0.01, "CNY"), "≈¥0.070");
  assert.equal(api.moneyText(0.01, "USD"), "≈$0.010");
  assert.ok(api.moneyText(0.01, "BOTH").includes("≈¥0.070 / ≈$0.010"));
});

test("config values are sanitised and win over the local fallback", () => {
  const { api } = loadClient({ "dsh.cost.currency": "CNY", "dsh.cost.usdToCny": "7" });
  assert.equal(api.sanitizeCurrency("USD"), "USD");
  assert.equal(api.sanitizeCurrency("bogus"), "CNY");
  assert.equal(api.sanitizeRate("8.1"), 8.1);
  assert.equal(api.sanitizeRate("0"), 7.2);

  const writes = [];
  const form = {
    getSnapshot: () => ({ status: "ready", writable: true, value: { currency: "USD", usdToCny: 8 } }),
    subscribe: () => () => {},
    set: async (field, value) => {
      writes.push([field, value]);
      return true;
    },
  };
  const store = api.createConfigStore("usage-cost", () => ({ currency: "CNY", usdToCny: 7 }));
  store.attach(form);
  assert.deepEqual(store.get(), { currency: "USD", usdToCny: 8, showBalance: true, ready: true, writable: true });
  return store.setCurrency("BOTH").then(() => {
    assert.deepEqual(writes, [["currency", "BOTH"]]);
  });
});

test("balance formatting handles grouping, tiny and negative amounts", () => {
  const { api } = loadClient();
  assert.equal(api.formatMoney("12345.678", "CNY"), "¥12,345.68");
  assert.equal(api.formatMoney("0", "USD"), "$0.00");
  assert.equal(api.formatMoney("0.001", "CNY"), "¥<0.01");
  assert.equal(api.formatMoney("-0.001", "CNY"), "-¥0.01");
  assert.equal(api.compactMoney("1234", "CNY"), "¥1.2k");
  assert.equal(api.compactMoney("12.6", "USD"), "$13");
  assert.equal(api.walletListText([{ balance: "12", currency: "CNY" }, { balance: "3", currency: "USD" }]), "¥12.00 / $3.00");
});

test("balance store maps the account remote result", async () => {
  const { api } = loadClient();
  const store = api.createBalanceStore({
    locale: { getSnapshot: () => ({ active: "zh" }) },
    remote: {
      account: {
        getBalance: async () => ({
          ok: true,
          value: {
            status: "ready",
            value: [{ currency: "CNY", balance: "12.5" }],
            bonusWallets: [{ currency: "CNY", balance: "1" }],
          },
        }),
      },
    },
  });
  await store.refresh();
  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().wallets[0].balance, "12.5");
  assert.equal(store.getSnapshot().bonusWallets.length, 1);
});

test("balance store can resolve the nested remote.account service", async () => {
  const { api } = loadClient();
  const store = api.createBalanceStore({
    locale: { getSnapshot: () => ({ active: "zh" }) },
    get: (name) =>
      name === "remote.account"
        ? {
            getBalance: async () => ({
              ok: true,
              value: { status: "ready", value: [{ currency: "USD", balance: "2" }], bonusWallets: [] },
            }),
          }
        : undefined,
  });
  await store.refresh();
  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().wallets[0].currency, "USD");
});

test("showBalance defaults on and follows the Host form", () => {
  const { api } = loadClient();
  const store = api.createConfigStore("usage-cost", () => ({ currency: "CNY", usdToCny: 7 }));
  assert.equal(store.get().showBalance, true);
  store.attach({
    getSnapshot: () => ({ status: "ready", writable: true, value: { currency: "CNY", usdToCny: 7, showBalance: false } }),
    subscribe: () => () => {},
    set: async () => true,
  });
  assert.equal(store.get().showBalance, false);
});
