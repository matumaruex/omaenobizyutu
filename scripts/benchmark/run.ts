import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import seed from "../../src/data/catalog-seed.json";
import { POST as newPost } from "../../src/app/api/exhibition/route";
import { readUsage } from "../../src/lib/usage/pricing";
import type { AccountingResult } from "../../src/lib/usage/types";

// Only an explicit, deployment-specific build command may run paid benchmarks.
// Normal pushes, builds, page views and application requests never run this file.
const runId = "mimo-comparison-20261022-d";
const outputPath = `public/${runId}.json`;
const cases = [
  {
    text: "憂鬱なきぶん",
    oldId: "64718ea0-2667-43c7-b52b-77cd5ca52ec9",
    newId: "87ed5e10-b4ef-4d39-9eaf-6c3ff1b5af35",
  },
  {
    text: "不安はないけれど、何もする気が起きない",
    oldId: "47a1a364-5820-4155-a59a-049a0146ba54",
    newId: "0853ba06-5abc-47ce-a4ce-f2f012f17d39",
  },
];

async function main() {
  if (!process.argv.includes("--run-paid-20261022d")) {
    console.log("MIMO_BENCH_NOT_RUN: explicit paid-run argument required");
    return;
  }
  const nativeFetch = globalThis.fetch;
  const providerCalls: {
    elapsedMs: number;
    status?: number;
    usage?: ReturnType<typeof readUsage>;
    detail?: Record<string, unknown>;
  }[] = [];
  const results: Record<string, unknown>[] = [];
  const report = {
    runId,
    createdAt: new Date().toISOString(),
    baselineCommit: "6bcc249ba9316e0f2917b46cb0ae9dbadc72dd0b",
    improvedCommit: "9ef1a3784e46ff52914373870fbb5286d4a8ed47",
    maxPaidCalls: 2,
    complete: false,
    stop: "",
    results,
    providerCalls,
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "api.xiaomimimo.com") return nativeFetch(input, init);
    if (providerCalls.length >= report.maxPaidCalls)
      throw Error("BENCHMARK_CALL_CAP");
    const call: (typeof providerCalls)[number] = { elapsedMs: 0 };
    providerCalls.push(call);
    const started = performance.now();
    try {
      const response = await nativeFetch(input, init);
      call.status = response.status;
      // Include receipt of the complete non-streaming JSON, without retaining it.
      try {
        const raw = await response.clone().json();
        call.usage = readUsage(raw?.usage);
        try {
          const content = JSON.parse(
            raw?.choices?.[0]?.message?.content ?? "null",
          );
          const values = Array.isArray(content) ? content : content?.candidates;
          const list = Array.isArray(values) ? values : [];
          const ids = list
            .map((v) => (typeof v === "string" ? v : v?.id))
            .filter((v) => typeof v === "string");
          const byId = new Map(seed.selection.map((a) => [a.id, a]));
          const artistCounts = new Map<string, number>();
          for (const id of ids) {
            const art = byId.get(id);
            if (art)
              artistCounts.set(
                art.artistKey,
                (artistCounts.get(art.artistKey) ?? 0) + 1,
              );
          }
          call.detail = {
            outputArray: Array.isArray(content),
            hasCandidates: Array.isArray(content?.candidates),
            count: list.length,
            stringCount: list.filter((v) => typeof v === "string").length,
            idCount: ids.length,
            duplicateCount: ids.length - new Set(ids).size,
            unknownIdCount: ids.filter((id) => !byId.has(id)).length,
            artistsOverLimit: [...artistCounts.entries()].filter(
              ([, count]) => count > 2,
            ),
            truncated: raw?.choices?.[0]?.finish_reason === "length",
          };
        } catch {
          call.detail = { jsonParseFailed: true };
        }
        console.log("MIMO_BENCH_CALL " + JSON.stringify(call));
      } catch {}
      return response;
    } finally {
      call.elapsedMs = Math.round(performance.now() - started);
    }
  };
  const save = async () => {
    await mkdir("public", { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2));
  };
  try {
    for (const mode of ["new"] as const) {
      for (let index = 0; index < 1; index++) {
        const item = cases[1];
        const callOffset = providerCalls.length;
        const started = performance.now();
        const response = await newPost(
          new Request("https://benchmark.invalid/api/exhibition", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.newId,
            },
            body: JSON.stringify({ text: item.text }),
          }),
        );
        const body = await response.json();
        const accounting = (body.verification?.accounting ??
          body.accounting) as AccountingResult | undefined;
        const records =
          accounting?.records ?? (accounting ? [accounting.record] : []);
        const row = {
          mode,
          caseIndex: 1,
          input: item.text,
          status: response.status,
          elapsedMs: Math.round(performance.now() - started),
          paidCalls: providerCalls.length - callOffset,
          providerCalls: providerCalls.slice(callOffset),
          knownNanoJpy: records.reduce(
            (sum, record) => sum + (record.estimate?.nanoJpy ?? 0),
            0,
          ),
          unpricedCalls: records.filter((record) => record.estimate === null)
            .length,
          accounting: records,
          persisted: accounting?.persisted,
          title: body.title,
          atmosphere: body.atmosphere,
          selections: body.selections?.map(
            (s: { id: string; role: string; reason: string }) => ({
              id: s.id,
              role: s.role,
              reason: s.reason,
            }),
          ),
          search: body.verification?.search,
          usage: body.verification?.usage,
          code: body.code,
        };
        results.push(row);
        await save();
        console.log(
          "MIMO_BENCH_CASE " +
            JSON.stringify({
              mode,
              caseIndex: 1,
              status: row.status,
              elapsedMs: row.elapsedMs,
              paidCalls: row.paidCalls,
              knownNanoJpy: row.knownNanoJpy,
              unpricedCalls: row.unpricedCalls,
              persisted: row.persisted,
              usage: row.usage,
              diagnostics: records.map((r) => r.failure ?? null),
            }),
        );
        if (!response.ok || accounting?.persisted !== true) {
          report.stop = "CASE_FAILED_OR_NOT_PERSISTED";
          return;
        }
      }
    }
    report.complete = true;
  } catch {
    // Do not print SDK errors, request bodies, credentials or provider responses.
    report.stop = "BENCHMARK_INTERRUPTED";
  } finally {
    globalThis.fetch = nativeFetch;
    await save();
    console.log(
      "MIMO_BENCH_DONE " +
        JSON.stringify({
          runId,
          complete: report.complete,
          stop: report.stop,
          paidCalls: providerCalls.length,
          results: results.length,
          outputPath,
        }),
    );
  }
}
main().catch(() => {
  console.log("MIMO_BENCH_STORAGE_FAILED");
  process.exitCode = 1;
});
