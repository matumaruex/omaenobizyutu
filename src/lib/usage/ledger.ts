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
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('INCR', KEYS[3])
redis.call('SET', KEYS[4], ARGV[1], 'EX', 60)
return 'OK'`;
export const UPDATE_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 'MISSING' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 'OK'`;
export const REPORT_SCRIPT = `return {redis.call('GET', KEYS[1]) or '0', redis.call('HVALS', KEYS[2])}`;
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
  async reserve(id: string, text: string, model: string): Promise<UsageRecord> {
    const pricing = getPricing();
    const record: UsageRecord = {
      id,
      createdAt: new Date().toISOString(),
      model,
      status: "pending",
      usage: unknownUsage(),
      estimate: null,
      pricing,
    };
    // HMAC keeps the visitor's text out of storage, including guessable hashes.
    const fingerprint = createHmac("sha256", process.env.MIMO_API_KEY || "")
      .update(text.trim())
      .digest("hex");
    const result = await this.send([
      "EVAL",
      RESERVE_SCRIPT,
      4,
      `${this.ns}:records`,
      `${this.ns}:order`,
      `${this.ns}:calls`,
      `${this.ns}:dedupe:${fingerprint}`,
      id,
      JSON.stringify(record),
      callLimit(),
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
      1,
      `${this.ns}:records`,
      record.id,
      JSON.stringify(next),
    ]);
    if (result !== "OK") throw new UsageGateError("UNAVAILABLE");
    return next;
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
