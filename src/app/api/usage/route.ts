import { UsageLedger } from "@/lib/usage/ledger";
import { inspectionAvailable } from "@/lib/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!inspectionAvailable())
    return Response.json(
      { error: "この入口からは履歴を表示できません。" },
      { status: 403, headers },
    );
  try {
    return Response.json(await new UsageLedger().report(), { headers });
  } catch {
    return Response.json(
      { error: "使用量の保存先に接続できません。接続設定を確認してください。" },
      { status: 503, headers },
    );
  }
}
