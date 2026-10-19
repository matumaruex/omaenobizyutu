import { z } from "zod";
import { UsageLedger } from "@/lib/usage/ledger";
export const runtime = "nodejs";
const schema = z
  .object({
    displayedIds: z.array(z.string().regex(/^(aic|met)-[1-9]\d*$/)).max(12),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) throw Error();
    } catch {
      return Response.json(
        { error: "美術館の画面から操作してください。" },
        { status: 403, headers },
      );
    }
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response(null, { status: 404, headers });
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4000) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(value);
    }
    input = schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (new Set(input.displayedIds).size !== input.displayedIds.length)
      throw Error();
  } catch {
    return Response.json(
      { error: "表示結果の形式が正しくありません。" },
      { status: 400, headers },
    );
  }
  try {
    const result = await new UsageLedger().reportDisplay(
      id,
      input.displayedIds,
    );
    return new Response(null, {
      status: result === "OK" ? 204 : result === "MISSING" ? 404 : 400,
      headers,
    });
  } catch {
    return Response.json(
      { error: "表示結果を保存できませんでした。" },
      { status: 503, headers },
    );
  }
}
