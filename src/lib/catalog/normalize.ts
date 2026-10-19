import { z } from "zod";
import type { Catalog } from "../types";
export const imageHosts = new Set([
  "images.metmuseum.org",
  "thumb.wikimedia.org",
  "upload.wikimedia.org",
  "raw.githubusercontent.com",
]);
const id = z.string().regex(/^(aic|met)-[1-9]\d*$/);
const https = z
  .string()
  .url()
  .refine((s) => new URL(s).protocol === "https:");
const imageUrl = https.refine((s) => {
  const u = new URL(s);
  return imageHosts.has(u.hostname) && !u.port && !u.username && !u.password;
});
const text = z.string().max(12000);
const rawSchema = z.object({
  artworks: z
    .array(
      z.object({
        id,
        source: z.object({ museum: text, artwork_url: https }),
        facts: z.object({
          title_original: text,
          title_ja_provisional: text,
          artist: text,
          creation_date_display: text,
          type: text,
          is_public_domain_at_source: z.literal(true),
          accession_number: text.optional(),
        }),
        image: z.object({
          display_url: imageUrl,
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          live_image_checked: z.literal(true),
        }),
        curation: z.object({
          emotion_categories: z.object({
            primary: z.array(text).max(2),
            secondary: z.array(text).max(2),
          }),
          emotion_strengths: z.record(z.string(), z.number().min(1).max(3)),
          search_profile: z.object({
            summary_for_ai: text,
            fitting_situations: z.array(
              z.object({ situation: text, reason: text, strength: z.number() }),
            ),
            selection_cautions: z.array(text),
          }),
          meaning_basis: z.object({
            author_intent: z.object({
              status: text,
              summary: text.nullable(),
              source_url: https.nullable(),
            }),
            scholarly_interpretation: z.object({
              summary: text,
              source_url: https,
            }),
            creation_context: text,
            visual_clues: text,
            uncertainty_note: text,
          }),
        }),
      }),
    )
    .min(4)
    .max(3000),
});
const registrySchema = z.object({
  records: z
    .array(
      z.object({
        id,
        image_source: z.object({
          sha256: z.string(),
          license_url: https,
          license_label: text,
          official_image_page: https.optional(),
        }),
      }),
    )
    .max(4000),
});
export function normalizeCatalog(
  raw: unknown,
  imageRegistry: unknown,
  commit: string,
): Catalog {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("INVALID_CATALOG_REVISION");
  const artworks = rawSchema.parse(raw).artworks,
    records = registrySchema.parse(imageRegistry).records;
  if (
    new Set(artworks.map((a) => a.id)).size !== artworks.length ||
    new Set(records.map((a) => a.id)).size !== records.length
  )
    throw Error("DUPLICATE_CATALOG_ID");
  const registry = new Map(records.map((r) => [r.id, r.image_source]));
  const catalog: Catalog = { commit, artworks: [], selection: [], images: [] };
  for (const a of artworks) {
    const im = registry.get(a.id);
    if (!im || im.sha256 !== a.image.sha256)
      throw Error("IMAGE_REGISTRY_MISMATCH");
    const c = a.curation,
      f = a.facts;
    const localImage = `/api/artwork/${a.id}?revision=${commit}&v=${im.sha256.slice(0, 16)}`;
    catalog.artworks.push({
      id: a.id,
      title: f.title_original,
      titleJa: f.title_ja_provisional,
      artist: f.artist,
      date: f.creation_date_display,
      width: 1,
      height: 1,
      localImage,
      source: a.source.artwork_url,
      museum: a.source.museum,
      medium: f.type,
      facts: c.meaning_basis.visual_clues,
      credit: f.accession_number || "",
      imageSource: im.official_image_page || a.source.artwork_url,
      imageLicense: im.license_url,
      licenseNote: `${im.license_label}。日本語題名は便宜訳です。`,
    });
    catalog.selection.push({
      id: a.id,
      title: f.title_original,
      artist: f.artist,
      primary: c.emotion_categories.primary,
      secondary: c.emotion_categories.secondary,
      strengths: c.emotion_strengths,
      summary: c.search_profile.summary_for_ai,
      fitting: c.search_profile.fitting_situations,
      cautions: c.search_profile.selection_cautions,
      meaning: c.meaning_basis,
    });
    catalog.images.push({
      id: a.id,
      url: a.image.display_url,
      sha256: im.sha256,
    });
  }
  return catalog;
}
