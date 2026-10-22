import type {
  SearchTrace,
  SavedSelection,
  SelectionHistory,
  HistoryReport,
} from "../history/types";
import { createHmac } from "node:crypto";
import { callLimit, getPricing, estimateCost, unknownUsage } from "./pricing";
import type { UsageRecord, UsageReport, TokenUsage } from "./types";
export class UsageGateError extends Error {
  constructor(public code: "DUPLICATE" | "LIMIT" | "UNAVAILABLE") {
    super(code);
  }
}
// All keys share one Redis hash slot. Reserve + dedupe + quota increment is one
// atomic script across Vercel instances. No TTL on accounting or request IDs.
export const RESERVE_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 or redis.call('EXISTS', KEYS[4]) == 1 then return 'DUPLICATE' end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= tonumber(ARGV[3]) then return 'LIMIT' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[5], ARGV[1], ARGV[4])
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('INCR', KEYS[3])
redis.call('SET', KEYS[4], ARGV[1], 'EX', 60)
return 'OK'`;
// A continuation consumes its own quota slot, only after a durably completed
// retrieval. It cannot be replayed or reused as a second exhibition.
export const CONTINUE_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 or redis.call('HEXISTS', KEYS[6], ARGV[5]) == 1 then return 'DUPLICATE' end
local raw = redis.call('HGET', KEYS[1], ARGV[5])
if not raw then return 'UNAVAILABLE' end
local previous = cjson.decode(raw)
if previous.status ~= 'succeeded' or not previous.pipeline or previous.pipeline.stage ~= 'retrieval' or previous.pipeline.exhibitionId ~= ARGV[5] then return 'UNAVAILABLE' end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= tonumber(ARGV[3]) then return 'LIMIT' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[5], ARGV[1], ARGV[4])
redis.call('HSET', KEYS[6], ARGV[5], ARGV[1])
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('INCR', KEYS[3])
return 'OK'`;
export const UPDATE_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 'MISSING' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
if ARGV[3] ~= '' then redis.call('HSET', KEYS[2], ARGV[1], ARGV[3]) end
if ARGV[4] ~= '' then redis.call('HSET', KEYS[3], ARGV[1], ARGV[4]) end
return 'OK'`;
export const REPORT_SCRIPT = `return {redis.call('GET', KEYS[1]) or '0', redis.call('HVALS', KEYS[2])}`;
export const HISTORY_SCRIPT = `
local ids = redis.call('LRANGE', KEYS[2], tonumber(ARGV[1]), tonumber(ARGV[1]) + tonumber(ARGV[2]) - 1)
local rows = {}
for _, id in ipairs(ids) do
  table.insert(rows, {redis.call('HGET', KEYS[1], id) or '', redis.call('HGET', KEYS[3], id) or '',
    redis.call('HGET', KEYS[4], id) or '', redis.call('HGET', KEYS[5], id) or ''})
