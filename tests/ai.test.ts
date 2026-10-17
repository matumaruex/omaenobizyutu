import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { collection } from "../src/lib/collection";
import { createDemoExhibition } from "../src/lib/curation";
const mocked = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({
  generateText: mocked.generateText,
  Output: { object: (v: unknown) => v },
}));
import { selectWithAI } from "../src/lib/ai/select";
import { POST } from "../src/app/api/exhibition/route";
describe("server AI contract without provider charges", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
    vi.stubEnv("OPENAI_MODEL", "configured-model");
    mocked.generateText.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it("passes a bounded verified catalog and returns a validated AI exhibition", async () => {
    const chosen = createDemoExhibition("静か");
    mocked.generateText.mockResolvedValue({
      output: {
        title: "静けさの輪郭",
        atmosphere: "絵と、今の気持ち。",
        selections: chosen.selections,
      },
    });
    const result = await selectWithAI("嬉しいけれど不安もある");
    expect(result.mode).toBe("ai");
    expect(mocked.generateText).toHaveBeenCalledTimes(1);
    const call = mocked.generateText.mock.calls[0][0];
    const payload = JSON.parse(call.prompt);
    expect(payload.candidates.length).toBeLessThanOrEqual(24);
    expect(
      payload.candidates.every((a: { id: number }) =>
        collection.some((v) => v.id === a.id),
      ),
    ).toBe(true);
    expect(call.maxRetries).toBe(0);
    expect(call.providerOptions.openai.store).toBe(false);
  });
  it("rejects invented IDs rather than displaying fabricated artworks", async () => {
    const selections = createDemoExhibition("静か").selections;
    mocked.generateText.mockResolvedValue({
      output: {
        title: "x",
        atmosphere: "x",
        selections: [{ ...selections[0], id: -1 }, ...selections.slice(1)],
      },
    });
    await expect(selectWithAI("静か")).rejects.toThrow("INVALID_SELECTION");
  });
  it("handles provider errors without exposing raw input or provider error text", async () => {
    mocked.generateText.mockRejectedValue(
      new Error("provider secret error text"),
    );
    const input = "個人的な文章";
    const response = await POST(
      new Request("http://localhost:3000/api/exhibition", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://localhost:3000" },
        body: JSON.stringify({ text: input, mode: "ai" }),
      }),
    );
    expect(response.status).toBe(502);
    const output = await response.text();
    expect(output).not.toContain(input);
    expect(output).not.toContain("provider secret");
    expect(output).toContain("無料デモ");
  });
  it("accepts browser host through a dev-server URL rewrite", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/exhibition", {
        method: "POST",
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
        body: JSON.stringify({ text: "静か", mode: "demo" }),
      }),
    );
    expect(response.status).toBe(200);
  });
});
