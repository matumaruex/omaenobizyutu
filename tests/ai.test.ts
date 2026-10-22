import { UsageGateError } from "../src/lib/usage/ledger";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import seed from "../src/data/catalog-seed.json";
import { candidateWorks, candidateOutput } from "./fixtures/ai";
vi.mock("../src/lib/catalog/server", () => ({ getCatalog: async () => seed }));
const ledgerMock = vi.hoisted(() => ({ reserve: vi.fn(), update: vi.fn() }));
vi.mock("../src/lib/usage/ledger", async (original) => {
  const actual = await original<typeof import("../src/lib/usage/ledger")>();
  return {
    ...actual,
    UsageLedger: class {
      reserve = ledgerMock.reserve;
      update = ledgerMock.update;
    },
  };
});
import {
  getPricing,
  unknownUsage,
  estimateCost,
} from "../src/lib/usage/pricing";
import { selectWithAI } from "../src/lib/ai/select";
import { POST } from "../src/app/api/exhibition/route";
const input = "嬉しいけれど不安もある";
function chosen() {
  return {
    title: "気持ちの余白",
    atmosphere: "揺れる気持ちを入口に、作品それぞれの背景へ開く構成。",
    selections: candidateWorks.slice(0, 8).map((a) => ({
      id: a.id,
      role: "共鳴",
      reason: "作品の具体的な主題と、この言葉との接点から選びました。",
    })),
  };
}
function response(value: unknown = chosen()) {
  return Response.json({
    id: "test",
    object: "chat.completion",
    created: 1,
    model: "mimo-v2.6-flash",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(value) },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 4500,
      completion_tokens: 600,
      total_tokens: 5100,
      prompt_tokens_details: { cached_tokens: 1000 },
      completion_tokens_details: { reasoning_tokens: 120 },
    },
  });
}
function respondTo(init: RequestInit | undefined, value: unknown = chosen()) {
  const payload = JSON.parse(
    JSON.parse(String(init?.body)).messages.at(-1).content,
  );
  return response(payload.catalog ? candidateOutput() : value);
}
function request(text = input, extra = {}) {
  return new Request("http://localhost/api/exhibition", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ text, ...extra }),
  });
}
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("MIMO_API_KEY", "test-only-not-a-real-key");
  ledgerMock.reserve
    .mockReset()
    .mockImplementation(
      async (id: string, _text, _model, _search, pipeline) => ({
        pipeline,
        id,
        model: "mimo-v2.6-flash",
        createdAt: new Date().toISOString(),
        status: "pending",
        usage: unknownUsage(),
        estimate: null,
        pricing: getPricing(),
      }),
    );
  ledgerMock.update
    .mockReset()
    .mockImplementation(async (r, usage, status) => ({
      ...r,
      usage,
      status,
      estimate: estimateCost(usage, r.pricing),
    }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("real SDK request contract, with all upstream HTTP mocked", () => {
  it("makes two bounded MiMo calls, reading all works before selecting eight", async () => {
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const result = await selectWithAI(input);
    expect(timeouts.mock.calls.map(([ms]) => ms)).toEqual([60000, 35000]);
    expect(mock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = mock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(firstUrl)).toBe(
      "https://api.xiaomimimo.com/v1/chat/completions",
    );
    const firstBody = JSON.parse(String(firstInit.body));
    const firstPayload = JSON.parse(firstBody.messages.at(-1).content);
    expect(firstPayload.catalog).toHaveLength(300);
    expect(firstPayload.feeling).toBe(input);
    expect(
      firstPayload.catalog.some((a: { tags: string[] }) => a.tags.length === 0),
    ).toBe(true);
    expect(firstBody.thinking).toEqual({ type: "disabled" });
    expect(firstBody.max_completion_tokens).toBe(700);
    const [url, init] = mock.mock.calls[1] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("mimo-v2.6-flash");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_completion_tokens).toBe(2600);
    expect(body.max_tokens).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
    const payload = JSON.parse(body.messages.at(-1).content);
    expect(payload.candidates).toHaveLength(24);
    expect(
      payload.candidates.every(
        (a: Record<string, unknown>) => !("summary" in a),
      ),
    ).toBe(true);
    expect(
      payload.candidates.every((a: { id: string }) =>
        seed.artworks.some((v) => v.id === a.id),
      ),
    ).toBe(true);
    expect(result.verification.inputTokens).toBe(9000);
    expect(result.verification.usage.reasoningTokens).toBe(240);
    expect(result.verification.usage.cachedInputTokens).toBe(2000);
    expect(result.selections.every((a) => a.artwork?.id === a.id)).toBe(true);
    expect(result.selections).toHaveLength(8);
    expect(body.messages[0].content).toContain("必ず8点");
    for (const selected of result.selections) {
      expect(selected.artwork?.interpretation).toEqual(
        seed.selection.find((a) => a.id === selected.id)!.meaning,
      );
    }
    expect(JSON.stringify(result)).not.toContain("test-only-not-a-real-key");
  });
  for (const kind of [
    "outside",
    "duplicate",
    "schema",
    "too_few",
    "too_many",
  ] as const)
    it(`rejects ${kind} provider output`, async () => {
      const value = chosen();
      if (kind === "outside") value.selections[0].id = "met-9999999";
      if (kind === "duplicate") value.selections[0].id = value.selections[1].id;
      if (kind === "schema") value.atmosphere = "";
      if (kind === "too_few") value.selections.pop();
      if (kind === "too_many") {
        const extra = candidateWorks[8];
        value.selections.push({
          id: extra.id,
          role: "共鳴",
          reason: "追加の作品",
        });
      }
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, init) => respondTo(init, value)),
      );
      await expect(selectWithAI(input)).rejects.toThrow();
    });
  it("does not retry or expose provider errors, keys or the submitted feeling", async () => {
    const mock = vi.fn(async () =>
      Response.json(
        {
          error: {
            message: "secret provider detail " + input,
            type: "invalid_api_key",
          },
        },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", mock);
    const r = await POST(request());
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(text).toContain("認証");
    expect(text).not.toContain(input);
    expect(text).not.toContain("secret");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("records real response counters and prices even if output validation fails", async () => {
    const value = chosen();
    value.atmosphere = "";
    const mock = vi.fn(async (_url, init) => respondTo(init, value));
    vi.stubGlobal("fetch", mock);
    const r = await POST(request());
    expect(r.status).toBe(502);
    const body = await r.json();
    expect(body.accounting.record.status).toBe("failed");
    expect(body.accounting.record.usage).toEqual({
      inputTokens: 4500,
      outputTokens: 600,
      reasoningTokens: 120,
      cachedInputTokens: 1000,
    });
    expect(body.accounting.record.estimate.nanoJpy).toBe(99_120_000);
    expect(body.accounting.record.failure.kind).toBe("invalid_selection");
    expect(body.accounting.records).toHaveLength(2);
    expect(body.accounting.records[0].status).toBe("succeeded");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  for (const [code, status] of [
    ["DUPLICATE", 409],
    ["LIMIT", 429],
    ["UNAVAILABLE", 503],
  ] as const)
    it(`prevents a provider call when the durable gate returns ${code}`, async () => {
      ledgerMock.reserve.mockRejectedValueOnce(new UsageGateError(code));
      const mock = vi.fn();
      vi.stubGlobal("fetch", mock);
      const r = await POST(request());
      expect(r.status).toBe(status);
      expect((await r.json()).code).toBe(code);
      expect(mock).not.toHaveBeenCalled();
    });
  it("keeps a usable exhibition and a visible warning if post-call persistence fails", async () => {
    ledgerMock.update.mockImplementation(async (r, usage, status) => {
      if (r.pipeline.stage === "selection")
        throw Error("storage secret detail");
      return { ...r, usage, status, estimate: estimateCost(usage, r.pricing) };
    });
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const r = await POST(request());
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.verification.accounting.persisted).toBe(false);
    expect(body.verification.accounting.record.usage.inputTokens).toBe(4500);
    expect(JSON.stringify(body)).not.toContain("storage secret detail");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("tracks an interrupted request as unknown usage rather than a zero bill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Error("network failure");
      }),
    );
    const r = await POST(request());
    const body = await r.json();
    expect(body.accounting.record.estimate).toBeNull();
    expect(body.accounting.record.usage.inputTokens).toBeNull();
    expect(body.accounting.record.status).toBe("failed");
    expect(body.accounting.record.failure.kind).toBe("network");
    expect(body.accounting.record.failure.httpStatus).toBeUndefined();
    expect(body.accounting.record.failure.elapsedMs).toBeGreaterThanOrEqual(0);
  });
  for (const [status, kind] of [
    [400, "provider_request"],
    [429, "provider_limit"],
    [503, "provider_error"],
  ] as const)
    it(`records safe upstream status ${status} without keeping its secret body`, async () => {
      const secret = "secret-provider-body-with-api-key";
      const mock = vi.fn(async () =>
        Response.json({ error: { message: secret } }, { status }),
      );
      vi.stubGlobal("fetch", mock);
      const r = await POST(request());
      const body = await r.json();
      expect(body.accounting.record.failure).toMatchObject({
        kind,
        httpStatus: status,
      });
      expect(body.accounting.record.estimate).toBeNull();
      expect(mock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(body)).not.toContain(secret);
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
        secret,
      );
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
        input,
      );
      expect(ledgerMock.update.mock.calls.at(-1)?.[0].failure).toMatchObject({
        kind,
        httpStatus: status,
      });
    });
  it("distinguishes an unreadable successful HTTP response from output validation", async () => {
    const mock = vi.fn(
      async () => new Response("private invalid response", { status: 200 }),
    );
    vi.stubGlobal("fetch", mock);
    const body = await (await POST(request())).json();
    expect(body.accounting.record.failure).toMatchObject({
      kind: "invalid_response",
      httpStatus: 200,
    });
    expect(JSON.stringify(body)).not.toContain("private invalid response");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  for (const cancelled of [false, true])
    it(`distinguishes ${cancelled ? "client cancellation" : "provider timeout"} without retrying`, async () => {
      const timeout = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(timeout.signal);
      const client = new AbortController();
      const mock = vi.fn(async (_url, init) => {
        (cancelled ? client : timeout).abort(
          new DOMException("private abort detail", "AbortError"),
        );
        throw init.signal.reason;
      });
      vi.stubGlobal("fetch", mock);
      const req = new Request(request(), { signal: client.signal });
      const body = await (await POST(req)).json();
      expect(body.accounting.record.failure.kind).toBe(
        cancelled ? "cancelled" : "timeout",
      );
      expect(body.accounting.record.estimate).toBeNull();
      expect(JSON.stringify(body)).not.toContain("private abort detail");
      expect(mock).toHaveBeenCalledTimes(1);
    });
  for (const kind of ["outside", "duplicate", "too_few", "artist"] as const)
    it(`stops after invalid retrieval (${kind}) without spending on stage two`, async () => {
      const value = candidateOutput();
      if (kind === "outside") value.candidates[0] = "met-9999999";
      if (kind === "duplicate") value.candidates[0] = value.candidates[1];
      if (kind === "too_few") value.candidates.pop();
      if (kind === "artist") {
        const byArtist = Map.groupBy(seed.selection, (a) => a.artistKey);
        const three = [...byArtist.values()].find(
          (works) => works.length >= 3,
        )!;
        value.candidates = [
          ...three.slice(0, 3),
          ...candidateWorks
            .filter((a) => a.artistKey !== three[0].artistKey)
            .slice(0, 21),
        ].map((a) => a.id);
      }
      const mock = vi.fn(async () => response(value));
      vi.stubGlobal("fetch", mock);
      const res = await POST(request());
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.accounting.records).toHaveLength(1);
      expect(body.accounting.record.pipeline.stage).toBe("retrieval");
      expect(body.accounting.record.failure.kind).toBe("invalid_selection");
      expect(mock).toHaveBeenCalledTimes(1);
    });
  it("keeps the completed retrieval if the second quota reservation is blocked", async () => {
    const reserve = ledgerMock.reserve.getMockImplementation()!;
    ledgerMock.reserve.mockImplementation(async (...args) => {
      if (args[4].stage === "selection") throw new UsageGateError("LIMIT");
      return reserve(...args);
    });
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const res = await POST(request());
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.accounting.record.status).toBe("succeeded");
    expect(body.accounting.record.pipeline.stage).toBe("retrieval");
    expect(body.accounting.records).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("stops before the second paid request when retrieval persistence fails", async () => {
    ledgerMock.update.mockRejectedValue(Error("private failure"));
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const res = await POST(request());
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.accounting.persisted).toBe(false);
    expect(body.accounting.records).toHaveLength(1);
    expect(body.accounting.record.usage.inputTokens).toBe(4500);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("retains separate known and unknown costs if stage two loses its connection", async () => {
    const mock = vi.fn(async (_url, init) => {
      const payload = JSON.parse(
        JSON.parse(String(init?.body)).messages.at(-1).content,
      );
      if (!payload.catalog) throw Error("private network detail");
      return response(candidateOutput());
    });
    vi.stubGlobal("fetch", mock);
    const body = await (await POST(request())).json();
    expect(body.accounting.records).toHaveLength(2);
    expect(body.accounting.records[0].status).toBe("succeeded");
    expect(body.accounting.records[0].estimate.nanoJpy).toBe(99_120_000);
    expect(body.accounting.records[1].estimate).toBeNull();
    expect(body.accounting.records[1].failure.kind).toBe("network");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(body)).not.toContain("private network detail");
  });
  it("requires a valid idempotency key before any paid operation", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const req = request();
    req.headers.delete("idempotency-key");
    expect((await POST(req)).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
  it("rejects empty, oversized, cross-origin and old demo requests before contacting MiMo", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    expect((await POST(request(" "))).status).toBe(400);
    expect((await POST(request("あ".repeat(801)))).status).toBe(400);
    expect((await POST(request(input, { mode: "demo" }))).status).toBe(400);
    const bad = new Request("http://localhost/api/exhibition", {
      method: "POST",
      headers: { host: "localhost", origin: "https://other.example" },
      body: JSON.stringify({ text: input }),
    });
    expect((await POST(bad)).status).toBe(403);
    expect(mock).not.toHaveBeenCalled();
  });
  it("reports unconfigured API without a local selection fallback", async () => {
    vi.stubEnv("MIMO_API_KEY", "");
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const r = await POST(request());
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("デモ");
    expect(mock).not.toHaveBeenCalled();
  });
});
