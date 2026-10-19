import { z } from "zod";
import defaults from "@/config/mimo-pricing.json";
import type { CostEstimate, Pricing, TokenUsage } from "./types";
const rate = z.number().finite().nonnegative().max(10000);
const schema = z
  .object({
    version: z.string().min(1).max(120),
    inputUsdPerMillion: rate,
    cachedInputUsdPerMillion: rate,
    outputUsdPerMillion: rate,
    usdJpy: z.number().finite().positive().max(10000),
    source: z.literal("https://mimo.mi.com/docs/en-US/pricing"),
    checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export function getPricing(): Pricing {
  // Overrides are server-only; malformed settings stop calls rather than bill
  // against an accidental/default zero price. Existing records keep their snapshot.
  return schema.parse(
    process.env.MIMO_PRICING_JSON
      ? JSON.parse(process.env.MIMO_PRICING_JSON)
      : defaults,
  );
}
export function callLimit() {
  const value = process.env.MIMO_TEST_CALL_LIMIT ?? "50";
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 1000)
    throw Error("INVALID_CALL_LIMIT");
  return Number(value);
}
const count = (n: unknown): number | null =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
export function readUsage(value: unknown): TokenUsage {
  const raw = value as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
    completion_tokens_details?: { reasoning_tokens?: unknown };
  } | null;
  const inputTokens = count(raw?.prompt_tokens);
  const outputTokens = count(raw?.completion_tokens);
  const cached = count(raw?.prompt_tokens_details?.cached_tokens);
  const reasoning = count(raw?.completion_tokens_details?.reasoning_tokens);
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens:
      cached !== null && inputTokens !== null && cached <= inputTokens
        ? cached
        : null,
    reasoningTokens:
      reasoning !== null && outputTokens !== null && reasoning <= outputTokens
        ? reasoning
        : null,
  };
}
export const unknownUsage = (): TokenUsage => readUsage(null);
export function estimateCost(
  usage: TokenUsage,
  pricing: Pricing,
): CostEstimate | null {
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  const cached = usage.cachedInputTokens ?? 0;
  // Reasoning is part of completion_tokens; cache reads are part of prompt_tokens.
  // Neither is added a second time. Missing cache counts use the full-input rate.
  const usd =
    ((usage.inputTokens - cached) * pricing.inputUsdPerMillion +
      cached * pricing.cachedInputUsdPerMillion +
      usage.outputTokens * pricing.outputUsdPerMillion) /
    1_000_000;
  const nanoJpy = Math.round(usd * pricing.usdJpy * 1_000_000_000);
  if (!Number.isSafeInteger(nanoJpy)) return null;
  return { nanoJpy, cacheAssumedMiss: usage.cachedInputTokens === null };
}