end
return {redis.call('GET', KEYS[6]) or '0', rows}`;
export const DISPLAY_SCRIPT = `
local stored = redis.call('HGET', KEYS[1], ARGV[1])
if not stored then return 'MISSING' end
local selection = cjson.decode(stored)
local display = cjson.decode(ARGV[2])
local allowed = {}
for _, work in ipairs(selection.works) do allowed[work.id] = true end
for _, id in ipairs(display.displayedIds) do if not allowed[id] then return 'INVALID' end end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
return 'OK'`;
type Command = (args: (string | number)[]) => Promise<unknown>;
function connection() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new UsageGateError("UNAVAILABLE");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new UsageGateError("UNAVAILABLE");
  return { url: parsed.origin, token };
}
export function usageConfigured() {
  try {
    connection();
    getPricing();
    callLimit();
    namespace();
    return true;
  } catch {
    return false;
  }
}
async function command(args: (string | number)[]) {
  try {
    const { url, token } = connection();
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw Error();
    const body = await response.json();
    if (body.error) throw Error();
    return body.result as unknown;
  } catch {
    throw new UsageGateError("UNAVAILABLE");
  }
}
function namespace() {
  const ns =
    process.env.MIMO_USAGE_NAMESPACE ||
    `museum-${process.env.VERCEL_ENV || "development"}-v1`;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(ns))
    throw new UsageGateError("UNAVAILABLE");
  return `{${ns}}`;
}
export class UsageLedger {
  constructor(
    private send: Command = command,
    private ns = namespace(),
  ) {}
  async reserve(
    id: string,
    text: string,
    model: string,
    search?: SearchTrace,
    pipeline?: UsageRecord["pipeline"],
  ): Promise<UsageRecord> {
    const pricing = getPricing();
    const record: UsageRecord = {
      id,
      createdAt: new Date().toISOString(),
      model,
      status: "pending",
      usage: unknownUsage(),
      estimate: null,
      pricing,
      ...(pipeline ? { pipeline } : {}),
    };
    // The dedupe key is HMAC; authorized trial history stores input separately.
    const fingerprint = createHmac("sha256", process.env.MIMO_API_KEY || "")
      .update(text.trim())
      .digest("hex");
    const continuation = pipeline?.stage === "selection";
    const result = await this.send([
      "EVAL",
      continuation ? CONTINUE_SCRIPT : RESERVE_SCRIPT,
      continuation ? 6 : 5,
      `${this.ns}:records`,
      `${this.ns}:order`,
      `${this.ns}:calls`,
      `${this.ns}:dedupe:${fingerprint}`,
      `${this.ns}:history`,
      ...(continuation ? [`${this.ns}:continuations`] : []),
      id,
      JSON.stringify(record),
      callLimit(),
      JSON.stringify({
        input: text,
        ...(search ? { search } : {}),
      } satisfies SelectionHistory),
      ...(continuation ? [pipeline.exhibitionId] : []),
    ]);
    if (result === "DUPLICATE" || result === "LIMIT")
      throw new UsageGateError(result);
    if (result !== "OK") throw new UsageGateError("UNAVAILABLE");
    return record;
  }
  async update(
    record: UsageRecord,
    usage: TokenUsage,
    status: UsageRecord["status"],
    selection?: SavedSelection,
    history?: SelectionHistory,
  ) {
    const next: UsageRecord = {
      ...record,
      usage,
      status,
      estimate: estimateCost(usage, record.pricing),
    };
    const result = await this.send([
      "EVAL",
      UPDATE_SCRIPT,
      3,
      `${this.ns}:records`,
      `${this.ns}:selections`,
      `${this.ns}:history`,
      record.id,
      JSON.stringify(next),
      selection ? JSON.stringify(selection) : "",
      history ? JSON.stringify(history) : "",
    ]);
    if (result !== "OK") throw new UsageGateError("UNAVAILABLE");
    return next;
  }
  async history(offset = 0, limit = 20): Promise<HistoryReport> {
    const result = (await this.send([
      "EVAL",
      HISTORY_SCRIPT,
      6,
      `${this.ns}:records`,
      `${this.ns}:order`,
      `${this.ns}:history`,
      `${this.ns}:selections`,
      `${this.ns}:displays`,
      `${this.ns}:calls`,
      offset,
      limit,
    ])) as [string, [string, string, string, string][]];
    return {
      calls: Number(result[0]),
      offset,
      limit,
      entries: result[1]
        .filter((row) => row[0])
        .map(([accounting, history, selection, display]) => ({
          accounting: JSON.parse(accounting) as UsageRecord,
          history: history
            ? {
                ...(JSON.parse(history) as SelectionHistory),
                ...(selection ? { selection: JSON.parse(selection) } : {}),
                ...(display ? { display: JSON.parse(display) } : {}),
              }
            : null,
        })),
    };
  }
  async reportDisplay(id: string, displayedIds: string[]) {
    return this.send([
      "EVAL",
      DISPLAY_SCRIPT,
      2,
      `${this.ns}:selections`,
      `${this.ns}:displays`,
      id,
      JSON.stringify({ displayedIds, reportedAt: new Date().toISOString() }),
    ]);
  }
  async report(): Promise<UsageReport> {
    const result = (await this.send([
      "EVAL",
      REPORT_SCRIPT,
      2,
      `${this.ns}:calls`,
      `${this.ns}:records`,
    ])) as [string, string[]];
    const records = result[1].map((r) => JSON.parse(r) as UsageRecord);
    return {
      calls: Number(result[0]),
      limit: callLimit(),
      totalNanoJpy: records.reduce((n, r) => n + (r.estimate?.nanoJpy ?? 0), 0),
      unpricedCalls: records.filter((r) => !r.estimate).length,
      pendingCalls: records.filter((r) => r.status === "pending").length,
      records: records
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100),
      pricing: getPricing(),
    };
  }
}
