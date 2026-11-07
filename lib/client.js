/**
 * dsh-usage-spend — browser half.
 *
 * Contributes:
 *  - `conversation.composer.dock` id `usage` at priority -1, replacing the
 *    built-in token-usage pill with one that also shows estimated spend and
 *    keeps the cache-hit reading. Its dialog puts the amount right after the
 *    exact token count.
 *  - `conversation.chat.turnTail` id `turn-usage-cost`: a hidden anchor that
 *    rewrites the built-in per-turn "用量 N tok" action label to
 *    "N tok · ≈¥x.xx" (the line itself is gone).
 *  - `plugins.row.config` for this row, so the Plugins page exposes the
 *    currency and exchange-rate settings.
 *
 * Pricing is a local CNY / 1M token table taken from DeepSeek's official card,
 * with the peak-hours multiplier (Beijing time, weekdays, holiday calendar) and
 * an optional localStorage override. No network request is made for pricing.
 */
window.__ModuleLoader__.load({
  id: "dsh-usage-spend",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const ReactDOM = require("react-dom");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;

    const NS = "dsh-usage-spend";
    const STYLE_ID = "dsh-usage-spend/styles";
    const ENTRY_ID = "usage-cost";
    const CONFIG_KEY = "dsh-usage-spend#usage-cost";
    const CURRENCY_KEY = "dsh.cost.currency";
    const RATE_KEY = "dsh.cost.usdToCny";
    const PRICES_KEY = "dsh.cost.prices";
    const DEFAULT_RATE = 7.2;

    // ---------------------------------------------------------------- locale
    const zh = {
      "pill.tokens": "{count} tok",
      "pill.cacheHit": "缓存命中 {percent}%",
      "window.peak": "峰",
      "window.offPeak": "谷",
      "dialog.title": "Token 用量",
      "dialog.cacheHit": "缓存命中",
      "dialog.input": "未缓存输入",
      "dialog.cacheRead": "缓存读取",
      "dialog.cacheWrite": "缓存写入",
      "dialog.output": "输出",
      "dialog.window": "计费时段",
      "dialog.windowPeak": "高峰（×2）",
      "dialog.windowOffPeak": "空闲",
      "currency.cny": "¥ 人民币",
      "currency.usd": "$ 美元",
      "currency.both": "¥+$",
      "config.summary": "在会话底部显示 token 用量与估算花费，可设置币种和汇率。",
      "config.title": "用量与花费",
      "config.currency": "显示币种",
      "config.rate": "汇率：1 USD = ? CNY",
      "config.rateHint": "只用于换算美元金额；人民币按官方价目直接计价。",
      "config.ratesTitle": "单价（元 / 1M tok，空闲时段）",
      "config.ratesNote": "官方价目，仅供估算。高峰时段为表中价格的两倍：北京时间周一至周五 9:00–12:00、14:00–18:00，法定节假日除外；其余时段（含周末与节假日全天）为空闲时段。",
      "config.model": "模型",
      "config.showBalance": "显示左侧栏余额",
      "config.showBalanceHint": "关闭后不显示余额 chip，也不会请求账号余额。",
      "balance.label": "余额",
      "balance.windowPeak": "当前按高峰价估算（表价 ×2）",
      "balance.windowOffPeak": "当前按空闲价估算",
      "balance.loading": "读取中…",
      "balance.unavailable": "暂不可用",
      "balance.signedOut": "未登录",
      "balance.refresh": "点击刷新余额",
      "balance.tooltip": "充值余额 {wallets}",
      "balance.bonus": "赠金 {wallets}",
      "config.save": "保存",
      "config.saving": "保存中…",
      "config.saved": "已保存",
      "config.failed": "保存失败，请检查取值后重试。",
      "config.reset": "恢复默认",
      "config.readOnly": "当前部署的设置为只读。",
      "config.unavailable": "配置表单不可用（设置服务未加载）。",
      "config.invalidRate": "汇率需为 1–100 之间的数字。",
    };
    const en = {
      "pill.tokens": "{count} tok",
      "pill.cacheHit": "cache hit {percent}%",
      "window.peak": "peak",
      "window.offPeak": "off-peak",
      "dialog.title": "Token usage",
      "dialog.cacheHit": "Cache hit",
      "dialog.input": "Uncached input",
      "dialog.cacheRead": "Cache read",
      "dialog.cacheWrite": "Cache write",
      "dialog.output": "Output",
      "dialog.window": "Billing window",
      "dialog.windowPeak": "Peak (×2)",
      "dialog.windowOffPeak": "Off-peak",
      "currency.cny": "¥ CNY",
      "currency.usd": "$ USD",
      "currency.both": "¥+$",
      "config.summary": "Shows token usage and estimated spend under the composer, with currency and exchange-rate settings.",
      "config.title": "Usage and spend",
      "config.currency": "Display currency",
      "config.rate": "Exchange rate: 1 USD = ? CNY",
      "config.rateHint": "Only converts the USD figure; CNY comes straight from the official card.",
      "config.ratesTitle": "Rates (CNY / 1M tok, off-peak)",
      "config.ratesNote": "Official card, estimates only. Peak hours cost twice these rates: Beijing time Mon–Fri 09:00–12:00 and 14:00–18:00, excluding Chinese public holidays; everything else, weekends and holidays included, is off-peak.",
      "config.model": "Model",
      "config.showBalance": "Show the sidebar balance",
      "config.showBalanceHint": "When off, the balance chip is hidden and no balance request is made.",
      "balance.label": "Balance",
      "balance.windowPeak": "Estimated at peak rates (twice the card)",
      "balance.windowOffPeak": "Estimated at off-peak rates",
      "balance.loading": "Loading…",
      "balance.unavailable": "Unavailable",
      "balance.signedOut": "Not signed in",
      "balance.refresh": "Click to refresh the balance",
      "balance.tooltip": "Credit balance {wallets}",
      "balance.bonus": "Bonus {wallets}",
      "config.save": "Save",
      "config.saving": "Saving…",
      "config.saved": "Saved",
      "config.failed": "The values were not accepted; check them and retry.",
      "config.reset": "Reset to default",
      "config.readOnly": "This deployment stores settings read-only.",
      "config.unavailable": "The configuration form is unavailable (settings service not loaded).",
      "config.invalidRate": "Enter an exchange rate between 1 and 100.",
    };

    // ----------------------------------------------------------------- styles
    const CSS = [
      ".dshuc_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
      ".dshuc_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}",
      ".dshuc_pill svg{flex:none;width:14px;height:14px}",
      "button.dshuc_pill{cursor:pointer}",
      "button.dshuc_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      "@media (hover:hover){button.dshuc_pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}",
      ".dshuc_label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
      ".dshuc_sep{color:var(--dsw-alias-separator-primary);margin:0 6px}",
      ".dshuc_money{color:var(--dsw-alias-label-secondary)}",
      ".dshuc_window{flex:none;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xs,4px);padding:0 3px;font-size:10px;line-height:14px}",
      ".dshuc_balance[data-wide=false] .dshuc_window{display:none}",
      ".dshuc_panel{z-index:1100;box-sizing:border-box;width:max-content;min-width:min(300px,calc(100vw - 24px),var(--dsh-anchored-max-width,100vw));max-width:min(440px,calc(100vw - 24px),var(--dsh-anchored-max-width,100vw));border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;max-height:var(--dsh-anchored-max-height,none);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;padding:16px;font-size:12px;line-height:18px;position:fixed;overflow:hidden auto}",
      ".dshuc_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
      ".dshuc_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}",
      ".dshuc_titleValue{font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}",
      ".dshuc_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}",
      ".dshuc_titleLabel svg{flex:none;width:14px;height:14px}",
      ".dshuc_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
      ".dshuc_details dt,.dshuc_details dd{min-width:0;margin:0}",
      ".dshuc_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}",
      ".dshuc_cfg{display:flex;flex-direction:column;gap:14px;max-width:560px}",
      ".dshuc_cfgTitle{color:var(--dsw-alias-label-primary);font-weight:500;font-size:13px;line-height:20px}",
      ".dshuc_field{display:flex;flex-direction:column;gap:4px}",
      ".dshuc_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}",
      ".dshuc_toggleRow{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer}",
      ".dshuc_input{box-sizing:border-box;width:100%;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-l1,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:5px 8px;outline:0}",
      ".dshuc_input:focus{border-color:var(--dsw-alias-label-accent,#6aa9ff)}",
      ".dshuc_hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
      ".dshuc_actions{display:flex;align-items:center;gap:8px}",
      ".dshuc_status{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
      ".dshuc_status[data-tone=error]{color:var(--dsw-alias-state-error-primary,#f2a1a1)}",
      ".dshuc_cfgNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}",
      ".dshuc_table{border-collapse:collapse;width:100%;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}",
      ".dshuc_table th{color:var(--dsw-alias-label-tertiary);font-weight:400;text-align:right;padding:4px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
      ".dshuc_table th:first-child{text-align:left}",
      ".dshuc_table td{color:var(--dsw-alias-label-secondary);text-align:right;padding:4px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
      ".dshuc_table td:first-child{text-align:left;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}",
      ".dshuc_table tr:last-child td{border-bottom:0}",
      ".dshuc_balance{box-sizing:border-box;display:flex;align-items:center;gap:6px;width:100%;height:32px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;overflow:hidden}",
      "@media (hover:hover){.dshuc_balance:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}",
      ".dshuc_balanceGlyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-skeleton);font-size:10px;line-height:16px}",
      ".dshuc_balanceLabel{text-overflow:ellipsis;overflow:hidden;min-width:0}",
      ".dshuc_balanceValue{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}",
      ".dshuc_balance[data-wide=false]{width:36px;height:36px;justify-content:center;padding:0;gap:0}",
      ".dshuc_balance[data-wide=false] .dshuc_balanceLabel,.dshuc_balance[data-wide=false] .dshuc_balanceGlyph{display:none}",
      ".dshuc_balance[data-wide=false] .dshuc_balanceValue{margin:0;font-size:10px}",
      "[class*='footerActions']:has(.dshuc_balance){flex-wrap:wrap}",
    ].join("");

    function injectStyles() {
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-usage-spend";
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ---------------------------------------------------------------- storage
    function readStorage(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    function writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage may be unavailable */
      }
    }
    function readCurrency() {
      const value = readStorage(CURRENCY_KEY);
      return value === "USD" || value === "BOTH" || value === "CNY" ? value : "CNY";
    }
    function readRate() {
      const raw = Number(readStorage(RATE_KEY));
      return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RATE;
    }
    function sanitizeCurrency(value) {
      return value === "USD" || value === "BOTH" ? value : "CNY";
    }
    function sanitizeRate(value) {
      const rate = Number(value);
      return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE;
    }

    // ------------------------------------------------------------ config store
    /**
     * Live values from the Host settings form, with localStorage as the fallback
     * until the settings mirror answers (or when the service is not composed).
     */
    function createConfigStore(entryId, fallback) {
      let form = null;
      let off = null;
      let current = null;
      const listeners = new Set();

      function build() {
        let value = null;
        let writable = false;
        let ready = false;
        if (form !== null) {
          try {
            const snapshot = form.getSnapshot();
            if (snapshot !== undefined && snapshot.status === "ready" && snapshot.value !== undefined) {
              value = snapshot.value;
              writable = snapshot.writable !== false;
              ready = true;
            }
          } catch {
            /* keep the fallback */
          }
        }
        const base = fallback();
        return Object.freeze({
          currency: sanitizeCurrency(value?.currency ?? base.currency),
          usdToCny: sanitizeRate(value?.usdToCny ?? base.usdToCny),
          showBalance: value?.showBalance !== false,
          ready,
          writable,
        });
      }
      function refresh() {
        current = build();
        for (const listener of listeners) {
          try {
            listener();
          } catch {
            /* a listener must not break the store */
          }
        }
      }
      current = build();

      return {
        get: () => current,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        attach(next) {
          if (off !== null) {
            try {
              off();
            } catch {
              /* the previous form may already be disposed */
            }
            off = null;
          }
          form = next;
          if (next !== null && typeof next.subscribe === "function") off = next.subscribe(refresh);
          refresh();
          return () => {
            if (form === next) form = null;
            if (off !== null) {
              off();
              off = null;
            }
            refresh();
          };
        },
        async setCurrency(value) {
          const next = sanitizeCurrency(value);
          if (form !== null && current.ready && current.writable) {
            try {
              if (await form.set("currency", next)) {
                refresh();
                return true;
              }
            } catch {
              /* fall through to the local override */
            }
          }
          writeStorage(CURRENCY_KEY, next);
          refresh();
          return true;
        },
        async setRate(value) {
          const next = sanitizeRate(value);
          if (form !== null && current.ready && current.writable) {
            try {
              if (await form.set("usdToCny", next)) {
                refresh();
                return true;
              }
            } catch {
              /* fall through to the local override */
            }
          }
          writeStorage(RATE_KEY, String(next));
          refresh();
          return true;
        },
        entryId,
      };
    }

    const configStore = createConfigStore(ENTRY_ID, () => ({ currency: readCurrency(), usdToCny: readRate() }));
    function useConfig() {
      return React.useSyncExternalStore(configStore.subscribe, configStore.get, configStore.get);
    }

    function attachConfig(ctx) {
      if (typeof ctx.inject !== "function") return;
      try {
        ctx.inject(["configForms"], (scope) => {
          let forms = scope.configForms;
          if (forms === undefined && typeof scope.get === "function") forms = scope.get("configForms");
          if (forms === undefined || typeof forms.get !== "function") return;
          const detach = configStore.attach(forms.get(ENTRY_ID));
          if (typeof scope.effect === "function") {
            scope.effect(() => detach, "dsh-usage-spend: config form");
          }
        });
      } catch {
        /* the fallback store keeps working */
      }
    }

    // ----------------------------------------------------------------- prices
    /**
     * CNY per 1M tokens, off-peak rates from the official card
     * (api-docs.deepseek.com/zh-cn/quick_start/pricing, checked 2026-11-07).
     * Peak hours cost twice these rates. Cache writes bill at the cache-miss
     * input price, which is what DeepSeek charges for them.
     */
    const MODEL_PRICES = {
      "deepseek-flash": { input: 1, cacheRead: 0.02, cacheWrite: 1, output: 4 },
      // Retired names: still accepted by the API, served and billed as Flash.
      "deepseek-v4-flash": { input: 1, cacheRead: 0.02, cacheWrite: 1, output: 4 },
      "deepseek-v4-flash-vision-exp": { input: 1, cacheRead: 0.02, cacheWrite: 1, output: 4 },
      "deepseek-v4-pro": { input: 4.5, cacheRead: 0.15, cacheWrite: 4.5, output: 13.5 },
    };

    // ------------------------------------------------------------ peak hours
    /**
     * Peak = Beijing time, Monday to Friday, 09:00–12:00 and 14:00–18:00,
     * excluding Chinese public holidays. Peak costs twice the off-peak rate.
     * Everything else — nights, weekends, whole holiday days — is off-peak.
     */
    const PEAK_FACTOR = 2;
    const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
    const PEAK_HOURS = [
      [9, 12],
      [14, 18],
    ];
    /** 国务院办公厅 2026 年放假安排；次年公布后追加即可。 */
    const PUBLIC_HOLIDAY_RANGES = [
      ["2026-01-01", "2026-01-03"], // 元旦
      ["2026-02-15", "2026-02-23"], // 春节
      ["2026-04-04", "2026-04-06"], // 清明
      ["2026-05-01", "2026-05-05"], // 劳动节
      ["2026-06-19", "2026-06-21"], // 端午
      ["2026-09-25", "2026-09-27"], // 中秋
      ["2026-10-01", "2026-10-07"], // 国庆
    ];
    const PUBLIC_HOLIDAYS = (() => {
      const days = new Set();
      for (const [from, to] of PUBLIC_HOLIDAY_RANGES) {
        const last = Date.parse(to + "T00:00:00Z");
        for (let at = Date.parse(from + "T00:00:00Z"); at <= last; at += 86_400_000) {
          days.add(new Date(at).toISOString().slice(0, 10));
        }
      }
      return days;
    })();

    /** Beijing wall-clock parts for an instant, independent of the host timezone. */
    function beijingParts(at) {
      const shifted = new Date(Number(at) + BEIJING_OFFSET_MS);
      return {
        date: shifted.toISOString().slice(0, 10),
        weekday: shifted.getUTCDay(),
        hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
      };
    }
    /** True while DeepSeek bills this instant at the peak rate. */
    function isPeak(at) {
      const ms = Number(at);
      if (!Number.isFinite(ms)) return false;
      const { date, weekday, hour } = beijingParts(ms);
      if (weekday === 0 || weekday === 6) return false;
      if (PUBLIC_HOLIDAYS.has(date)) return false;
      return PEAK_HOURS.some(([from, to]) => hour >= from && hour < to);
    }
    /** Multiplier applied to the off-peak card. */
    function peakFactor(at) {
      return isPeak(at) ? PEAK_FACTOR : 1;
    }

    /**
     * Turn-end time for each per-turn usage object. The object is owned by the
     * chat snapshot, so keying by it keeps the selector's identity stable
     * while still telling the render which billing window to use.
     */
    const TURN_TIMES = new WeakMap();

    const PRICE_OVERRIDES = (() => {
      const raw = readStorage(PRICES_KEY);
      if (raw === null) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    })();

    function normalizeRates(value) {
      if (value === null || typeof value !== "object") return null;
      const input = Number(value.input);
      const output = Number(value.output);
      const cacheRead = Number(value.cacheRead);
      const cacheWrite = Number(value.cacheWrite);
      if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
      return {
        input,
        output,
        cacheRead: Number.isFinite(cacheRead) && cacheRead >= 0 ? cacheRead : input,
        cacheWrite: Number.isFinite(cacheWrite) && cacheWrite >= 0 ? cacheWrite : input,
      };
    }

    function priceFor(route) {
      if (route === null || route === undefined || typeof route.model !== "string" || route.model === "") return null;
      const model = route.model;
      const bare = model.slice(model.lastIndexOf("/") + 1);
      const candidates = [model, route.provider + "/" + model, bare];
      for (const key of candidates) {
        const override = PRICE_OVERRIDES[key];
        if (override !== undefined) {
          const rates = normalizeRates(override);
          if (rates !== null) return { rates, custom: true };
        }
      }
      const table = MODEL_PRICES[bare] ?? MODEL_PRICES[model];
      if (table === undefined) return null;
      const rates = normalizeRates(table);
      return rates === null ? null : { rates, custom: false };
    }

    // ------------------------------------------------------------------ money
    function num(value) {
      return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
    }
    function billedInput(usage) {
      return num(usage.uncachedInputTokens) + num(usage.cacheReadTokens) + num(usage.cacheWriteTokens);
    }
    function totalTokens(usage) {
      return billedInput(usage) + num(usage.outputTokens);
    }
    /** CNY for this usage at the given off-peak rates, scaled by the peak factor. */
    function costOf(usage, rates, factor) {
      if (rates === null) return null;
      const scale = Number.isFinite(factor) && factor > 0 ? factor : 1;
      const cny =
        ((num(usage.uncachedInputTokens) * rates.input +
          num(usage.cacheReadTokens) * rates.cacheRead +
          num(usage.cacheWriteTokens) * rates.cacheWrite +
          num(usage.outputTokens) * rates.output) /
          1e6) *
        scale;
      return Number.isFinite(cny) ? cny : null;
    }
    function cacheHitPercent(usage) {
      const prompt = billedInput(usage);
      if (prompt === 0) return null;
      if (num(usage.cacheReadTokens) >= prompt) return "100";
      const percent = (num(usage.cacheReadTokens) / prompt) * 100;
      const rounded = Math.round(percent * 10) / 10;
      if (rounded >= 100) return "99.9";
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    }
    function formatTokens(value) {
      if (!Number.isFinite(value) || value <= 0) return "0";
      if (value < 1000) return String(Math.round(value));
      if (value < 1e6) return (value / 1e3).toFixed(1) + "K";
      return (value / 1e6).toFixed(1) + "M";
    }
    function exactCount(value) {
      return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function amount(value) {
      if (!Number.isFinite(value)) return "0";
      if (value >= 100) return value.toFixed(0);
      if (value >= 1) return value.toFixed(2);
      if (value >= 0.01) return value.toFixed(3);
      return value.toFixed(4);
    }
    function moneyText(cny, currency, rate, spaced) {
      if (cny === null) return null;
      const gap = spaced === true ? " " : "";
      const perUsd = Number.isFinite(rate) && rate > 0 ? rate : readRate();
      const yuan = "≈" + gap + "¥" + amount(cny);
      const dollar = "≈" + gap + "$" + amount(cny / perUsd);
      if (currency === "USD") return dollar;
      if (currency === "BOTH") return yuan + " / " + dollar;
      return yuan;
    }

    // --------------------------------------------------------------- balance
    function moneySymbol(currency) {
      return currency === "USD" ? "$" : "¥";
    }
    function groupDigits(text) {
      return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    /** Two decimals with grouping; tiny positive amounts read as `<0.01`. */
    function formatMoney(value, currency) {
      const symbol = moneySymbol(currency);
      const number = Number(value);
      if (!Number.isFinite(number)) return symbol + "0.00";
      if (number === 0) return symbol + "0.00";
      if (number < 0) {
        const absolute = Math.abs(number);
        return "-" + symbol + (absolute < 0.01 ? "0.01" : groupDigits(absolute.toFixed(2)));
      }
      if (number < 0.01) return symbol + "<0.01";
      return symbol + groupDigits(number.toFixed(2));
    }
    /** Approximation that fits the 36px collapsed rail. */
    function compactMoney(value, currency) {
      const symbol = moneySymbol(currency);
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0) return symbol + "0";
      const sign = number < 0 ? "-" : "";
      const absolute = Math.abs(number);
      if (absolute >= 1000) return sign + symbol + (absolute / 1000).toFixed(1).replace(/\.0$/, "") + "k";
      if (absolute >= 1) return sign + symbol + String(Math.round(absolute));
      return sign + symbol + "<1";
    }
    function walletListText(wallets) {
      return wallets.map((wallet) => formatMoney(wallet.balance, wallet.currency)).join(" / ");
    }

    function createBalanceStore(ctx) {
      let state = Object.freeze({ status: "idle", wallets: Object.freeze([]), bonusWallets: Object.freeze([]), error: null });
      const listeners = new Set();
      let timer = null;
      let retryTimer = null;
      let running = false;
      let generation = 0;
      const retrySoon = (delayMs) => {
        if (!running || retryTimer !== null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void refresh();
        }, delayMs);
        if (retryTimer !== null && typeof retryTimer === "object" && typeof retryTimer.unref === "function") retryTimer.unref();
      };
      const publish = (patch) => {
        state = Object.freeze({ ...state, ...patch });
        for (const listener of listeners) {
          try {
            listener();
          } catch {
            /* a subscriber must not break the balance chip */
          }
        }
      };
      const clientMeta = () => {
        let locale = "zh";
        try {
          locale = ctx.locale.getSnapshot().active;
        } catch {
          /* keep the default */
        }
        return {
          version: "0.2.2-rc.1",
          locale,
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        };
      };
      const refresh = async () => {
        const generationAtStart = ++generation;
        if (state.status === "idle") publish({ status: "loading", error: null });
        try {
          const remote = ctx.remote;
          const account =
            remote !== undefined && remote !== null && remote.account !== undefined
              ? remote.account
              : typeof ctx.get === "function"
                ? ctx.get("remote.account")
                : undefined;
          if (account === undefined || account === null || typeof account.getBalance !== "function") {
            publish({ status: "loading", error: "account remote not mounted" });
            retrySoon(1000);
            return;
          }
          const result = await account.getBalance(clientMeta());
          if (generationAtStart !== generation) return;
          if (result === null || result === undefined || result.ok !== true) {
            publish({ status: "unavailable", error: result?.error?.code ?? "balance request failed" });
            retrySoon(5000);
            return;
          }
          const value = result.value;
          if (value === null || value === undefined) {
            publish({ status: "signedOut", wallets: Object.freeze([]), bonusWallets: Object.freeze([]), error: "account grant unavailable" });
            return;
          }
          if (value.status !== "ready") {
            publish({ status: "unavailable", error: "balance " + String(value.status) });
            return;
          }
          publish({
            status: "ready",
            wallets: Object.freeze(Array.isArray(value.value) ? value.value : []),
            bonusWallets: Object.freeze(Array.isArray(value.bonusWallets) ? value.bonusWallets : []),
            error: null,
          });
        } catch (error) {
          if (generationAtStart !== generation) return;
          publish({ status: "unavailable", error: error instanceof Error ? error.message : String(error) });
        }
      };
      const onVisible = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") void refresh();
      };
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        refresh,
        start() {
          if (running) return;
          running = true;
          void refresh();
          timer = setInterval(() => {
            void refresh();
          }, 60000);
          if (timer !== null && typeof timer === "object" && typeof timer.unref === "function") timer.unref();
          if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
        },
        stop() {
          running = false;
          generation += 1;
          if (timer !== null) {
            clearInterval(timer);
            timer = null;
          }
          if (retryTimer !== null) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
        },
      };
    }

    function BalanceChip({ wide, balance, t }) {
      const config = useConfig();
      const peak = isPeak(Date.now());
      const state = React.useSyncExternalStore(balance.subscribe, balance.getSnapshot, balance.getSnapshot);
      if (!config.showBalance) return null;
      const wallets = state.wallets ?? [];
      const bonusWallets = state.bonusWallets ?? [];
      const symbol = wallets[0]?.currency === "USD" ? "$" : "¥";
      let value;
      if (state.status === "ready") {
        value =
          wallets.length === 0
            ? formatMoney(0, "CNY")
            : wide
              ? walletListText(wallets)
              : compactMoney(wallets[0].balance, wallets[0].currency);
      } else if (state.status === "signedOut") {
        value = wide ? t("balance.signedOut") : "--";
      } else if (state.status === "unavailable") {
        value = "--";
      } else {
        value = "…";
      }
      const windowText = t(peak ? "balance.windowPeak" : "balance.windowOffPeak");
      const tooltip =
        state.status === "ready"
          ? [
              t("balance.tooltip", { wallets: wallets.length > 0 ? walletListText(wallets) : formatMoney(0, "CNY") }),
              bonusWallets.length > 0 ? t("balance.bonus", { wallets: walletListText(bonusWallets) }) : null,
              windowText,
              t("balance.refresh"),
            ]
              .filter((part) => part !== null)
              .join(" · ")
          : state.status === "signedOut"
            ? t("balance.signedOut") + " · " + t("balance.refresh")
            : state.status === "unavailable"
              ? t("balance.unavailable") + (state.error ? "（" + state.error + "）" : "") + " · " + t("balance.refresh")
              : t("balance.loading");
      return h(
        primitives.Tooltip,
        {
          label: tooltip,
          side: "top",
          children: h(
            "button",
            {
              type: "button",
              className: "dshuc_balance",
              "data-wide": wide,
              "aria-label": tooltip,
              onClick: () => {
                void balance.refresh();
              },
            },
            h("span", { className: "dshuc_balanceGlyph", "aria-hidden": true }, symbol),
            h("span", { className: "dshuc_balanceLabel" }, t("balance.label")),
            h("span", { className: "dshuc_balanceValue" }, value),
            wide ? h("span", { className: "dshuc_window" }, t(peak ? "window.peak" : "window.offPeak")) : null,
          ),
        },
      );
    }

    function attachBalance(ctx) {
      if (typeof ctx.inject !== "function") return;
      try {
        ctx.inject(["remote", "remote.account", "remoteAccess"], (scope) => {
          const balance = createBalanceStore(scope);
          let unsubscribe = null;
          const register = () => {
            const sync = () => {
              if (configStore.get().showBalance) balance.start();
              else balance.stop();
            };
            unsubscribe = configStore.subscribe(sync);
            sync();
            const slots = scope.slots ?? (typeof scope.get === "function" ? scope.get("slots") : undefined);
            if (slots === undefined || typeof slots.inject !== "function") {
              return () => {
                unsubscribe?.();
                unsubscribe = null;
                balance.stop();
              };
            }
            const off = slots.inject("sidebar.footer.action", () =>
              slots.register(
                {
                  name: "sidebar.footer.action",
                  id: "usage-cost-balance",
                  order: 10,
                  locale: NS,
                  inject: () => ({ balance }),
                },
                BalanceChip,
              ),
            );
            return () => {
              unsubscribe?.();
              unsubscribe = null;
              balance.stop();
              off?.();
            };
          };
          const access = scope.remoteAccess;
          if (access !== undefined && typeof access.whenAccess === "function") {
            scope.effect(() => access.whenAccess("account/watch", register), "dsh-usage-spend: balance");
          } else {
            scope.effect(() => register(), "dsh-usage-spend: balance");
          }
        });
      } catch {
        /* the balance chip is best effort */
      }
    }

    // -------------------------------------------------------------- components
    const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };

    function DialogPill(props) {
      const { stat, icon, label, text, title, titleValue, children } = props;
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const pos = primitives.useAnchoredPosition({
        open,
        anchorRef: rootRef,
        panelRef,
        side: "top",
        gap: 8,
        margin: 12,
      });
      primitives.useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
      React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [open]);
      return h(
        "span",
        { ref: rootRef, className: "dshuc_anchor", "data-composer-stat": stat },
        h(
          primitives.Tooltip,
          {
            label: text,
            side: "top",
            portal: true,
            delayMs: 200,
            onlyWhenClipped: true,
            disabled: open,
          },
          h(
            "button",
            {
              type: "button",
              className: "dshuc_pill",
              "aria-haspopup": "dialog",
              "aria-expanded": open,
              "aria-label": text,
              onClick: () => setOpen(!open),
            },
            icon,
            h("span", { className: "dshuc_label" }, label),
          ),
        ),
        open &&
          ReactDOM.createPortal(
            h(
              "div",
              {
                ref: panelRef,
                className: "dshuc_panel",
                role: "dialog",
                "aria-label": title,
                style: pos ?? MEASURE_STYLE,
              },
              h(
                "div",
                { className: "dshuc_title" },
                h("span", { className: "dshuc_titleLabel" }, icon, title),
                titleValue !== undefined ? h("span", { className: "dshuc_titleValue" }, titleValue) : null,
              ),
              h("div", { className: "dshuc_titleRule", "aria-hidden": true }),
              children,
            ),
            document.body,
          ),
      );
    }

    function SessionUsageCostPill({ useProjection, t }) {
      const usage = useProjection("tokenUsage");
      const selection = useProjection("modelSelection");
      const config = useConfig();
      if (usage === undefined) return null;
      const prompt = billedInput(usage);
      const output = num(usage.outputTokens);
      if (prompt === 0 && output === 0) return null;

      const route = selection?.pending ?? selection?.lastUsed ?? null;
      const priced = priceFor(route);
      const peak = isPeak(Date.now());
      const cny = priced === null ? null : costOf(usage, priced.rates, peak ? PEAK_FACTOR : 1);
      const total = prompt + output;
      const cacheHit = cacheHitPercent(usage);
      const money = moneyText(cny, config.currency, config.usdToCny);
      const titleMoney = moneyText(cny, config.currency, config.usdToCny, true);
      const moneyNode = money === null ? null : h("span", { className: "dshuc_money" }, money);
      const cacheHitText = cacheHit === null ? null : t("pill.cacheHit", { percent: cacheHit });

      const segments = [t("pill.tokens", { count: formatTokens(total) })];
      const label = h(
        React.Fragment,
        null,
        segments[0],
        moneyNode !== null
          ? h(React.Fragment, null, h("span", { className: "dshuc_sep", "aria-hidden": true }, "·"), moneyNode)
          : null,
        cacheHitText !== null
          ? h(
              React.Fragment,
              null,
              h("span", { className: "dshuc_sep", "aria-hidden": true }, "·"),
              cacheHitText,
            )
          : null,
      );
      const text = segments
        .concat(money === null ? [] : [money])
        .concat(cacheHitText === null ? [] : [cacheHitText])
        .join(" · ");

      const rows = [
        cacheHit !== null ? [t("dialog.cacheHit"), cacheHit + "%"] : null,
        [t("dialog.input"), exactCount(num(usage.uncachedInputTokens))],
        [t("dialog.cacheRead"), exactCount(num(usage.cacheReadTokens))],
        num(usage.cacheWriteTokens) !== 0
          ? [t("dialog.cacheWrite"), exactCount(num(usage.cacheWriteTokens))]
          : null,
        [t("dialog.output"), exactCount(output)],
        [t("dialog.window"), t(peak ? "dialog.windowPeak" : "dialog.windowOffPeak")],
      ].filter((row) => row !== null);

      return h(
        DialogPill,
        {
          stat: "usage",
          icon: h(primitives.IconDatabaseOutlineRegular, {}),
          label,
          text,
          title: t("dialog.title"),
          titleValue: exactCount(total) + (titleMoney === null ? "" : " · " + titleMoney),
        },
        h(
          "dl",
          { className: "dshuc_details", "data-session-stats-usage": true },
          rows.map(([key, value], index) =>
            h(
              React.Fragment,
              { key: index },
              h("dt", null, key),
              h("dd", null, value),
            ),
          ),
        ),
      );
    }

    /**
     * Hidden anchor in the turn tail: rewrites the built-in usage action label
     * from "用量 N tok" to "N tok · ≈¥x.xx" without adding a line of its own.
     */
    function TurnUsageChip({ turn, t, useChat, useProjection }) {
      const config = useConfig();
      const selection = typeof useProjection === "function" ? useProjection("modelSelection") : undefined;
      const turnNumber = typeof turn === "number" ? turn : turn !== null && typeof turn === "object" ? turn.turn : undefined;
      const useChatSafe = typeof useChat === "function" ? useChat : () => undefined;
      const usage = useChatSafe((snapshot) => {
        if (snapshot === null || typeof snapshot !== "object" || snapshot.nodes === undefined) return undefined;
        const nodes = snapshot.nodes;
        if (typeof nodes.values !== "function") return undefined;
        let found;
        for (const node of nodes.values()) {
          if (node === null || typeof node !== "object" || node.kind !== "turn-tail") continue;
          if (node.data?.turn !== turnNumber || node.data?.tokenUsage === undefined) continue;
          found = node.data.tokenUsage;
          if (typeof node.data.time === "number") TURN_TIMES.set(found, node.data.time);
        }
        let summed = null;
        if (Array.isArray(snapshot.legacy?.nodes)) {
          let uncached = 0;
          let cacheRead = 0;
          let cacheWrite = 0;
          let output = 0;
          let total = 0;
          for (const node of snapshot.legacy.nodes) {
            if (node === null || typeof node !== "object" || node.kind !== "assistant" || node.turn !== turnNumber) continue;
            const sample = node.usage;
            if (sample === null || sample === undefined) continue;
            const input = Number(sample.inputTokens) || 0;
            const read = Number(sample.cacheReadTokens) || 0;
            const write = Number(sample.cacheWriteTokens) || 0;
            const out = Number(sample.outputTokens) || 0;
            uncached += input;
            cacheRead += read;
            cacheWrite += write;
            output += out;
            total += Number(sample.totalTokens) || input + read + write + out;
          }
          if (total > 0) {
            summed = {
              uncachedInputTokens: uncached,
              cacheReadTokens: cacheRead,
              cacheWriteTokens: cacheWrite,
              outputTokens: output,
              totalTokens: total,
              estimated: true,
            };
          }
        }
        return found ?? summed;
      });
      const anchorRef = React.useRef(null);

      let text = null;
      if (usage !== undefined && usage !== null) {
        const total = typeof usage.totalTokens === "number" ? usage.totalTokens : totalTokens(usage);
        const route = usage.routes?.[0] ?? selection?.pending ?? selection?.lastUsed ?? null;
        const priced = priceFor(route);
        // The turn's own end time decides its window; the summed fallback has
        // no timestamp, so it is priced at whatever window it is read in.
        const factor = peakFactor(TURN_TIMES.get(usage) ?? Date.now());
        const cny = priced === null ? null : costOf(usage, priced.rates, factor);
        const money = moneyText(cny, config.currency, config.usdToCny);
        text = (usage.estimated ? "≈" : "") + formatTokens(total) + " tok" + (money === null ? "" : " · " + money);
      }

      React.useEffect(() => {
        const anchor = anchorRef.current;
        if (anchor === null || text === null) return;
        const root = anchor.closest("[data-turn-tail]");
        if (root === null) return;
        let original = null;
        let patched = null;
        const apply = () => {
          const button = root.querySelector('button[aria-haspopup="dialog"]');
          const label = button === null ? null : button.lastElementChild;
          if (label === null) return;
          const textNode = label.firstChild;
          if (original === null) original = textNode !== null && textNode.nodeType === 3 ? textNode.nodeValue : label.textContent;
          // Keep the text node's identity: replacing it would leave React's
          // fiber pointing at a detached node and break a later unmount.
          if (textNode !== null && textNode.nodeType === 3) {
            if (textNode.nodeValue !== text) textNode.nodeValue = text;
            patched = textNode;
          } else if (label.textContent !== text) {
            label.textContent = text;
            patched = label;
          } else {
            patched = label;
          }
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(root, { subtree: true, childList: true, characterData: true });
        return () => {
          observer.disconnect();
          if (patched === null || original === null) return;
          if (!patched.isConnected) return;
          if (patched.nodeType === 3 && patched.nodeValue === text) patched.nodeValue = original;
          else if (patched.nodeType !== 3 && patched.textContent === text) patched.textContent = original;
        };
      }, [text]);

      return h("span", { ref: anchorRef, hidden: true, "data-dshuc-anchor": true });
    }

    // -------------------------------------------------------------- config page
    function UsageCostConfigForm({ form, t }) {
      const state = form.state ?? {};
      const value = state.value ?? {};
      const revision = state.revision;
      const [draft, setDraft] = React.useState(() => ({
        currency: sanitizeCurrency(value.currency),
        rate: String(sanitizeRate(value.usdToCny)),
        showBalance: value.showBalance !== false,
      }));
      const [status, setStatus] = React.useState("idle");

      React.useEffect(() => {
        setDraft({
          currency: sanitizeCurrency(value.currency),
          rate: String(sanitizeRate(value.usdToCny)),
          showBalance: value.showBalance !== false,
        });
        setStatus("idle");
        // Reset the draft only when the Host revision moves.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [revision]);

      const readOnly = state.writable === false;
      const busy = status === "saving";
      const canToggleBalance = Object.hasOwn(value, "showBalance");

      const save = async () => {
        const rate = Number(draft.rate.trim());
        if (!Number.isFinite(rate) || rate < 1 || rate > 100) {
          setStatus("invalid");
          return;
        }
        const ops = [];
        if (draft.currency !== sanitizeCurrency(value.currency)) {
          ops.push({ op: "set", path: ["currency"], value: draft.currency });
        }
        if (rate !== sanitizeRate(value.usdToCny)) {
          ops.push({ op: "set", path: ["usdToCny"], value: rate });
        }
        if (canToggleBalance && draft.showBalance !== (value.showBalance !== false)) {
          ops.push({ op: "set", path: ["showBalance"], value: draft.showBalance });
        }
        if (ops.length === 0) {
          setStatus("saved");
          return;
        }
        setStatus("saving");
        try {
          const accepted = await form.mutate(ops, revision);
          setStatus(accepted ? "saved" : "failed");
        } catch {
          setStatus("failed");
        }
      };

      const reset = async () => {
        setStatus("saving");
        const ops = [
          { op: "unset", path: ["currency"] },
          { op: "unset", path: ["usdToCny"] },
        ];
        if (canToggleBalance) ops.push({ op: "unset", path: ["showBalance"] });
        try {
          const accepted = await form.mutate(ops, revision);
          setStatus(accepted ? "saved" : "failed");
        } catch {
          setStatus("failed");
        }
      };

      const message =
        status === "saved"
          ? t("config.saved")
          : status === "failed"
            ? t("config.failed")
            : status === "invalid"
              ? t("config.invalidRate")
              : readOnly
                ? t("config.readOnly")
                : "";

      return h(
        "div",
        { className: "dshuc_cfg" },
        h("div", { className: "dshuc_cfgTitle" }, t("config.title")),
        canToggleBalance
          ? h(
              "div",
              { className: "dshuc_field" },
              h(
                "label",
                { className: "dshuc_toggleRow" },
                h("span", { className: "dshuc_fieldLabel" }, t("config.showBalance")),
                h(primitives.Switch, {
                  checked: draft.showBalance,
                  label: t("config.showBalance"),
                  disabled: readOnly || busy,
                  onChange: (checked) => setDraft({ ...draft, showBalance: checked }),
                }),
              ),
              h("span", { className: "dshuc_hint" }, t("config.showBalanceHint")),
            )
          : null,
        h(
          "label",
          { className: "dshuc_field" },
          h("span", { className: "dshuc_fieldLabel" }, t("config.currency")),
          h(
            "select",
            {
              className: "dshuc_input",
              value: draft.currency,
              disabled: readOnly || busy,
              onChange: (event) => setDraft({ ...draft, currency: event.target.value }),
            },
            h("option", { value: "CNY" }, t("currency.cny")),
            h("option", { value: "USD" }, t("currency.usd")),
            h("option", { value: "BOTH" }, t("currency.both")),
          ),
        ),
        h(
          "label",
          { className: "dshuc_field" },
          h("span", { className: "dshuc_fieldLabel" }, t("config.rate")),
          h("input", {
            className: "dshuc_input",
            type: "number",
            min: 1,
            max: 100,
            step: 0.01,
            value: draft.rate,
            disabled: readOnly || busy,
            onChange: (event) => setDraft({ ...draft, rate: event.target.value }),
          }),
          h("span", { className: "dshuc_hint" }, t("config.rateHint")),
        ),
        h(
          "div",
          { className: "dshuc_field" },
          h("span", { className: "dshuc_fieldLabel" }, t("config.ratesTitle")),
          h(
            "table",
            { className: "dshuc_table" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, t("config.model")),
                h("th", null, t("dialog.input")),
                h("th", null, t("dialog.cacheRead")),
                h("th", null, t("dialog.cacheWrite")),
                h("th", null, t("dialog.output")),
              ),
            ),
            h(
              "tbody",
              null,
              Object.entries(MODEL_PRICES).map(([model, rates]) =>
                h(
                  "tr",
                  { key: model },
                  h("td", null, model),
                  h("td", null, "¥" + rates.input),
                  h("td", null, "¥" + rates.cacheRead),
                  h("td", null, "¥" + rates.cacheWrite),
                  h("td", null, "¥" + rates.output),
                ),
              ),
            ),
          ),
          h("span", { className: "dshuc_hint" }, t("config.ratesNote")),
        ),
        h(
          "div",
          { className: "dshuc_actions" },
          h(
            primitives.Button,
            { variant: "primary", size: "sm", disabled: readOnly || busy, onClick: () => void save() },
            busy ? t("config.saving") : t("config.save"),
          ),
          h(primitives.Button, { variant: "outline", size: "sm", disabled: readOnly || busy, onClick: () => void reset() }, t("config.reset")),
        ),
        message === "" ? null : h("div", { className: "dshuc_status", "data-tone": status === "failed" || status === "invalid" ? "error" : undefined }, message),
      );
    }

    function UsageCostConfigPage(props) {
      const { view, form, t } = props;
      if (view === "summary") return t("config.summary");
      if (form === undefined || form === null) {
        return h("p", { className: "dshuc_cfgNote" }, t("config.unavailable"));
      }
      return h(UsageCostConfigForm, { form, t });
    }

    // -------------------------------------------------------------------- apply
    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.locale.register(NS, {
            zh,
            en,
            ja: en,
            es: en,
            fr: en,
            de: en,
            ru: en,
            pt: en,
          }),
        "dsh-usage-spend: dictionaries",
      );
      injectStyles();
      attachConfig(ctx);
      attachBalance(ctx);
      ctx.slots.inject("conversation.composer.dock", () =>
        ctx.slots.register(
          {
            name: "conversation.composer.dock",
            id: "usage",
            order: 1,
            priority: -1,
            locale: NS,
          },
          SessionUsageCostPill,
        ),
      );
      ctx.slots.inject("conversation.chat.turnTail", () =>
        ctx.slots.register(
          {
            name: "conversation.chat.turnTail",
            id: "turn-usage-cost",
            order: 40,
            locale: NS,
          },
          TurnUsageChip,
        ),
      );
      ctx.slots.inject("plugins.row.config", () =>
        ctx.slots.register(
          {
            name: "plugins.row.config",
            key: CONFIG_KEY,
            locale: NS,
          },
          UsageCostConfigPage,
        ),
      );
    }

    exports.name = "dsh-usage-spend";
    exports.inject = ["slots", "locale"];
    exports.apply = apply;
    /** Test-only internals (loaded through the stub module factory). */
    exports.__test = {
      MODEL_PRICES,
      priceFor,
      costOf,
      isPeak,
      peakFactor,
      beijingParts,
      cacheHitPercent,
      formatTokens,
      amount,
      moneyText,
      billedInput,
      totalTokens,
      createConfigStore,
      sanitizeCurrency,
      sanitizeRate,
      formatMoney,
      compactMoney,
      walletListText,
      createBalanceStore,
    };
    return module.exports;
  },
});
