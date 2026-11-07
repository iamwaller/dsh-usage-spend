# Usage and spend (dsh-usage-spend)

Shows the session's token usage and an **estimated spend** under the DSH composer, priced at DeepSeek's **peak and off-peak rates**, and appends the amount to the built-in per-turn usage action. Currency and exchange rate are configured on the **Plugins** page.

## What you get

- **Composer usage pill**: `85.3M tok · ≈¥3.09 · cache hit 99.4%`, replacing the built-in `usage` row.
- **Click the card**: the header shows the exact token count and amount, followed by buckets for cache hits, uncached input, cache reads, cache writes, output and the billing window.
- **Per-turn action**: the built-in `用量 85.3M tok` becomes `85.3M tok · ≈¥3.09`, priced at that turn's end time.
- **Peak pricing**: Beijing time weekdays 09:00–12:00 and 14:00–18:00 cost double; everything else, weekends and public holidays included, is off-peak.
- **Plugins page settings**: currency (CNY / USD / both), exchange rate, and whether to show the sidebar balance, with a read-only price table below the form.
- **Sidebar balance**: `余额 ¥12.34` at the bottom of the sidebar, refreshed every 60 seconds or on click; the grant is in the tooltip; collapsed the sidebar shows a compact amount. A `峰` / `谷` badge after the amount names the billing window, and the tooltip spells it out. Can be turned off.

## Install

```sh
dsh plugin --profile <profile> add dsh-usage-spend
```

Or in DSH Desktop / Web open **Plugins → Add plugin**, enter `dsh-usage-spend`, then choose **Enable now**. Restart or reload afterwards.

Open **Plugins** and expand the **Usage and spend** card to confirm the `usage-cost` row is on.

## Settings

Click **Configure** on the row; changes apply immediately. They are written to the profile's `cordis.patch.yml`:

```yaml
- id: usage-cost
  name: 'dsh-usage-spend'
  config:
    currency: CNY      # CNY | USD | BOTH
    usdToCny: 7.2
    showBalance: true
```

Turning the row off removes the pill, the per-turn amount and the sidebar balance; turning it back on restores them.

## How the estimate works

Rates come from DeepSeek's official card (`api-docs.deepseek.com/zh-cn/quick_start/pricing`, checked 2026-11-07), in **CNY per 1M tokens**, and the table below is the **off-peak** rate:

| Model | Input (cache miss) | Input (cache hit) | Output |
|---|---:|---:|---:|
| `deepseek-flash` (DeepSeek-V4.1-Flash-1017) | 1 | 0.02 | 4 |
| `deepseek-v4-pro` (DeepSeek-V4-Pro-0813) | 4.5 | 0.15 | 13.5 |

`deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are retired names that still work: requests are served by V4.1-Flash and billed at the Flash price, so they share its rates. `deepseek-chat` and `deepseek-reasoner` were discontinued on 2026-07-24 and are no longer priced.

### Peak and off-peak

DeepSeek charges half the peak price off-peak, so **peak = twice the table**.

- Peak: Beijing time, **Monday to Friday**, `09:00–12:00` and `14:00–18:00`
- Everything else is off-peak: nights, the lunch gap, **weekends** and **whole public holidays**
- Holidays follow the State Council schedule; the plugin ships the 2026 dates and needs one update a year

How the numbers are produced:

- Cost = (uncached input × input + cache reads × cache-read + cache writes × cache-write + output × output) / 1e6 × window multiplier
- Cache writes bill at the cache-miss input price, matching DeepSeek
- **Per-turn amounts use that turn's end time**, so they are exact
- **The session total uses the window in effect now**: the whole-log token projection carries no time dimension, so a session cannot be replayed turn by turn. Reopening an old session prices the total at the window you open it in while the per-turn amounts stay put
- The `峰` / `谷` badge at the end of the sidebar balance line names the window in effect. It is hidden when the sidebar is collapsed or the balance chip is turned off; the card's billing-window row still shows it
- CNY is the base currency; USD is converted with the configured rate and only affects that column
- Discounts, granted credit, Search/Fetch fees and the platform's actual bill are **not** included. This is an estimate only.

## Custom prices

Write `localStorage["dsh.cost.prices"]` from the browser console, keyed by model name (**CNY per 1M tokens, off-peak**; peak doubles it):

```json
{
  "deepseek-flash": { "input": 1, "cacheRead": 0.02, "cacheWrite": 1, "output": 4 }
}
```

Keys may be the full model name, `provider/model`, or the bare model name. Reload to apply.

> 0.1.0 overrides were USD; 0.2.0 switched to CNY and added the peak multiplier, so old overrides need re-entering in the new unit.

## Compatibility and limits

- Targets the client slot / projection API of DSH `0.2.2-rc.1`.
- The per-turn text is rewritten through a DOM observer; if a DSH release changes the built-in button's structure it degrades to the original `用量 N tok` and never affects the session.
- Switching models inside a session estimates the whole session at the current model's prices.
- The sidebar balance calls `account.getBalance` (DeepSeek account) and shows `--` when signed out or when the read fails. It is the platform's balance, not a local estimate.
- Currency and rate come from host settings; when the settings service is unavailable it falls back to `localStorage` (`dsh.cost.currency` / `dsh.cost.usdToCny`).

## License

MIT
