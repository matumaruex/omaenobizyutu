import { createHash } from "node:crypto";
import type { Catalog, CatalogMaterial } from "../types";
import type { SearchTrace } from "../history/types";
import { CANDIDATE_COUNT } from "./candidates";

const dimensions = 512;
const model = "voyage-4-lite";
export const vectorKey =
  "museum:artwork-vectors:v1:voyage-4-lite:document:512:f32le";

// This serialization is part of the on-disk format of the existing artwork index.
export function documentText(work: CatalogMaterial, titleJa: string) {
  return [
    titleJa,
    ...work.fitting.map((f) => f.situation + "。" + f.reason),
    work.meaning.visual_clues,
    work.meaning.scholarly_interpretation.summary,
    ...work.primary,
    ...work.secondary,
  ]
    .filter(Boolean)
    .join("。")
    .slice(0, 360);
}
export function documentField(id: string, text: string) {
  return id + ":" + createHash("sha256").update(text).digest("hex");
}

type Entry = { id: string; unit: Float32Array };
let cached: { commit: string; expires: number; entries: Entry[] } | undefined;
function normalize(values: Float32Array) {
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm === 0) return null;
  return values.map((v) => v / norm);
}
async function readIndex(catalog: Catalog, signal: AbortSignal) {
  if (cached?.commit === catalog.commit && cached.expires > Date.now())
    return cached.entries;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN ||
    process.env.KV_REST_API_READ_ONLY_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;
  if (!url || !token) return [];
  const titles = new Map(catalog.artworks.map((a) => [a.id, a.titleJa]));
  const entries: Entry[] = [];
  for (let i = 0; i < catalog.selection.length; i += 128) {
    const batch = catalog.selection.slice(i, i + 128);
    const fields = batch.map((a) =>
      documentField(a.id, documentText(a, titles.get(a.id) ?? "")),
    );
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["HMGET", vectorKey, ...fields]),
    });
    if (!res.ok) throw Error("index read failed");
    const { result } = await res.json();
    if (!Array.isArray(result) || result.length !== batch.length)
      throw Error("invalid index response");
    for (const [j, value] of result.entries()) {
      if (typeof value !== "string") continue;
      const bytes = Buffer.from(value, "base64");
      if (bytes.length !== dimensions * 4) continue;
      const unit = normalize(
        Float32Array.from({ length: dimensions }, (_, k) =>
          bytes.readFloatLE(k * 4),
        ),
      );
      if (unit) entries.push({ id: batch[j].id, unit });
    }
  }
  cached = { commit: catalog.commit, expires: Date.now() + 300_000, entries };
  return entries;
}

export async function semanticPool(
  text: string,
  catalog: Catalog,
  excluded: readonly string[],
  parent?: AbortSignal,
) {
  const trace: NonNullable<SearchTrace["semanticSearch"]> = {
    poolSize: 0,
    querySent: false,
    queryTokens: null,
  };
  const apiKey = process.env.VOYAGE_API_KEY;
  const deadline = AbortSignal.timeout(2500);
  const signal = parent ? AbortSignal.any([parent, deadline]) : deadline;
  try {
    parent?.throwIfAborted();
    if (!apiKey) return { trace };
    const index = await readIndex(catalog, signal);
    const works = new Map(catalog.selection.map((a) => [a.id, a]));
    const eligible = index.filter((e) => {
      const a = works.get(e.id)!;
      const tags = [...a.primary, ...a.secondary];
      return !tags.length || tags.some((tag) => !excluded.includes(tag));
    });
    if (eligible.length < CANDIDATE_COUNT) return { trace };
    signal.throwIfAborted();
    trace.querySent = true;
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [text],
        input_type: "query",
        output_dimension: dimensions,
      }),
    });
    if (!res.ok) return { trace };
    const body = await res.json();
    const raw = body.data?.[0]?.embedding;
    const tokens = body.usage?.total_tokens;
    if (Number.isSafeInteger(tokens) && tokens >= 0) trace.queryTokens = tokens;
    if (
      !Array.isArray(raw) ||
      raw.length !== dimensions ||
      !raw.every(Number.isFinite)
    )
      return { trace };
    const query = normalize(Float32Array.from(raw));
    if (!query) return { trace };
    const ranked = eligible.map(({ id, unit }) => ({
      id,
      score: unit.reduce((dot, v, i) => dot + v * query[i], 0),
    }));
    ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const pool = ranked.slice(0, 80).map((x) => works.get(x.id)!);
    return { pool, trace };
  } catch {
    parent?.throwIfAborted();
    return { trace };
  }
}
