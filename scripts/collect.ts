/** Explicit CLI only; never run from a page request. No AI, no paid calls. */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
const rawArtwork = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  artist_title: z.string().min(1),
  date_display: z.string(),
  image_id: z.string().regex(/^[0-9a-f-]{36}$/i),
  is_public_domain: z.literal(true),
  artwork_type_title: z.literal("Painting"),
  thumbnail: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  medium_display: z.string(),
  credit_line: z.string(),
});
const fields =
  "id,title,artist_title,date_display,image_id,is_public_domain,artwork_type_title,thumbnail,medium_display,credit_line";
const target = path.resolve("src/data/harvest.json");
const rawCount = Number(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 100,
);
if (!Number.isInteger(rawCount) || rawCount < 1 || rawCount > 300)
  throw new Error("--limit=1〜300を指定してください");
const limit = rawCount;
const result: unknown[] = [];
const seen = new Set<number>();
const pageSize = Math.min(50, limit);
await mkdir("public/artworks/harvest", { recursive: true });
await mkdir("src/data", { recursive: true });
async function fetchJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`公式API応答: ${response.status}`);
  return response.json();
}
// Sequential pages, then one image at a time. Existing images are never re-downloaded.
for (let page = 1; result.length < limit && page <= 30; page++) {
  const payload = await fetchJSON(
    "https://api.artic.edu/api/v1/artworks/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          bool: {
            filter: [
              { term: { is_public_domain: true } },
              { term: { artwork_type_title: "Painting" } },
              { exists: { field: "image_id" } },
            ],
          },
        },
        fields: fields.split(","),
        limit: pageSize,
        page,
      }),
    },
  );
  if (payload.config?.iiif_url !== "https://www.artic.edu/iiif/2")
    throw new Error("未確認のIIIF配信元です");
  if (!payload.data?.length) break;
  for (const row of payload.data) {
    const parsed = rawArtwork.safeParse(row);
    if (!parsed.success) continue;
    const art = parsed.data;
    if (seen.has(art.id)) continue;
    seen.add(art.id);
    const localImage = `/artworks/harvest/${art.id}-${art.image_id}.jpg`;
    const imagePath = `public${localImage}`;
    try {
      await readFile(imagePath);
    } catch {
      const image = await fetch(
        `https://www.artic.edu/iiif/2/${encodeURIComponent(art.image_id)}/full/1000,/0/default.jpg`,
        { signal: AbortSignal.timeout(25000) },
      );
      if (!image.ok || !image.headers.get("content-type")?.startsWith("image/"))
        throw new Error(`作品${art.id}の画像を取得できません`);
      const bytes = Buffer.from(await image.arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
        throw new Error("JPEG形式を検証できません");
      await writeFile(imagePath + ".tmp", bytes);
      await rename(imagePath + ".tmp", imagePath);
    }
    result.push({
      ...art,
      localImage,
      imageSource: `https://www.artic.edu/iiif/2/${encodeURIComponent(art.image_id)}/full/1000,/0/default.jpg`,
      imageLicense: "https://www.artic.edu/open-access",
      source: `https://www.artic.edu/artworks/${art.id}`,
      verifiedAt: new Date().toISOString().slice(0, 10),
      metadataSource: "https://api.artic.edu/api/v1/artworks/search",
    });
    console.log(`取得済み ${result.length}/${limit} · ID ${art.id}`);
    if (result.length >= limit) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
}
if (result.length) {
  await writeFile(target + ".tmp", JSON.stringify(result, null, 2) + "\n");
  await rename(target + ".tmp", target);
}
console.log(
  `${result.length}作品をharvest.jsonに保存。感情・主題の編集と画像確認後、collection.jsonへ反映してください。既存コレクションは自動で上書きしません。`,
);
