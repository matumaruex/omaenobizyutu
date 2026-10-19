import { describe, it, expect } from "vitest";
import seed from "../src/data/catalog-seed.json";
import { normalizeCatalog } from "../src/lib/catalog/normalize";
import { selectCandidates } from "../src/lib/ai/candidates";
import { validateSelections } from "../src/lib/curation";
import type { Catalog } from "../src/lib/types";
const catalog: Catalog = seed;
function source() {
  const raw = {
    artworks: catalog.artworks.map((a) => ({
      id: a.id,
      source: { museum: a.museum, artwork_url: a.source },
      facts: {
        title_original: a.title,
        title_ja_provisional: a.titleJa,
        artist: a.artist,
        creation_date_display: a.date,
        type: a.medium,
        is_public_domain_at_source: true,
      },
      image: {
        display_url: catalog.images.find((i) => i.id === a.id)!.url,
        sha256: catalog.images.find((i) => i.id === a.id)!.sha256,
        live_image_checked: true,
      },
      curation: {
        emotion_categories: {
          primary: catalog.selection.find((v) => v.id === a.id)!.primary,
          secondary: catalog.selection.find((v) => v.id === a.id)!.secondary,
        },
        emotion_strengths: catalog.selection.find((v) => v.id === a.id)!
          .strengths,
        search_profile: {
          summary_for_ai: catalog.selection.find((v) => v.id === a.id)!.summary,
          fitting_situations: catalog.selection.find((v) => v.id === a.id)!
            .fitting,
          selection_cautions: catalog.selection.find((v) => v.id === a.id)!
            .cautions,
        },
        meaning_basis: catalog.selection.find((v) => v.id === a.id)!.meaning,
      },
    })),
  };
  const registry = {
    records: catalog.images.map((i) => ({
      id: i.id,
      image_source: {
        sha256: i.sha256,
        license_url: catalog.artworks.find((a) => a.id === i.id)!.imageLicense,
        license_label: "trial",
      },
    })),
  };
  return { raw, registry };
}
describe("the GitHub DB is the only artwork catalog", () => {
  it("normalizes all 200 source records and versioned image references", () => {
    const { raw, registry } = source();
    const result = normalizeCatalog(raw, registry, catalog.commit);
    expect(result.artworks).toHaveLength(200);
    expect(new Set(result.artworks.map((a) => a.id)).size).toBe(200);
    expect(
      result.artworks.every(
        (a) =>
          a.localImage.startsWith("/api/artwork/") &&
          a.localImage.includes(catalog.commit),
      ),
    ).toBe(true);
    expect(result.images).toHaveLength(200);
  });
  it("reflects additions, edits and removals from the same source", () => {
    const { raw, registry } = source();
    raw.artworks.shift();
    registry.records.shift();
    raw.artworks[0].facts.title_ja_provisional = "更新した題名";
    const extra = structuredClone(raw.artworks[0]);
    extra.id = "met-9999999";
    raw.artworks.push(extra);
    registry.records.push({ ...registry.records[0], id: extra.id });
    const result = normalizeCatalog(raw, registry, "a".repeat(40));
    expect(result.artworks[0].titleJa).toBe("更新した題名");
    expect(result.artworks.some((a) => a.id === catalog.artworks[0].id)).toBe(
      false,
    );
    expect(result.artworks.at(-1)?.id).toBe(extra.id);
  });
  for (const kind of ["duplicate", "host", "hash", "rights"] as const)
    it(`rejects an invalid ${kind} update`, () => {
      const { raw, registry } = source();
      if (kind === "duplicate") raw.artworks.push(raw.artworks[0]);
      if (kind === "host")
        raw.artworks[0].image.display_url = "https://localhost/private";
      if (kind === "hash") raw.artworks[0].image.sha256 = "0".repeat(64);
      if (kind === "rights")
        raw.artworks[0].facts.is_public_domain_at_source = false;
      expect(() => normalizeCatalog(raw, registry, catalog.commit)).toThrow();
    });
  it("retrieves at most 24 tagged candidates, including secondary-only works", () => {
    const secondary = {
      ...catalog.selection[0],
      id: "met-9999999",
      primary: [],
      secondary: ["怒り"],
      strengths: { 怒り: 1 },
    };
    const untagged = { ...secondary, id: "met-9999998", secondary: [] };
    const candidates = selectCandidates("怒りを感じる", [
      secondary,
      untagged,
      ...catalog.selection,
    ]);
    expect(candidates.length).toBeLessThanOrEqual(24);
    expect(candidates.some((a) => a.id === secondary.id)).toBe(true);
    expect(candidates.some((a) => a.id === untagged.id)).toBe(false);
  });
  it("rejects duplicates and IDs outside the submitted candidates", () => {
    const selected = catalog.artworks
      .slice(0, 4)
      .map((a) => ({ id: a.id, role: "共鳴" as const, reason: "短い説明" }));
    expect(
      validateSelections(
        selected,
        selected.map((a) => a.id),
      ),
    ).toBe(true);
    expect(
      validateSelections(
        [...selected.slice(1), selected[1]],
        catalog.artworks.map((a) => a.id),
      ),
    ).toBe(false);
    expect(validateSelections(selected, [])).toBe(false);
  });
});
