import { UsageGateError } from "../src/lib/usage/ledger";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import seed from "../src/data/catalog-seed.json";
import { candidateWorks, tagOutput } from "./fixtures/ai";
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
    selections: candidateWorks.slice(0, 8).map((_a, index) => ({
      candidate: index + 1,
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
  return response(payload.availableTags ? tagOutput() : value);
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
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("evaluates rotated candidates in exactly two calls without numeric fitting strength", async () => {
  const payloads: {
    candidates?: { fitting: Record<string, unknown>[]; cautions: string[] }[];
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      payloads.push(
        JSON.parse(JSON.parse(String(init?.body)).messages.at(-1).content),
      );
      return respondTo(init);
    }),
  );
  const output = await selectWithAI(input, undefined, undefined, {
    seed: "exhibition-1",
    recentExhibitions: [],
  });
  expect(payloads).toHaveLength(2);
  expect(payloads[1].candidates).toHaveLength(24);
  expect(
    payloads[1]
      .candidates!.flatMap((a) => a.fitting)
      .every((f) => !("strength" in f) && "situation" in f && "reason" in f),
  ).toBe(true);
  expect(payloads[1].candidates!.every((a) => Array.isArray(a.cautions))).toBe(
    true,
  );
  expect(output.selections).toHaveLength(8);
  expect(output.verification.search?.sampling?.seed).toBe("exhibition-1");
});
describe("waiting for the complete selection response body", () => {
  // Exercise elapsed seconds instantly. Native fetch normally errors the body
  // stream on abort; the mocked stream reproduces that boundary explicitly.
  for (const outcome of ["slow_success", "timeout", "cancelled"] as const)
    it(`handles ${outcome} after headers without a third provider call`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException("Timed out", "TimeoutError")),
          ms,
        );
        return controller.signal;
      });
      const client = new AbortController();
      const mock = vi.fn(async (_url, init) => {
        const payload = JSON.parse(
          JSON.parse(String(init.body)).messages.at(-1).content,
        );
        if (payload.availableTags) return response(tagOutput());
        const json = await response().text();
        const signal = init.signal as AbortSignal;
        return new Response(
          new ReadableStream({
            start(controller) {
              const abort = () => {
                clearTimeout(timer);
                controller.error(signal.reason);
              };
              const timer = setTimeout(
                () => {
                  signal.removeEventListener("abort", abort);
                  controller.enqueue(new TextEncoder().encode(json));
                  controller.close();
                },
                outcome === "slow_success" ? 40000 : 90000,
              );
              signal.addEventListener("abort", abort, { once: true });
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      });
      vi.stubGlobal("fetch", mock);
      const pending = POST(new Request(request(), { signal: client.signal }));
      await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(outcome === "timeout" ? 60001 : 40001);
      if (outcome === "cancelled") client.abort();
      const result = await pending;
      const body = await result.json();
      const records = (body.verification?.accounting ?? body.accounting)
        .records;
      expect(records).toHaveLength(2);
      expect(records[0].status).toBe("succeeded");
      if (outcome === "slow_success") {
        expect(result.status).toBe(200);
        expect(records[1].status).toBe("succeeded");
        expect(records[1].elapsedMs).toBeGreaterThanOrEqual(40000);
        expect(records[1].elapsedMs).toBeLessThan(60000);
      } else {
        expect(result.status).toBe(502);
        expect(records[1].failure).toMatchObject({
          kind: outcome,
          httpStatus: 200,
        });
        if (outcome === "timeout")
          expect(records[1].failure.elapsedMs).toBeGreaterThanOrEqual(60000);
        expect(records[1].status).toBe("failed");
        expect(records[1].estimate).toBeNull();
      }
      expect(mock).toHaveBeenCalledTimes(2);
      const finalWrite = ledgerMock.update.mock.calls.at(-1);
      expect(finalWrite?.[2]).toBe(
        outcome === "slow_success" ? "succeeded" : "failed",
      );
    });
});
describe("real SDK request contract, with all upstream HTTP mocked", () => {
  it("uses the request ID as seed and only valid recent catalog IDs, without reading shared history", async () => {
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const req = request(input, {
      recentExhibitions: [
        [seed.selection[0].id, seed.selection[0].id, "met-9999999999999999"],
      ],
    });
    const response = await POST(req);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.verification.search.method).toBe("ai-tags-v2");
    expect(data.verification.search.sampling).toEqual({
      version: "weighted-exposure-v1",
      seed: req.headers.get("Idempotency-Key"),
      recentExhibitions: [[seed.selection[0].id]],
    });
    expect(mock).toHaveBeenCalledTimes(2);
    expect(
      mock.mock.calls.every(([url]) =>
        String(url).startsWith("https://api.xiaomimimo.com/"),
      ),
    ).toBe(true);
    const body = JSON.stringify(
      mock.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    );
    expect(body).not.toContain("recentExhibitions");
    expect(body).not.toContain('"strength"');
  });
  it.each([
    Array(6).fill(["met-1"]),
    [Array(9).fill("met-1")],
    [["文章を作品IDとして送る"]],
    "invalid",
  ])(
    "rejects invalid recent history before any paid call: %j",
    async (recentExhibitions) => {
      const mock = vi.fn();
      vi.stubGlobal("fetch", mock);
      expect((await POST(request(input, { recentExhibitions }))).status).toBe(
        400,
      );
      expect(mock).not.toHaveBeenCalled();
      expect(ledgerMock.reserve).not.toHaveBeenCalled();
    },
  );
  it("makes two bounded MiMo calls, classifying tags before selecting eight", async () => {
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const result = await selectWithAI(input);
    expect(timeouts.mock.calls.map(([ms]) => ms)).toEqual([30000, 60000]);
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
    expect(firstPayload.availableTags).toHaveLength(15);
    expect(firstPayload.catalog).toBeUndefined();
    expect(firstPayload.candidates).toBeUndefined();
    expect(firstPayload.feeling).toBe(input);
    expect(firstBody.thinking).toEqual({ type: "disabled" });
    expect(firstBody.max_completion_tokens).toBe(350);
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
      payload.candidates.map((a: { candidate: number }) => a.candidate),
    ).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
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
    expect(result.selections.map((s) => s.id)).toEqual(
      payload.candidates.slice(0, 8).map((a: { id: string }) => a.id),
    );
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
    "zero",
    "fractional",
    "duplicate",
    "schema",
    "too_few",
    "too_many",
  ] as const)
    it(`rejects ${kind} provider output`, async () => {
      const value = chosen();
      if (kind === "outside") value.selections[0].candidate = 25;
      if (kind === "zero") value.selections[0].candidate = 0;
      if (kind === "fractional") value.selections[0].candidate = 1.5;
      if (kind === "duplicate")
        value.selections[0].candidate = value.selections[1].candidate;
      if (kind === "schema") value.atmosphere = "";
      if (kind === "too_few") value.selections.pop();
      if (kind === "too_many") {
        value.selections.push({
          candidate: 9,
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
  it("maps nonsequential candidate numbers to the exact DB IDs and preserves order", async () => {
    const value = chosen();
    const indices = [24, 2, 10, 4, 6, 5, 3, 1];
    value.selections.forEach((s, i) => {
      s.candidate = indices[i];
    });
    let sentCandidates: { id: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const payload = JSON.parse(
          JSON.parse(String(init?.body)).messages.at(-1).content,
        );
        if (payload.candidates) sentCandidates = payload.candidates;
        return respondTo(init, value);
      }),
    );
    const result = await selectWithAI(input);
    expect(result.selections.map((s) => s.id)).toEqual(
      indices.map((index) => sentCandidates[index - 1].id),
    );
    expect(result.selections.every((s) => !("candidate" in s))).toBe(true);
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
  for (const kind of ["unknown", "duplicate", "contradiction"] as const)
    it(`stops after invalid tag classification (${kind}) without a second call`, async () => {
      const value = tagOutput();
      if (kind === "unknown") value.tags = ["未登録の気持ち"];
      if (kind === "duplicate") value.tags = ["不安", "不安"];
      if (kind === "contradiction") value.negatedTags = ["不安"];
      const mock = vi.fn(async () => response(value));
      vi.stubGlobal("fetch", mock);
      const res = await POST(request());
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.accounting.records).toHaveLength(1);
      expect(body.accounting.record.pipeline.stage).toBe("retrieval");
      expect(body.accounting.record.failure.validationIssue).toBe(
        "tag_profile",
      );
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
      if (!payload.availableTags) throw Error("private network detail");
      return response(tagOutput());
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

it.each([
  ["近い感覚：まだわからない", []],
  [
    "近い感覚：まだわからない\n自分の言葉：嬉しいけれど不安もある",
    ["喜び", "不安"],
  ],
])(
  "keeps two calls and avoids invented tags only for unspecified feeling: %s",
  async (text, tags) => {
    const mock = vi.fn(async (_url, init) => respondTo(init));
    vi.stubGlobal("fetch", mock);
    const result = await selectWithAI(text as string);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.verification.search?.detectedCategories).toEqual(tags);
    expect(result.selections).toHaveLength(8);
  },
);
