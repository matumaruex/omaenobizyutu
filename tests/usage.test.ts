import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateCost,
  getPricing,
  readUsage,
  unknownUsage,
  callLimit,
} from "../src/lib/usage/pricing";
import { usageConfigured, UsageLedger } from "../src/lib/usage/ledger";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("actual usage and historical price estimates", () => {
  it("charges cached input once and never adds reasoning on top of output", () => {
    const usage = readUsage({
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
      prompt_tokens_details: { cached_tokens: 500_000 },
      completion_tokens_details: { reasoning_tokens: 800_000 },
    });
    expect(usage.reasoningTokens).toBe(800_000);
    expect(estimateCost(usage, getPricing())?.nanoJpy).toBe(52_710_000_000);
  });
  it("does not replace unreported usage with zero", () => {
    expect(unknownUsage()).toEqual({
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      cachedInputTokens: null,
    });
    expect(estimateCost(unknownUsage(), getPricing())).toBeNull();
    const u = readUsage({ prompt_tokens: 1000, completion_tokens: 100 });
    expect(u.reasoningTokens).toBeNull();
    expect(estimateCost(u, getPricing())).toEqual({
      nanoJpy: 25_200_000,
      cacheAssumedMiss: true,
    });
  });
  it("preserves reported zero and rejects impossible counters", () => {
    expect(
      readUsage({
        prompt_tokens: 0,
        completion_tokens: 0,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 0 },
      }).reasoningTokens,
    ).toBe(0);
    expect(
      readUsage({ prompt_tokens: -1, completion_tokens: "100" }).inputTokens,
    ).toBeNull();
    expect(
      readUsage({
        prompt_tokens: 10,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 11 },
        completion_tokens_details: { reasoning_tokens: 30 },
      }).cachedInputTokens,
    ).toBeNull();
  });
  it("allows explicit price and FX changes but refuses invalid settings", () => {
    const old = getPricing();
    vi.stubEnv(
      "MIMO_PRICING_JSON",
      JSON.stringify({ ...old, version: "changed", usdJpy: 100 }),
    );
    expect(getPricing().usdJpy).toBe(100);
    expect(old.usdJpy).toBe(150);
    vi.stubEnv(
      "MIMO_PRICING_JSON",
      JSON.stringify({ ...old, inputUsdPerMillion: -1 }),
    );
    expect(getPricing).toThrow();
  });
  it("has a bounded server-side call limit", () => {
    expect(callLimit()).toBe(50);
    vi.stubEnv("MIMO_TEST_CALL_LIMIT", "3");
    expect(callLimit()).toBe(3);
    vi.stubEnv("MIMO_TEST_CALL_LIMIT", "0");
    expect(callLimit).toThrow();
    vi.stubEnv("MIMO_TEST_CALL_LIMIT", "1.5");
    expect(callLimit).toThrow();
  });
  it("fails closed without storage and never sends secrets to a redirected endpoint", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(usageConfigured()).toBe(false);
    await expect(
      new UsageLedger().reserve("id", "sensitive feeling", "mimo-v2.6-flash"),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends Redis commands in an authenticated body, disables retries and hides errors", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "storage-test-secret");
    vi.stubEnv("MIMO_API_KEY", "mimo-test-secret");
    const fetch = vi.fn(async () =>
      Response.json({ error: "storage-test-secret" }, { status: 500 }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      new UsageLedger().reserve("id", "sensitive feeling", "mimo-v2.6-flash"),
    ).rejects.toMatchObject({ message: "UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("error");
    expect(init.body).not.toContain("sensitive feeling");
    expect(init.body).not.toContain("mimo-test-secret");
  });
});
