import { getCatalog } from "@/lib/catalog/server";
import { aiConfigured } from "@/lib/ai/select";
export const dynamic = "force-dynamic";
export async function GET() {
  const catalog = await getCatalog();
  return Response.json(
    {
      aiAvailable: aiConfigured(),
      catalogCount: catalog.artworks.length,
      catalogCommit: catalog.commit,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
