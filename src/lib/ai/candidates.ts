import { z } from "zod";
import type { CatalogMaterial } from "../types";

export const CANDIDATE_COUNT = 24;
export const candidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        id: z.string().regex(/^(aic|met)-[1-9]\d*$/),
        reason: z.string().trim().min(1).max(120),
      }),
    )
    .length(CANDIDATE_COUNT),
});

// Derived from existing DB fields for this request only. No extra DB summary,
// keyword ranking, tag requirement, or extra model call to summarize the catalog.
function excerpt(text: string, budget: number) {
  if (text.length <= budget) return text;
  const sentences = text.match(/[^。！？]+[。！？]?/gu) ?? [text];
  let result = sentences[0];
  for (const sentence of sentences.slice(1)) {
    if (result.length + sentence.length > budget) break;
    result += sentence;
  }
  // Keep complete sentences: cutting a final Japanese negation changes meaning.
  return result.length < text.length ? `${result}（後略）` : result;
}
export function compactCatalog(catalog: CatalogMaterial[]) {
  return catalog.map((a) => ({
    id: a.id,
    title: a.title,
    artist: a.artist,
    tags: [...new Set([...a.primary, ...a.secondary])],
    subject: excerpt(a.meaning.scholarly_interpretation.summary, 140),
    context: excerpt(a.meaning.creation_context, 80),
    visual: excerpt(a.meaning.visual_clues, 60),
    caution: a.meaning.uncertainty_note,
  }));
}

export function validateCandidates(
  output: unknown,
  catalog: CatalogMaterial[],
) {
  const parsed = candidateSchema.parse(output);
  const byId = new Map(catalog.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const artists = new Map<string, number>();
  return parsed.candidates.map((candidate) => {
    const art = byId.get(candidate.id);
    if (!art || seen.has(candidate.id)) throw Error("INVALID_CANDIDATE");
    seen.add(candidate.id);
    const count = (artists.get(art.artistKey) ?? 0) + 1;
    if (count > 2) throw Error("INVALID_CANDIDATE_ARTIST_COUNT");
    artists.set(art.artistKey, count);
    return { art, reason: candidate.reason };
  });
}
