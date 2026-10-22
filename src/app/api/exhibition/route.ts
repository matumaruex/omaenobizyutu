import type { SavedSelection } from "@/lib/history/types";
import { z } from "zod";
import { aiConfigured, MIMO_MODEL, selectWithAI } from "@/lib/ai/select";
import { UsageLedger, UsageGateError } from "@/lib/usage/ledger";
import { unknownUsage, estimateCost } from "@/lib/usage/pricing";
import type { UsageRecord } from "@/lib/usage/types";
import { SelectionFailure } from "@/lib/ai/failure";
import { failureMessage } from "@/lib/usage/failure";
import { inspectionAvailable } from "@/lib/access";
export const runtime = "nodejs";
// Up to 60s retrieval + 35s final selection, plus durable accounting.
export const maxDuration = 150;
const inputSchema = z
  .object({
    text: z.string().trim().min(1).max(800),
  })
  .strict();
let inFlight = 0;
const headers = { "Cache-Control": "no-store" };
function isSameOrigin(origin: string, host: string) {
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === host;
  } catch {
    return false;
  }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    !isSameOrigin(
      origin,
      request.headers.get("host") || new URL(request.url).host,
    )
  )
    return Response.json(
      { error: "この操作は美術館の画面から行ってください。" },
      { status: 403, headers },
    );
  if (Number(request.headers.get("content-length")) > 12000)
    return Response.json(
      { error: "文章が長すぎます。800文字以内で入力してください。" },
      { status: 413, headers },
    );
  let input;
  try {
    // Reading a bounded stream also protects requests without a Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("NO_BODY");
    let raw = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 12000) {
        await reader.cancel();
        return Response.json(
          { error: "文章が長すぎます。" },
          { status: 413, headers },
        );
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return Response.json(
      { error: "気持ちを1〜800文字で入力してください。" },
      { status: 400, headers },
    );
  }
  if (!aiConfigured())
    return Response.json(
      {
        error:
          "MiMoの接続設定が完了していません。少し時間をおいてお試しください。",
        code: "AI_UNAVAILABLE",
      },
      { status: 503, headers },
    );
  if (inFlight >= 3)
    return Response.json(
      {
        error: "ただいま選定が混み合っています。少し待ってからお試しください。",
      },
      { status: 429, headers },
    );
  const requestId = request.headers.get("idempotency-key");
  if (!requestId || !z.uuid().safeParse(requestId).success)
    return Response.json(
      { error: "画面を更新して、もう一度お試しください。" },
      { status: 400, headers },
    );
  inFlight++;
  let record: UsageRecord | undefined;
  const records = new Map<string, UsageRecord>();
  const remember = () => {
    if (record) records.set(record.id, record);
  };
  const accountingResult = () =>
    record ? { record, records: [...records.values()], persisted } : undefined;
  let gateError: UsageGateError | undefined;
  let observed = unknownUsage();
  let persisted = true;
  let ledger: UsageLedger | undefined;
  let selection: SavedSelection | undefined;
  const finish = async (status: "succeeded" | "failed") => {
    if (!record || !ledger || record.status !== "pending") return;
    record = {
      ...record,
      status,
      usage: observed,
      estimate: estimateCost(observed, record.pricing),
    };
    try {
      await ledger.update(record, observed, status, selection);
    } catch {
      persisted = false;
    }
    remember();
  };
  try {
    ledger = new UsageLedger();
    const result = await selectWithAI(input.text, request.signal, {
      beforeRequest: async (search, stage) => {
        if (request.signal.aborted) throw Error("ABORTED");
        try {
          record = await ledger!.reserve(
            stage === "retrieval" ? requestId : crypto.randomUUID(),
            input.text,
            MIMO_MODEL,
            search,
            { exhibitionId: requestId, stage },
          );
          observed = unknownUsage();
          remember();
        } catch (error) {
          gateError =
            error instanceof UsageGateError
              ? error
              : new UsageGateError("UNAVAILABLE");
          throw gateError;
        }
      },
      onUsage: async (usage) => {
        observed = usage;
        if (!record) return;
        try {
          record = await ledger!.update(record, usage, "pending");
        } catch {
          persisted = false;
        }
        remember();
      },
      onRetrievalComplete: async (search) => {
        if (!record) throw new UsageGateError("UNAVAILABLE");
        // The next quota reservation checks this durable completion atomically.
        // Never spend on stage two if stage one's result could not be saved.
        try {
          record = await ledger!.update(
            record,
            observed,
            "succeeded",
            undefined,
            { input: input.text, search },
          );
          remember();
        } catch {
          persisted = false;
          throw new UsageGateError("UNAVAILABLE");
        }
      },
    });
    selection = {
      title: result.title,
      atmosphere: result.atmosphere,
      works: result.selections.map((s) => ({
        id: s.id,
        role: s.role,
        reason: s.reason,
        title: s.artwork!.title,
        titleJa: s.artwork!.titleJa,
        artist: s.artwork!.artist,
      })),
    };
    await finish("succeeded");
    result.verification.accounting = accountingResult();
    return Response.json(result, { headers });
  } catch (error) {
    const failure =
      error instanceof SelectionFailure ? error.diagnostic : undefined;
    if (record?.status === "pending" && failure)
      record = { ...record, failure };
    await finish("failed");
    const blocked =
      gateError || (error instanceof UsageGateError ? error : undefined);
    if (blocked) {
      const message =
        blocked.code === "DUPLICATE"
          ? "同じ展示の連続送信を防止しました。同じ文章での再選定は1分ほど待ってください。"
          : blocked.code === "LIMIT"
            ? inspectionAvailable()
              ? "試験用のAPI呼び出し上限に達しました。使用量画面で確認してください。"
              : "試験用の利用上限に達しました。招待した人に連絡してください。"
            : "使用量の保存先に接続できないため、API呼び出しを停止しました。接続設定を確認してください。";
      return Response.json(
        {
          error: message,
          code: blocked.code,
          ...(record ? { accounting: accountingResult() } : {}),
        },
        {
          status:
            blocked.code === "DUPLICATE"
              ? 409
              : blocked.code === "LIMIT"
                ? 429
                : 503,
          headers,
        },
      );
    }
    // Log only an allowlisted classification and numeric timing/status.
    if (record && failure)
      console.warn("museum_selection_failed", {
        requestId: record.id,
        ...failure,
      });
    // Never log request text, SDK errors or provider response bodies.
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : null;
    const message = failure
      ? failureMessage(failure)
      : status === 401 || status === 403
        ? "MiMoの認証に失敗しました。接続設定の確認が必要です。"
        : status === 429
          ? "MiMoの利用制限に達しました。残高・利用枠を確認し、時間をおいてお試しください。"
          : "AIの選定を完了できませんでした。時間をおいて、もう一度お試しください。";
    return Response.json(
      {
        error: message,
        code: "AI_FAILED",
        ...(record ? { accounting: accountingResult() } : {}),
      },
      { status: 502, headers },
    );
  } finally {
    inFlight--;
  }
}
