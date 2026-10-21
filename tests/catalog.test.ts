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
  it("normalizes all 300 source records and versioned image references", () => {
    const { raw, registry } = source();
    const result = normalizeCatalog(raw, registry, catalog.commit);
    expect(result.artworks).toHaveLength(300);
    expect(new Set(result.artworks.map((a) => a.id)).size).toBe(300);
    expect(
      result.artworks.every(
        (a) =>
          a.localImage.startsWith("/api/artwork/") &&
          a.localImage.includes(catalog.commit),
      ),
    ).toBe(true);
    expect(result.images).toHaveLength(300);
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
  it("recognizes cross-museum spelling aliases without changing the source attribution", () => {
    const { raw, registry } = source();
    const aliases = [
      ["Auguste Renoir", "Pierre-Auguste Renoir"],
      ["Pierre-Auguste Renoir", "Pierre-Auguste Renoir"],
      ["Edouard Manet", "Édouard Manet"],
      ["Édouard Manet", "Édouard Manet"],
      ["Paul Cezanne", "Paul Cézanne"],
      ["Paul Cézanne", "Paul Cézanne"],
      ["Rembrandt (Rembrandt van Rijn)", "Rembrandt van Rijn"],
      ["Rembrandt van Rijn", "Rembrandt van Rijn"],
      ["Domenico Theotokópoulos, called El Greco", "El Greco"],
      ["El Greco", "El Greco"],
    ];
    aliases.forEach(([source, canonical], index) => {
      raw.artworks[index].facts.artist = source;
      Object.assign(raw.artworks[index].facts, { artist_canonical: canonical });
    });
    raw.artworks[10].facts.artist = "Unidentified artist";
    raw.artworks[11].facts.artist = "Unidentified artist";
    raw.artworks[12].facts.artist = "Workshop of Dieric Bouts";
    raw.artworks[13].facts.artist = "Dieric Bouts";
    const normalized = normalizeCatalog(raw, registry, catalog.commit);
    const pairs = aliases.map((_, index) => normalized.selection[index]);
    for (let i = 0; i < pairs.length; i += 2) {
      expect(pairs[i].artistKey).toBe(pairs[i + 1].artistKey);
      expect(pairs[i].artist).toBe(pairs[i + 1].artist);
    }
    expect(normalized.selection[10].artistKey).not.toBe(normalized.selection[11].artistKey);
    expect(normalized.selection[12].artistKey).not.toBe(normalized.selection[13].artistKey);
  });
  it("keeps School/Style attributions separate from the named painter", () => {
    const rembrandt = catalog.selection.find((x) => x.id === "met-437412");
    const hokusai = catalog.selection.find((x) => x.id === "met-57280");
    expect(rembrandt?.artist).toBe("Style of Rembrandt (Rembrandt van Rijn)");
    expect(rembrandt?.artistKey).toBe(
      "artist:Style of Rembrandt (Rembrandt van Rijn)",
    );
    expect(rembrandt?.artistKey).not.toBe("artist:Rembrandt van Rijn");
    expect(hokusai?.artist).toBe("School of Katsushika Hokusai");
    expect(hokusai?.artistKey).not.toBe("artist:Katsushika Hokusai");
  });
  it("caps each named artist at two candidates across aliases, but not unidentified works", () => {
    const make = (id: string, artist: string, artistKey: string) => ({
      ...catalog.selection[0], id, artist, artistKey,
      primary: ["喜び"], secondary: [], strengths: { 喜び: 3 }
    });
    const works = [
      make("met-900001", "Pierre-Auguste Renoir", "artist:Pierre-Auguste Renoir"),
      make("met-900002", "Pierre-Auguste Renoir", "artist:Pierre-Auguste Renoir"),
      make("met-900003", "Pierre-Auguste Renoir", "artist:Pierre-Auguste Renoir"),
      make("met-900004", "Unidentified artist", "unidentified:met-900004"),
      make("met-900005", "Unidentified artist", "unidentified:met-900005"),
      make("met-900006", "Unidentified artist", "unidentified:met-900006"),
    ];
    const chosen = selectCandidates("嬉しい", works);
    expect(chosen.filter((a) => a.artistKey === "artist:Pierre-Auguste Renoir")).toHaveLength(2);
    expect(chosen.filter((a) => a.artist === "Unidentified artist")).toHaveLength(3);
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
      .slice(0, 8)
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
    for (const count of [4, 7, 9, 12]) {
      const works = catalog.artworks.slice(0, count).map((a) => ({
        id: a.id,
        role: "共鳴" as const,
        reason: "短い説明",
      }));
      expect(
        validateSelections(
          works,
          catalog.artworks.map((a) => a.id),
        ),
      ).toBe(false);
    }
  });
});
