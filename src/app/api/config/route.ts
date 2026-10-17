import { aiConfigured } from "@/lib/ai/select";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { aiAvailable: aiConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
