import { getCatalog } from "@/lib/catalog/server";
import { aiConfigured } from "@/lib/ai/select";
import { usageConfigured } from "@/lib/usage/ledger";
import { inspectionAvailable } from "@/lib/access";
export const dynamic = "force-dynamic";
export async function GET() {
  const catalog = await getCatalog();
  return Response.json(
    {
      aiAvailable: aiConfigured(),
      usageAvailable: usageConfigured(),
      inspectionAvailable: inspectionAvailable(),
      catalogCount: catalog.artworks.length,
      catalogCommit: catalog.commit,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
