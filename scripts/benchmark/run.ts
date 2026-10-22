import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { POST as newPost } from "../../src/app/api/exhibition/route";
import { readUsage } from "../../src/lib/usage/pricing";
import type { AccountingResult } from "../../src/lib/usage/types";

// This paid runner exists only on the benchmark branch. Normal builds never run it.
const runId = "mimo-timeout-20261022-c";
const outputPath = `public/${runId}.json`;
const cases = [
  {
    text: "今日は予定していた仕事が終わって、ほっとしている。帰り道の空が明るくて、いつもより遠回りして歩きたい気もした。けれど新しい仕事の準備はまだ残っていて、何から始めればよいか決められずにいる。楽しみな気持ちと心配が交互に来て、どちらか一つに言い切るのは難しい。昔住んでいた町の写真を見て、あのころの道や店の音を思い出した。戻りたいと強く願っているわけではないが、もう同じようには会えない時間があることを感じる。誰かを失った出来事があったわけでもなく、今の生活が嫌なわけでもない。いろいろな気持ちが重なって、うまく名前を付けられないだけかもしれない。家に着いたら温かい飲み物を用意して、窓の外を少し眺めていたい。明日のために元気にならなければ、と急いで結論を出す気分でもない。少し静かにしていたいけれど、人の気配が全くないのは寂しい。大きな喜びや悲しみというより、一日の終わりの細かな揺れが残っている。新しい場所で知り合う人たちと、どんな話ができるのかには興味がある。知らないものを見たい気持ちはあるのに、予定を詰め込むほどの力はない。進みたい気持ちと休みたい気持ちが同じくらいあって、どちらも本当だと感じる。すぐに答えを決めず、それぞれの気持ちをそのまま置いておきたい。窓辺の小さな植物を見ていると、昨日とほとんど同じ姿なのに、少しだけ葉の向きが変わっている気がする。そういう小さな違いには気づいていたい。はっきりした物語や励ましを求めているというより、今の自分が何に目を留めるのかをゆっくり確かめたい。",
    newId: "6025510e-19d5-4220-995b-5c6904f4211c",
  },
  {
    text: "転職が決まってうれしい。でも新しい場所でやっていけるか心配で落ち着かない。",
    newId: "f817a0b1-21d3-463f-ade5-42d08f0dc53c",
  },
];
async function main() {
  if (!process.argv.includes("--run-paid-timeout-20261022c")) {
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
    baselineCommit: "fc902865c133eeba527b497e01bfcab0971e2cbb",
    improvedCommit: "9f8c1aaf060e37bf273e8182f4fe519f2ecada06",
    maxPaidCalls: 4,
    timeoutsMs: { retrieval: 30000, selection: 90000 },
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
          const ids = selections.map(
            (s: { id?: string; candidate?: number }) =>
              typeof s.candidate === "number"
                ? payload.candidates?.[s.candidate - 1]?.id
                : s.id,
          );
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
    for (const mode of ["new"] as readonly ("old" | "new")[]) {
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
          inputLength: item.text.length,
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
