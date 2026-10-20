import { UsageLedger } from "@/lib/usage/ledger";
import { inspectionAvailable } from "@/lib/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!inspectionAvailable())
    return Response.json(
      { error: "この入口からは履歴を表示できません。" },
      { status: 403, headers },
    );
  const params = new URL(request.url).searchParams;
  const offset = Number(params.get("offset") || 0),
    limit = Number(params.get("limit") || 20);
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    return Response.json(
      { error: "履歴の表示範囲が正しくありません。" },
      { status: 400, headers },
    );
  try {
    return Response.json(await new UsageLedger().history(offset, limit), {
      headers,
    });
  } catch {
    return Response.json(
      { error: "履歴を読み込めませんでした。時間をおいてお試しください。" },
      { status: 503, headers },
    );
  }
}
