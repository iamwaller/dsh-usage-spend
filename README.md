# Usage and spend (dsh-usage-spend)

Shows the session's token usage and an **estimated spend** under the DSH composer, and appends the amount to the built-in per-turn usage action. Currency and exchange rate are configured on the **Plugins** page.

One package is both the bundle (it declares the `usage-cost` row) and the feature itself, so installing it gives you a card on the Plugins page.

## What you get

- **Composer usage pill**: `85.3M tok · ≈¥3.09 · cache hit 99.4%`, replacing the built-in `usage` row.
- **Click the card**: the header shows the exact token count and amount, followed by buckets for cache hits, uncached input, cache reads, cache writes and output.
- **Per-turn action**: the built-in `用量 85.3M tok` becomes `85.3M tok · ≈¥3.09`.
- **Plugins page settings**: currency (CNY / USD / both), exchange rate, and whether to show the sidebar balance, with a read-only price table below the form.
- **Sidebar balance**: `余额 ¥12.34` at the bottom of the sidebar, refreshed every 60 seconds or on click; the grant is in the tooltip; collapsed the sidebar shows a compact amount. Can be turned off.

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

The price table is a models.dev snapshot of DeepSeek pricing (USD / 1M tokens):

| Model | Input | Cache read | Cache write | Output |
|---|---:|---:|---:|---:|
| `deepseek-flash` / `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` | 0.15 | 0.003 | 0.15 | 0.60 |
| `deepseek-v4-pro` | 0.66 | 0.022 | 0.66 | 1.98 |
| `deepseek-chat` / `deepseek-reasoner` | 0.28 | 0.028 | 0.28 | 0.42 |

- Cost = uncached input × input price + cache reads × cache-read price + cache writes × cache-write price + output × output price.
- The CNY amount is converted with the configured rate, `7.2` by default.
- Peak/off-peak multipliers, discounts, granted credit and the platform's actual bill are **not** included. This is an estimate only.
- Per-turn amounts prefer the exact usage recorded in the session; when that is unavailable they sum the turn's assistant messages and show `≈`.

## Custom prices

Write `localStorage["dsh.cost.prices"]` from the browser console, keyed by model name (USD / 1M tokens):

```json
{
  "deepseek-flash": { "input": 0.15, "cacheRead": 0.003, "cacheWrite": 0.15, "output": 0.6 }
}
```

Keys may be the full model name, `provider/model`, or the bare model name. Reload to apply.

## Compatibility and limits

- Targets the client slot / projection API of DSH `0.2.2-rc.1`.
- The per-turn text is rewritten through a DOM observer; if a DSH release changes the built-in button's structure it degrades to the original `用量 N tok` and never affects the session.
- Switching models inside a session estimates the whole session at the current model's prices.
- The sidebar balance calls `account.getBalance` (DeepSeek account) and shows `--` when signed out or when the read fails. It is the platform's balance, not a local estimate.
- Currency and rate come from host settings; when the settings service is unavailable it falls back to `localStorage` (`dsh.cost.currency` / `dsh.cost.usdToCny`).

## License

MIT
