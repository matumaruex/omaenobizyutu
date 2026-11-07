import { mkdir, writeFile } from "node:fs/promises";
import { selectWithAI, MIMO_MODEL } from "../../src/lib/ai/select";
import { UsageLedger, UsageGateError } from "../../src/lib/usage/ledger";
import { SelectionFailure } from "../../src/lib/ai/failure";
import { estimateCost, unknownUsage } from "../../src/lib/usage/pricing";
import type { UsageRecord } from "../../src/lib/usage/types";
import type { SearchTrace, SavedSelection } from "../../src/lib/history/types";
import { cases, caseId, MAX_PAID_CALLS, RUN_ID } from "./plan";
import catalog from "./catalog.json";

// Benchmark branch only. No paid execution during normal npm build / git push.
// An isolated, persistent ledger enforces the complete 50-call authorization,
// including reruns and other deployments. The application's ledger is untouched.
async function main() {
  const batchArg = process.argv.find((a) => /^--paid-batch=[123]$/.test(a));
  if (!batchArg) {
    console.log(
      JSON.stringify({
        runId: RUN_ID,
        paid: false,
        plannedCalls: cases.length * 2,
        cap: MAX_PAID_CALLS,
      }),
    );
    return;
  }
  if (process.env.VERCEL_ENV !== "preview") throw Error("PREVIEW_REQUIRED");
  const batch = Number(batchArg.split("=")[1]);
  const startArg = process.argv.find((a) => /^--start-at=[0-7]$/.test(a));
  const startAt = startArg ? Number(startArg.split("=")[1]) : 0;
  const selected = cases.slice((batch - 1) * 8 + startAt, batch * 8);
  // Applies only to this separate build process and this explicit ledger.
  process.env.MIMO_TEST_CALL_LIMIT = String(MAX_PAID_CALLS);
  const ledger = new UsageLedger(undefined, `{${RUN_ID}}`);
  const before = await ledger.report();
  if (before.pendingCalls) throw Error("UNRESOLVED_PREVIOUS_CALL");
  const history = await ledger.history(0, 100);
  const completed = new Map(
    history.entries
      .filter(
        (e) => e.accounting.status === "succeeded" && e.history?.selection,
      )
      .map((e) => [e.accounting.pipeline!.exhibitionId, e.history!.selection!]),
  );
  const nativeFetch = globalThis.fetch;
  let actualCalls = 0;
  let currentCase = "";
  const providerDiagnostics: Record<string, unknown>[] = [];
  const results: Record<string, unknown>[] = [];
  const report = {
    runId: RUN_ID,
    batch,
    startAt,
    providerDiagnostics,
    createdAt: new Date().toISOString(),
    baselineCommit: "727a8404acd8eaf3533cbcc241153481103f1e2c",
    testedCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    catalogCommit: catalog.commit,
    eligible: catalog.selection.length,
    authorizationCap: MAX_PAID_CALLS,
    batchCallCap: selected.length * 2,
    isolatedAccounting: true,
    quotaBefore: before.calls,
    timeoutsMs: { retrieval: 30000, selection: 60000 },
    complete: false,
    stop: "",
    results,
    actualCalls: 0,
    quotaAfter: before.calls,
    ledger: before,
  };
  const outputPath = `public/${RUN_ID}-${batch}${startAt ? `-from-${startAt}` : ""}.json`;
  const save = async () => {
    report.actualCalls = actualCalls;
    await mkdir("public", { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2));
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.xiaomimimo.com") {
      if (actualCalls >= report.batchCallCap) throw Error("BATCH_CALL_CAP");
      actualCalls++;
      const diagnostic: Record<string, unknown> = { case: currentCase };
      providerDiagnostics.push(diagnostic);
      const response = await nativeFetch(input, init);
      diagnostic.httpStatus = response.status;
      try {
        const raw = await response.clone().json();
        const value = JSON.parse(raw.choices?.[0]?.message?.content ?? "null");
        diagnostic.truncated = raw.choices?.[0]?.finish_reason === "length";
        diagnostic.kind = Array.isArray(value?.selections)
          ? "selection"
          : "tags";
        if (Array.isArray(value?.selections)) {
          diagnostic.count = value.selections.length;
          diagnostic.uniqueCount = new Set(
            value.selections.map((s: { candidate: number }) => s.candidate),
          ).size;
          diagnostic.reasonLengths = value.selections.map(
            (s: { reason: string }) =>
              typeof s.reason === "string" ? s.reason.length : null,
          );
        }
      } catch {
        diagnostic.bodyUnavailable = true;
      }
      return response;
    }
    return nativeFetch(input, init);
  };
  try {
    for (const item of selected) {
      currentCase = item.key;
      const prior = cases
        .filter(
          (c) =>
            c.scenario === item.scenario &&
            c.variant === item.variant &&
            c.iteration < item.iteration,
        )
        .sort((a, b) => b.iteration - a.iteration)
        .flatMap((c) =>
          completed.has(c.id)
            ? [completed.get(c.id)!.works.map((w) => w.id)]
            : [],
        )
        .slice(0, 5);
      const records = new Map<string, UsageRecord>();
      let record: UsageRecord | undefined;
      let search: SearchTrace | undefined;
      let observed = unknownUsage();
      let selection: SavedSelection | undefined;
      let failure: unknown;
      let status = "failed";
      const started = performance.now();
      const callOffset = actualCalls;
      try {
        const exhibition = await selectWithAI(
          item.text,
          undefined,
          {
            beforeRequest: async (trace, stage) => {
              search = trace;
              record = await ledger.reserve(
                caseId(item.key, stage),
                // Controlled repeated-input experiment: cases have independent
                // identities, while a repeated case is permanently blocked.
                `${item.key}\n${item.text}`,
                MIMO_MODEL,
                trace,
                { exhibitionId: item.id, stage },
              );
              observed = unknownUsage();
              records.set(record.id, record);
            },
            onUsage: async (usage, elapsedMs) => {
              observed = usage;
              if (!record) throw Error("MISSING_RESERVATION");
              record = await ledger.update(
                { ...record, elapsedMs },
                usage,
                "pending",
              );
              records.set(record.id, record);
            },
            onRetrievalComplete: async (trace) => {
              search = trace;
              if (!record) throw Error("MISSING_RESERVATION");
              record = await ledger.update(
                record,
                observed,
                "succeeded",
                undefined,
                { input: item.text, search },
              );
              records.set(record.id, record);
            },
          },
          {
            catalog,
            ...(item.variant === "balanced"
              ? { sampling: { seed: item.id, recentExhibitions: prior } }
              : {}),
          },
        );
        selection = {
          title: exhibition.title,
          atmosphere: exhibition.atmosphere,
          works: exhibition.selections.map((s) => ({
            id: s.id,
            title: s.artwork!.title,
            titleJa: s.artwork!.titleJa,
            artist: s.artwork!.artist,
            role: s.role,
            reason: s.reason,
          })),
        };
        status = "succeeded";
      } catch (error) {
        failure =
          error instanceof SelectionFailure
            ? error.diagnostic
            : {
                kind:
                  error instanceof UsageGateError
                    ? error.code
                    : "BENCHMARK_ERROR",
              };
        if (record && error instanceof SelectionFailure)
          record = {
            ...record,
            failure: error.diagnostic,
            elapsedMs: error.diagnostic.elapsedMs,
          };
      }
      if (record?.status === "pending") {
        record = await ledger.update(
          record,
          observed,
          status === "succeeded" ? "succeeded" : "failed",
          selection,
          { input: item.text, search },
        );
        records.set(record.id, record);
      }
      if (selection && status === "succeeded")
        completed.set(item.id, selection);
      const accounting = [...records.values()];
      const row = {
        ...item,
        status,
        elapsedMs: Math.round(performance.now() - started),
        actualCalls: actualCalls - callOffset,
        search,
        selection,
        failure,
        previousExhibitions: prior,
        accounting,
        knownNanoJpy: accounting.reduce(
          (sum, r) => sum + (r.estimate?.nanoJpy ?? 0),
          0,
        ),
        unpricedCalls: accounting.filter((r) => !r.estimate).length,
        coldCacheNanoJpy: accounting.reduce(
          (sum, r) =>
            sum +
            (estimateCost({ ...r.usage, cachedInputTokens: 0 }, r.pricing)
              ?.nanoJpy ?? 0),
          0,
        ),
      };
      results.push(row);
      await save();
      console.log(
        "BALANCE_CASE " +
          JSON.stringify({
            key: item.key,
            status,
            elapsedMs: row.elapsedMs,
            actualCalls: row.actualCalls,
            nanoJpy: row.knownNanoJpy,
            failure,
          }),
      );
      if (status !== "succeeded") {
        report.stop = "CASE_FAILED_NO_RETRY";
        break;
      }
    }
    report.complete = results.length === selected.length && !report.stop;
  } catch {
    report.stop = "STORAGE_OR_RUN_FAILURE";
  } finally {
    globalThis.fetch = nativeFetch;
    try {
      report.ledger = await ledger.report();
      report.quotaAfter = report.ledger.calls;
    } catch {
      report.stop = "FINAL_ACCOUNTING_UNAVAILABLE";
    }
    await save();
    console.log(
      "BALANCE_DONE " +
        JSON.stringify({
          batch,
          complete: report.complete,
          stop: report.stop,
          actualCalls,
          quotaAfter: report.quotaAfter,
        }),
    );
  }
}
main().catch(() => {
  console.log("BALANCE_NOT_STARTED");
  process.exitCode = 1;
});
