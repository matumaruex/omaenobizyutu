import { GET as historyGET } from "../src/app/api/history/route";
import seed from "../src/data/catalog-seed.json";
vi.mock("../src/lib/catalog/server", () => ({ getCatalog: async () => seed }));
import { POST } from "../src/app/api/exhibition/route";
import { GET } from "../src/app/api/usage/route";
import { candidateWorks, tagOutput } from "./fixtures/ai";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { UsageLedger } from "../src/lib/usage/ledger";
import { getPricing, unknownUsage } from "../src/lib/usage/pricing";
const run = promisify(execFile);
const bin = process.env.REDIS_TEST_BIN;
// Optional real Redis integration; no mock of the atomic Lua scripts.
describe.skipIf(!bin)("durable atomic ledger on a real Redis server", () => {
  let server: ChildProcess;
  const dir = mkdtempSync(path.join(tmpdir(), "museum-usage-"));
  const socket = path.join(dir, "redis.sock");
  async function command(args: (string | number)[]) {
    const { stdout } = await run(path.join(bin!, "redis-cli"), [
      "-s",
      socket,
      "--json",
      ...args.map(String),
    ]);
    return JSON.parse(stdout);
  }
  const ledger = (ns = crypto.randomUUID()) =>
    new UsageLedger(command, `{${ns}}`);
  beforeAll(async () => {
    server = spawn(
      path.join(bin!, "redis-server"),
      [
        "--port",
        "0",
        "--unixsocket",
        socket,
        "--save",
        "",
        "--appendonly",
        "no",
      ],
      { stdio: "ignore" },
    );
    for (let i = 0; i < 100; i++) {
      try {
        if ((await command(["PING"])) === "PONG") return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Test Redis did not start");
  }, 10000);
  afterAll(async () => {
    try {
      await command(["SHUTDOWN", "NOSAVE"]);
    } catch {}
    server?.kill();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("deduplicates concurrent repeated IDs across independent instances", async () => {
    const ns = crypto.randomUUID(),
      id = crypto.randomUUID();
    const result = await Promise.allSettled([
      ledger(ns).reserve(id, "same input", "mimo-v2.6-flash"),
      ledger(ns).reserve(id, "same input", "mimo-v2.6-flash"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = result.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("DUPLICATE");
    expect((await ledger(ns).report()).calls).toBe(1);
  });
  it("blocks the same text even when a double submit creates new IDs", async () => {
    const l = ledger();
    await l.reserve(crypto.randomUUID(), "same input", "mimo-v2.6-flash");
    await expect(
      l.reserve(crypto.randomUUID(), "same input", "mimo-v2.6-flash"),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });
  it("enforces a global limit atomically under concurrent distinct requests", async () => {
    vi.stubEnv("MIMO_TEST_CALL_LIMIT", "3");
    const ns = crypto.randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        ledger(ns).reserve(crypto.randomUUID(), `text ${i}`, "mimo-v2.6-flash"),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => (r as PromiseRejectedResult).reason.code === "LIMIT"),
    ).toBe(true);
    expect((await ledger(ns).report()).calls).toBe(3);
  });
  it("requires durable retrieval success and permits only one atomic continuation", async () => {
    const ns = crypto.randomUUID(),
      l = ledger(ns),
      id = crypto.randomUUID();
    const first = await l.reserve(id, "first", "mimo-v2.6-flash", undefined, {
      exhibitionId: id,
      stage: "retrieval",
    });
    const next = () =>
      ledger(ns).reserve(
        crypto.randomUUID(),
        "first",
        "mimo-v2.6-flash",
        undefined,
        { exhibitionId: id, stage: "selection" },
      );
    await expect(next()).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await l.update(first, unknownUsage(), "succeeded");
    const results = await Promise.allSettled([next(), next()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.code,
    ).toBe("DUPLICATE");
    expect((await l.report()).calls).toBe(2);
  });
  it("enforces the unchanged global limit on the second real request", async () => {
    vi.stubEnv("MIMO_TEST_CALL_LIMIT", "1");
    const l = ledger(),
      id = crypto.randomUUID();
    const first = await l.reserve(id, "first", "mimo-v2.6-flash", undefined, {
      exhibitionId: id,
      stage: "retrieval",
    });
    await l.update(first, unknownUsage(), "succeeded");
    await expect(
      l.reserve(crypto.randomUUID(), "first", "mimo-v2.6-flash", undefined, {
        exhibitionId: id,
        stage: "selection",
      }),
    ).rejects.toMatchObject({ code: "LIMIT" });
    expect((await l.report()).calls).toBe(1);
  });
  it("retains failed/unknown calls, counts finalization once and freezes old rates", async () => {
    const ns = crypto.randomUUID(),
      l = ledger(ns);
    const r = await l.reserve(
      crypto.randomUUID(),
      "private text",
      "mimo-v2.6-flash",
    );
    const u = {
      inputTokens: 1000,
      outputTokens: 100,
      reasoningTokens: 10,
      cachedInputTokens: 500,
    };
    await l.update(r, u, "failed");
    await l.update(r, u, "failed");
    vi.stubEnv(
      "MIMO_PRICING_JSON",
      JSON.stringify({ ...getPricing(), usdJpy: 100 }),
    );
    const unknown = await l.reserve(
      crypto.randomUUID(),
      "unknown response",
      "mimo-v2.6-flash",
    );
    const failure = { kind: "network" as const, elapsedMs: 20000 };
    await l.update({ ...unknown, failure }, unknownUsage(), "failed");
    const report = await ledger(ns).report();
    expect(report.calls).toBe(2);
    expect(report.unpricedCalls).toBe(1);
    expect(report.totalNanoJpy).toBe(14_910_000);
    expect(report.records.find((v) => v.id === r.id)?.pricing.usdJpy).toBe(150);
    expect(JSON.stringify(report)).not.toContain("private text");
    expect(
      (await ledger(ns).history()).entries.find(
        (e) => e.accounting.id === unknown.id,
      )?.accounting.failure,
    ).toEqual(failure);
  });
  it("retains input, search, selections, image results and fees across instances without altering usage totals", async () => {
    const ns = crypto.randomUUID(),
      l = ledger(ns),
      id = crypto.randomUUID();
    const chosen = candidateWorks;
    const retrieval = {
      taggedCount: 212,
      matchingCount: 0,
      detectedCategories: [],
      candidates: chosen.map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        primary: a.primary,
        secondary: a.secondary,
        matchedTags: [],
        score: 0,
      })),
    };
    const search = {
      ...retrieval,
      catalogCommit: seed.commit,
      catalogCount: 200,
    };
    const record = await l.reserve(
      id,
      "quartz <test>",
      "mimo-v2.6-flash",
      search,
    );
    const selection = {
      title: "保存する展示",
      atmosphere: "選定の意図。",
      works: chosen.slice(0, 4).map((a) => ({
        id: a.id,
        title: a.title,
        titleJa: "保存時の題名",
        artist: a.artist,
        role: "共鳴" as const,
        reason: "保存する理由。",
      })),
    };
    await l.update(
      record,
      {
        inputTokens: 1000,
        outputTokens: 100,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      "succeeded",
      selection,
    );
    const next = ledger(ns);
    expect(await next.reportDisplay(id, [])).toBe("OK");
    let entry = (await next.history()).entries[0];
    expect(entry.history?.input).toBe("quartz <test>");
    expect(entry.history?.selection).toEqual(selection);
    expect(entry.history?.search?.detectedCategories).toEqual([]);
    expect(entry.history?.search?.candidates[0].matchedTags).toEqual([]);
    expect(entry.history?.display?.displayedIds).toEqual([]);
    expect(await next.reportDisplay(id, [selection.works[0].id])).toBe("OK");
    expect(await next.reportDisplay(id, ["met-9999999"])).toBe("INVALID");
    entry = (await ledger(ns).history()).entries[0];
    expect(entry.history?.display?.displayedIds).toEqual([
      selection.works[0].id,
    ]);
    expect(entry.accounting.estimate?.nanoJpy).toBe(25_200_000);
    expect((await next.report()).calls).toBe(1);
    expect(JSON.stringify(await next.report())).not.toContain("quartz");
  });
  it("pages all recorded calls and leaves pre-feature selections unavailable", async () => {
    const ns = crypto.randomUUID(),
      l = ledger(ns);
    const old = await l.reserve(
      crypto.randomUUID(),
      "old input",
      "mimo-v2.6-flash",
    );
    await command(["HDEL", `{${ns}}:history`, old.id]);
    const a = await l.reserve(
      crypto.randomUUID(),
      "new first",
      "mimo-v2.6-flash",
    );
    const b = await l.reserve(
      crypto.randomUUID(),
      "new second",
      "mimo-v2.6-flash",
    );
    expect((await l.history(0, 2)).entries.map((e) => e.accounting.id)).toEqual(
      [b.id, a.id],
    );
    const previous = await l.history(2, 2);
    expect(previous.calls).toBe(3);
    expect(previous.entries[0].history).toBeNull();
    expect(previous.entries[0].accounting.id).toBe(old.id);
  });
  it("completes API → SDK → raw usage → real Redis → reporting, then blocks a replay", async () => {
    vi.stubEnv("MIMO_API_KEY", "test-not-real");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-not-real");
    vi.stubEnv("MIMO_USAGE_NAMESPACE", crypto.randomUUID());
    let paidCalls = 0;
    const input = "安心したい";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (String(url) === "https://test.upstash.io")
          return Response.json({
            result: await command(JSON.parse(init.body)),
          });
        paidCalls++;
        const payload = JSON.parse(
          JSON.parse(String(init.body)).messages.at(-1).content,
        );
        const selections = (payload.candidates ?? [])
          .slice(0, 8)
          .map((a: { id: string }) => ({
            id: a.id,
            role: "共鳴",
            reason: "作品固有の主題を入口に鑑賞します。",
          }));
        return Response.json({
          id: "test",
          model: "mimo-v2.6-flash",
          object: "chat.completion",
          created: 1,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                reasoning_content: "internal private trace",
                content: JSON.stringify(
                  payload.availableTags
                    ? tagOutput()
                    : {
                        title: "余白",
                        atmosphere: "作品の主題に触れる構成。",
                        selections,
                      },
                ),
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 100,
            prompt_tokens_details: { cached_tokens: 500 },
            completion_tokens_details: { reasoning_tokens: 10 },
          },
        });
      }),
    );
    const id = crypto.randomUUID();
    const req = () =>
      new Request("http://localhost/api/exhibition", {
        method: "POST",
        headers: { "idempotency-key": id, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });
    const first = await POST(req());
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.verification.accounting.persisted).toBe(true);
    expect(
      result.verification.accounting.records.every(
        (r: { elapsedMs?: number }) =>
          typeof r.elapsedMs === "number" && r.elapsedMs >= 0,
      ),
    ).toBe(true);
    expect((await POST(req())).status).toBe(409);
    const report = await (await GET()).json();
    expect(report.calls).toBe(2);
    expect(report.records[0].usage.reasoningTokens).toBe(10);
    expect(report.totalNanoJpy).toBe(29_820_000);
    const history = await (
      await historyGET(new Request("http://localhost/api/history"))
    ).json();
    expect(history.entries[0].history.input).toBe(input);
    expect(history.entries[0].history.selection.works).toHaveLength(8);
    expect(history.entries[0].history.search.candidates).toHaveLength(24);
    expect(history.entries[0].accounting.pipeline.exhibitionId).toBe(id);
    expect(
      history.entries.map(
        (e: { accounting: { elapsedMs?: number } }) => e.accounting.elapsedMs,
      ),
    ).toEqual(
      [...result.verification.accounting.records]
        .reverse()
        .map((r: { elapsedMs?: number }) => r.elapsedMs),
    );
    expect(history.entries[1].accounting.id).toBe(id);
    expect(history.entries[1].accounting.pipeline.stage).toBe("retrieval");
    expect(history.entries[1].history.search.candidates).toHaveLength(24);
    expect(JSON.stringify(history)).not.toContain("internal private trace");
    expect(JSON.stringify(history)).not.toContain("test-not-real");
    expect(paidCalls).toBe(2);
  });
});
