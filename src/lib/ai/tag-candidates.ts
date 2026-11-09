import { createHash } from "node:crypto";
import type { CatalogMaterial } from "../types";
import type { TagProfile } from "./tag-profile";
import { CANDIDATE_COUNT } from "./candidates";

export interface CandidateSampling {
  seed: string;
  // Newest first. Only completed exhibitions from the same browser belong here.
  recentExhibitions: readonly (readonly string[])[];
}

export function exposureWeight(
  id: string,
  recent: CandidateSampling["recentExhibitions"],
) {
  const factors = [0.45, 0.65, 0.8, 0.9, 0.95];
  return Math.max(
    0.2,
    recent
      .slice(0, 5)
      .reduce(
        (weight, ids, index) =>
          weight * (ids.slice(0, 8).includes(id) ? factors[index] : 1),
        1,
      ),
  );
}

// Classification is performed by MiMo. This function never parses feeling words.
// Equal turns across the chosen tags prevent a frequent tag dominating the pool.
export function retrieveByTags(
  text: string,
  profile: TagProfile,
  catalog: CatalogMaterial[],
  sampling?: CandidateSampling,
) {
  const order = new Map(
    catalog.map((a) => [
      a.id,
      createHash("sha256")
        .update(sampling ? `${text}\0${sampling.seed}` : text)
        .update("\0")
        .update(a.id)
        .digest("hex"),
    ]),
  );
  // Exponential-race weighted sampling without replacement. Scores/strengths do
  // not rank the pool. Every eligible work retains a positive chance; weights
  // only reduce recent exposure. A request seed makes replay reproducible.
  const priority = new Map(
    catalog.map((a) => {
      const uniform =
        (parseInt(order.get(a.id)!.slice(0, 13), 16) + 1) / (2 ** 52 + 1);
      return [
        a.id,
        -Math.log(uniform) /
          exposureWeight(a.id, sampling?.recentExhibitions ?? []),
      ];
    }),
  );
  const sorted = [...catalog].sort((a, b) =>
    sampling
      ? priority.get(a.id)! - priority.get(b.id)! || a.id.localeCompare(b.id)
      : order.get(a.id)!.localeCompare(order.get(b.id)!),
  );
  const tagsOf = (art: CatalogMaterial) => [
    ...new Set([...art.primary, ...art.secondary]),
  ];
  const matched = (art: CatalogMaterial) =>
    profile.tags.filter((tag) => tagsOf(art).includes(tag));
  const pools = profile.tags.map((tag) =>
    sorted.filter((a) => tagsOf(a).includes(tag)),
  );
  const chosen: CatalogMaterial[] = [];
  const seen = new Set<string>();
  const artists = new Map<string, number>();
  const add = (art: CatalogMaterial) => {
    if (
      seen.has(art.id) ||
      (artists.get(art.artistKey) ?? 0) >= 2 ||
      chosen.length >= CANDIDATE_COUNT
    )
      return false;
    chosen.push(art);
    seen.add(art.id);
    artists.set(art.artistKey, (artists.get(art.artistKey) ?? 0) + 1);
    return true;
  };
  for (;;) {
    let progress = false;
    for (const pool of pools) {
      while (pool.length) {
        if (add(pool.shift()!)) {
          progress = true;
          break;
        }
      }
    }
    if (!progress || chosen.length >= CANDIDATE_COUNT) break;
  }
  // Unknown/empty profiles use a mixed catalog order, never the old AIC ID order.
  // Do not fill solely from the explicitly negated tags; untagged works can enter.
  for (const art of sorted) {
    const tags = tagsOf(art);
    if (!tags.length || tags.some((tag) => !profile.negatedTags.includes(tag)))
      add(art);
    if (chosen.length >= CANDIDATE_COUNT) break;
  }
  return {
    chosen,
    taggedCount: catalog.filter((a) => tagsOf(a).length).length,
    matchingCount: catalog.filter((a) => matched(a).length).length,
    candidates: chosen.map((a) => ({
      id: a.id,
      title: a.title,
      artist: a.artist,
      primary: a.primary,
      secondary: a.secondary,
      matchedTags: matched(a),
      score: matched(a).length,
    })),
  };
}
