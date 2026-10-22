import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { POST as newPost } from "../../src/app/api/exhibition/route";
import { readUsage } from "../../src/lib/usage/pricing";
import type { AccountingResult } from "../../src/lib/usage/types";

// Only an explicit, deployment-specific build command may run paid benchmarks.
// Normal pushes, builds, page views and application requests never run this file.
const runId = "mimo-comparison-20261022-b";
const outputPath = `public/${runId}.json`;
const cases = [
  {
    text: "憂鬱なきぶん",
    oldId: "64718ea0-2667-43c7-b52b-77cd5ca52ec9",
    newId: "fd3d9b7e-6ae7-4789-a89d-ae4bf570278a",
  },
  {
    text: "不安はないけれど、何もする気が起きない",
    oldId: "47a1a364-5820-4155-a59a-049a0146ba54",
    newId: "05bfcd30-a759-47a2-a87f-0f0bbd69982c",
  },
];

async function main() {
  if (!process.argv.includes("--run-paid-20261022b")) {
    console.log("MIMO_BENCH_NOT_RUN: explicit paid-run argument required");
    return;
  }
  const nativeFetch = globalThis.fetch;
  const providerCalls: {
    elapsedMs: number;
    status?: number;
    usage?: ReturnType<typeof readUsage>;
  }[] = [];
  const results: Record<string, unknown>[] = [];
  const report = {
    runId,
    createdAt: new Date().toISOString(),
    baselineCommit: "6bcc249ba9316e0f2917b46cb0ae9dbadc72dd0b",
    improvedCommit: "e95fa787d661fca206eabfd894063ae32212b089",
    maxPaidCalls: 4,
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
        call.usage = readUsage((await response.clone().json())?.usage);
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
      for (let index = 0; index < cases.length; index++) {
        const item = cases[index];
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
          caseIndex: index,
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
              caseIndex: index,
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
