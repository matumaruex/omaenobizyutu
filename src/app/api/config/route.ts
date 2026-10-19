import { getCatalog } from "@/lib/catalog/server";
import { aiConfigured } from "@/lib/ai/select";
import { usageConfigured } from "@/lib/usage/ledger";
export const dynamic = "force-dynamic";
export async function GET() {
  const catalog = await getCatalog();
  return Response.json(
    {
      aiAvailable: aiConfigured(),
      usageAvailable: usageConfigured(),
      catalogCount: catalog.artworks.length,
      catalogCommit: catalog.commit,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
