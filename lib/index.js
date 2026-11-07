/**
 * Host loader entry for dsh-usage-cost.
 *
 * The feature is browser-only: the usage projection, the composer dock and the
 * turn-footer amount all live in the client runtime, and pricing is a local
 * table. This entry exists so the row is a normal Cordis plugin and so the
 * settings service can expose a live (volatile) configuration form for it.
 */
import z from "@deepseek-ai/schemastery";

/** Fields the Plugins page may edit without reloading the plugin. */
export const Config = z.object({
  currency: z.union(["CNY", "USD", "BOTH"]).default("CNY").volatile(),
  usdToCny: z.number().default(7.2).volatile(),
  showBalance: z.boolean().default(true).volatile(),
});

export const name = "dsh-usage-cost";

export function apply() {}
