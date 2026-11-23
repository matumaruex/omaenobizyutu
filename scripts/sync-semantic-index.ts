// Run manually against the synced catalog. Regular builds never generate embeddings.
import { readFileSync } from "node:fs";
import type { Catalog } from "../src/lib/types";
import {
  documentField,
  documentText,
  vectorKey,
} from "../src/lib/ai/semantic-search";

async function sync() {
  const catalog: Catalog = JSON.parse(
    readFileSync("src/data/catalog-seed.json", "utf8"),
  );
  const write = process.argv.includes("--apply");
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token || (write && !process.env.VOYAGE_API_KEY))
    throw Error("Missing server credentials");
  async function redis(command: string[]) {
    const r = await fetch(url!, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!r.ok) throw Error("Redis HTTP " + r.status);
    const body = await r.json();
    if (body.error) throw Error("Redis command failed");
    return body.result;
  }
  const titles = new Map(catalog.artworks.map((a) => [a.id, a.titleJa]));
  let missing = 0;
  for (let i = 0; i < catalog.selection.length; i += 32) {
    const batch = catalog.selection.slice(i, i + 32).map((a) => {
      const text = documentText(a, titles.get(a.id) ?? "");
      return { text, field: documentField(a.id, text) };
    });
    const existing = await redis([
      "HMGET",
      vectorKey,
      ...batch.map((b) => b.field),
    ]);
    if (!Array.isArray(existing) || existing.length !== batch.length)
      throw Error("Invalid index response");
    const needed = batch.filter((_, j) => existing[j] === null);
    missing += needed.length;
    if (!write || !needed.length) continue;
    const r = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: "Bearer " + process.env.VOYAGE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: needed.map((w) => w.text),
        model: "voyage-4-lite",
        input_type: "document",
        output_dimension: 512,
      }),
    });
    if (!r.ok)
      throw Error("Voyage HTTP " + r.status + "; completed batches are saved");
    const data = (await r.json()).data;
    if (!Array.isArray(data) || data.length !== needed.length)
      throw Error("Invalid embeddings");
    const fields: string[] = [];
    data
      .sort((a, b) => a.index - b.index)
      .forEach(({ index, embedding }, n) => {
        if (
          index !== n ||
          !Array.isArray(embedding) ||
          embedding.length !== 512 ||
          !embedding.every(Number.isFinite) ||
          !embedding.some((x) => x !== 0)
        )
          throw Error("Invalid embedding");
        const bytes = Buffer.alloc(2048);
        embedding.forEach((v, j) => bytes.writeFloatLE(v, j * 4));
        fields.push(needed[n].field, bytes.toString("base64"));
      });
    await redis(["HSET", vectorKey, ...fields]);
  }
  console.log(
    `${catalog.commit}: ${catalog.selection.length} works; ${missing} ${write ? "indexed" : "need indexing"}`,
  );
}
sync().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
