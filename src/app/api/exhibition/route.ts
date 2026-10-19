import { z } from "zod";
import { aiConfigured, selectWithAI } from "@/lib/ai/select";
export const runtime = "nodejs";
export const maxDuration = 45;
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
  inFlight++;
  try {
    return Response.json(await selectWithAI(input.text, request.signal), {
      headers,
    });
  } catch (error) {
    // Never log request text, SDK errors or provider response bodies.
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : null;
    const message =
      status === 401 || status === 403
        ? "MiMoの認証に失敗しました。接続設定の確認が必要です。"
        : status === 429
          ? "MiMoの利用制限に達しました。残高・利用枠を確認し、時間をおいてお試しください。"
          : "AIの選定を完了できませんでした。時間をおいて、もう一度お試しください。";
    return Response.json(
      {
        error: message,
        code: "AI_FAILED",
      },
      { status: 502, headers },
    );
  } finally {
    inFlight--;
  }
}
