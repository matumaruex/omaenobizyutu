import { z } from "zod";
import { aiConfigured, selectWithAI } from "@/lib/ai/select";
import { createDemoExhibition } from "@/lib/curation";
export const runtime = "nodejs";
export const maxDuration = 45;
const inputSchema = z.object({
  text: z.string().trim().min(1).max(800),
  mode: z.enum(["demo", "ai"]),
});
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
  if (input.mode === "demo")
    return Response.json(createDemoExhibition(input.text), { headers });
  if (!aiConfigured())
    return Response.json(
      {
        error: "AIが設定されていません。無料デモで展示を作れます。",
        code: "AI_UNAVAILABLE",
      },
      { status: 503, headers },
    );
  if (inFlight >= 3)
    return Response.json(
      {
        error:
          "ただいま選定が混み合っています。少し待つか、無料デモをお使いください。",
      },
      { status: 429, headers },
    );
  inFlight++;
  try {
    return Response.json(await selectWithAI(input.text, request.signal), {
      headers,
    });
  } catch {
    // Never log request text, SDK errors or provider response bodies.
    return Response.json(
      {
        error:
          "AIの選定を完了できませんでした。もう一度試すか、無料デモで展示を作れます。",
        code: "AI_FAILED",
      },
      { status: 502, headers },
    );
  } finally {
    inFlight--;
  }
}
