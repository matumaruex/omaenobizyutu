import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import seed from "../src/data/catalog-seed.json";
import { selectCandidates } from "../src/lib/ai/candidates";
vi.mock("../src/lib/catalog/server", () => ({ getCatalog: async () => seed }));
import { selectWithAI } from "../src/lib/ai/select";
import { POST } from "../src/app/api/exhibition/route";
const input = "嬉しいけれど不安もある";
function chosen() {
  return {
    title: "気持ちの余白",
    atmosphere: "揺れる気持ちを入口に、作品それぞれの背景へ開く構成。",
    selections: selectCandidates(input, seed.selection)
      .slice(0, 6)
      .map((a) => ({
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
    usage: { prompt_tokens: 4500, completion_tokens: 600, total_tokens: 5100 },
  });
}
function request(text = input, extra = {}) {
  return new Request("http://localhost/api/exhibition", {
    method: "POST",
    headers: { host: "localhost", origin: "http://localhost" },
    body: JSON.stringify({ text, ...extra }),
  });
}
beforeEach(() => {
  vi.stubEnv("MIMO_API_KEY", "test-only-not-a-real-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("real SDK request contract, with all upstream HTTP mocked", () => {
  it("makes one official MiMo Chat Completions call with thinking off and bounded JSON", async () => {
    const mock = vi.fn(async () => response());
    vi.stubGlobal("fetch", mock);
    const result = await selectWithAI(input);
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
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
      payload.candidates.every((a: { id: string }) =>
        seed.artworks.some((v) => v.id === a.id),
      ),
    ).toBe(true);
    expect(result.verification.inputTokens).toBe(4500);
    expect(result.selections.every((a) => a.artwork?.id === a.id)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("test-only-not-a-real-key");
  });
  for (const kind of ["outside", "duplicate", "schema"] as const)
    it(`rejects ${kind} provider output`, async () => {
      const value = chosen();
      if (kind === "outside") value.selections[0].id = "met-9999999";
      if (kind === "duplicate") value.selections[0].id = value.selections[1].id;
      if (kind === "schema") value.atmosphere = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response(value)),
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
