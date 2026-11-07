/**
 * Host loader entry for dsh-usage-spend.
 *
 * Most of the feature is browser-only: the usage projection, the composer dock
 * and the turn-footer amount all live in the client runtime. This entry keeps
 * the row a normal Cordis plugin (so the settings service exposes its form) and
 * serves one route that replays a session's raw event log.
 *
 * The route deliberately knows nothing about pricing: it only groups billed
 * tokens into whole-hour buckets keyed by the event's own timestamp. The client
 * owns the peak/off-peak rules, so the holiday calendar stays in one file.
 *
 * `sessionQuery.filterEvents()` cannot be used here: it returns semantic
 * search documents (seq/type/time/surface/text) with no `data`. The raw log
 * from `readSession()` is the only place where `data.usage` exists.
 */
import z from "@deepseek-ai/schemastery";

/** Fields the Plugins page may edit without reloading the plugin. */
export const Config = z.object({
  currency: z.union(["CNY", "USD", "BOTH"]).default("CNY").volatile(),
  usdToCny: z.number().default(7.2).volatile(),
  showBalance: z.boolean().default(true).volatile(),
});

export const name = "dsh-usage-spend";
export const inject = ["connection"];

const WINDOW_ROUTE = "/api/dsh-usage-spend/window";
const HOUR_MS = 3_600_000;
const USAGE_FIELDS = ["uncachedInputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"];

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function fail(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

function count(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Billed buckets of one raw `assistant/message` event, in the field names the
 * client's `costOf()` already consumes. The host's `TokenUsage.inputTokens` is
 * the *uncached* input: cache reads and writes are disjoint counters, exactly
 * as the chat snapshot's `deriveTurnTokenUsage` maps them.
 */
function usageOf(event) {
  if (event === null || typeof event !== "object" || event.type !== "assistant/message") return null;
  const raw = event.data?.usage;
  if (raw === null || typeof raw !== "object") return null;
  const usage = {
    uncachedInputTokens: count(raw.inputTokens),
    cacheReadTokens: count(raw.cacheReadTokens),
    cacheWriteTokens: count(raw.cacheWriteTokens),
    outputTokens: count(raw.outputTokens),
  };
  const total = USAGE_FIELDS.reduce((sum, key) => sum + usage[key], 0);
  return total > 0 ? usage : null;
}

function addInto(target, source) {
  for (const key of USAGE_FIELDS) target[key] += source[key];
}

function emptyUsage() {
  return { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
}

/**
 * Group replayed raw events into whole-hour billed-token buckets.
 *
 * Every peak window starts and ends on a whole Beijing hour, and Beijing is a
 * whole-hour UTC offset, so classifying a bucket by its UTC hour start is
 * exact: no event can straddle a peak boundary inside one bucket.
 *
 * Exported as a pure function so the shape can be unit-tested without a Host.
 */
export function bucketEvents(events) {
  const buckets = new Map();
  let tokens = 0;
  let messages = 0;
  let from;
  let to;

  for (const event of Array.isArray(events) ? events : []) {
    const usage = usageOf(event);
    if (usage === null) continue;
    messages += 1;
    tokens += USAGE_FIELDS.reduce((sum, key) => sum + usage[key], 0);
    const at = Number(event?.time);
    if (!Number.isFinite(at)) continue; // keep diagnostics, but an undated event has no window
    const hour = Math.floor(at / HOUR_MS) * HOUR_MS;
    if (!buckets.has(hour)) buckets.set(hour, emptyUsage());
    addInto(buckets.get(hour), usage);
    if (from === undefined || at < from) from = at;
    if (to === undefined || at > to) to = at;
  }

  return {
    buckets: [...buckets.entries()].sort((left, right) => left[0] - right[0]),
    tokens,
    messages,
    from: from ?? null,
    to: to ?? null,
  };
}

/**
 * Read one session's hourly billed-token split.
 * @param context - host plugin context with `sessionQuery` mounted.
 * @param request - buffered request carrying `{ sessionId }`.
 * @returns a JSON `Response`.
 */
async function handleWindow(context, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail("dsh-usage-spend/bad-request", "body is not JSON");
  }

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (sessionId === "") return fail("dsh-usage-spend/bad-request", "missing sessionId");

  // Exact fetch routes already reject non-owner peers (403 in the connection
  // handler), so no extra resource probe is needed here.
  const sessionQuery =
    (typeof context.get === "function" ? context.get("sessionQuery") : undefined) ?? context.sessionQuery;
  if (sessionQuery === undefined || sessionQuery === null || typeof sessionQuery.readSession !== "function") {
    return fail("dsh-usage-spend/unavailable", "session query service is unavailable", 501);
  }

  try {
    const snapshot = await sessionQuery.readSession(sessionId);
    if (!Array.isArray(snapshot?.events)) {
      return fail("dsh-usage-spend/unavailable", "session log is unavailable", 501);
    }
    return json({ ok: true, value: bucketEvents(snapshot.events) });
  } catch (error) {
    return fail("dsh-usage-spend/internal", error instanceof Error ? error.message : String(error), 500);
  }
}

export function apply(ctx) {
  ctx.inject(["connection"], (scope) => {
    const connection = scope.connection ?? (typeof scope.get === "function" ? scope.get("connection") : undefined);
    const register = connection?.fetch?.register;
    if (typeof register !== "function") return;
    scope.effect(
      () =>
        register.call(connection.fetch, {
          path: WINDOW_ROUTE,
          methods: ["POST"],
          requestBody: "buffered",
          fetch: (request) => handleWindow(scope, request),
        }),
      "dsh-usage-spend: window route",
    );
  });
}
