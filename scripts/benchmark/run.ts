import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { POST as oldPost } from "./old-route";
import { POST as newPost } from "../../src/app/api/exhibition/route";
import { readUsage } from "../../src/lib/usage/pricing";
import type { AccountingResult } from "../../src/lib/usage/types";

// This paid runner exists only on the benchmark branch. Normal builds never run it.
const runId = "mimo-tags-20261022-a";
const outputPath = `public/${runId}.json`;
const cases = [
  {
    text: "憂鬱なきぶん",
    oldId: "6780baa8-6740-4d2c-82bb-1998247b3a50",
    newId: "f60c5c5f-7b7f-4aaa-9241-b8f4273b0ad1",
  },
  {
    text: "不安はないけれど、何もする気が起きない",
    oldId: "3feaf4c5-dacc-4a17-ae66-e6b143449fc1",
    newId: "1313e322-55bf-4c96-9e85-9ca63d9068d4",
  },
];
async function main() {
  if (!process.argv.includes("--run-paid-tags-20261022a")) {
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
    improvedCommit: "c833f43",
    maxPaidCalls: 6,
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
      try {
        const raw = await response.clone().json();
        call.usage = readUsage(raw?.usage);
        try {
          const content = JSON.parse(
            raw?.choices?.[0]?.message?.content ?? "null",
          );
          const payload = JSON.parse(
            JSON.parse(String(init?.body)).messages.at(-1).content,
          );
          const allowedTags = new Set(
            (payload.availableTags ?? []).map((t: { name: string }) => t.name),
          );
          const allowedIds = new Set(
            (payload.candidates ?? []).map((a: { id: string }) => a.id),
          );
          const selections = Array.isArray(content?.selections)
            ? content.selections
            : [];
          const ids = selections.map((s: { id?: string }) => s.id);
          call.detail = payload.availableTags
            ? {
                kind: "tags",
                tags: content?.tags?.filter((t: string) => allowedTags.has(t)),
                negatedTags: content?.negatedTags?.filter((t: string) =>
                  allowedTags.has(t),
                ),
              }
            : {
                kind: "selection",
                count: selections.length,
                uniqueCount: new Set(ids).size,
                outsideCount: ids.filter((id: string) => !allowedIds.has(id))
                  .length,
                titleLength:
                  typeof content?.title === "string"
                    ? content.title.trim().length
                    : null,
                atmosphereLength:
                  typeof content?.atmosphere === "string"
                    ? content.atmosphere.trim().length
                    : null,
                reasonLengths: selections.map((s: { reason?: string }) =>
                  typeof s.reason === "string" ? s.reason.trim().length : null,
                ),
                rolesAllowed: selections.every((s: { role?: string }) =>
                  ["共鳴", "別のまなざし", "偶然の出会い", "余韻"].includes(
                    s.role ?? "",
                  ),
                ),
              };
          call.detail.truncated = raw?.choices?.[0]?.finish_reason === "length";
        } catch {
          call.detail = { jsonParseFailed: true };
        }
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
    for (const mode of ["old", "new"] as const) {
      // Preserve the existing 60s same-text deduplication in the real ledger.
      if (mode === "new")
        await new Promise((resolve) => setTimeout(resolve, 61000));
      for (let index = 0; index < cases.length; index++) {
        const item = cases[index];
        const callOffset = providerCalls.length;
        const started = performance.now();
        const response = await (mode === "old" ? oldPost : newPost)(
          new Request("https://benchmark.invalid/api/exhibition", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": mode === "old" ? item.oldId : item.newId,
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
            (sum, r) => sum + (r.estimate?.nanoJpy ?? 0),
            0,
          ),
          unpricedCalls: records.filter((r) => r.estimate === null).length,
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
              diagnostics: records.map((r) => r.failure ?? null),
              providerCalls: row.providerCalls,
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
