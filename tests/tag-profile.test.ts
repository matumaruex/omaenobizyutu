import { describe, expect, it } from "vitest";
import seed from "../src/data/catalog-seed.json";
import { availableTags, validateTagProfile } from "../src/lib/ai/tag-profile";
import { retrieveByTags } from "../src/lib/ai/tag-candidates";
import type { CatalogMaterial } from "../src/lib/types";

describe("AI tag classification and local candidate retrieval", () => {
  const registered = availableTags(seed.selection).map((t) => t.name);
  it("uses the current DB's 15 tags and accepts an unmapped feeling", () => {
    expect(registered).toHaveLength(15);
    expect(
      validateTagProfile({ tags: [], negatedTags: ["不安"] }, registered),
    ).toEqual({ tags: [], negatedTags: ["不安"] });
    const extra = { ...seed.selection[0], primary: ["新タグ"], secondary: [] };
    expect(availableTags([extra])).toEqual([
      { name: "新タグ", meaning: expect.any(String) },
    ]);
  });
  it.each([
    { tags: ["未登録"], negatedTags: [] },
    { tags: ["不安", "不安"], negatedTags: [] },
    { tags: ["不安"], negatedTags: ["不安"] },
    { tags: [], negatedTags: ["安心", "安心"] },
  ])("rejects an invented or contradictory profile: %j", (profile) => {
    expect(() => validateTagProfile(profile, registered)).toThrow();
  });
  const art = (
    id: number,
    tags: string[],
    artist = `artist-${id}`,
  ): CatalogMaterial => ({
    ...seed.selection[0],
    id: `met-${id}`,
    artistKey: artist,
    primary: tags,
    secondary: [],
  });
  it("gives a sparse tag a turn instead of ranking by tag frequency or strength", () => {
    const materials = [
      ...Array.from({ length: 30 }, (_, i) => art(i + 1, ["喜び"])),
      art(100, ["不安"]),
    ];
    const result = retrieveByTags(
      "うれしい、不安",
      { tags: ["喜び", "不安"], negatedTags: [] },
      materials,
    );
    expect(result.chosen).toHaveLength(24);
    expect(result.chosen[1].id).toBe("met-100");
    expect(new Set(result.chosen.map((a) => a.id)).size).toBe(24);
  });
  it("caps each artist and admits untagged works without favouring the first museum", () => {
    const result = retrieveByTags(
      "ことばにできない気分",
      { tags: [], negatedTags: [] },
      seed.selection,
    );
    const counts = new Map<string, number>();
    for (const a of result.chosen)
      counts.set(a.artistKey, (counts.get(a.artistKey) ?? 0) + 1);
    expect(result.chosen).toHaveLength(24);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(
      result.chosen.some((a) => !a.primary.length && !a.secondary.length),
    ).toBe(true);
    expect(new Set(result.chosen.map((a) => a.id.split("-")[0])).size).toBe(2);
    expect(result.chosen.map((a) => a.id)).toEqual(
      retrieveByTags(
        "ことばにできない気分",
        { tags: [], negatedTags: [] },
        [...seed.selection].reverse(),
      ).chosen.map((a) => a.id),
    );
  });
  it("does not fill from works indexed only by an explicitly negated feeling", () => {
    const result = retrieveByTags(
      "不安ではない",
      { tags: [], negatedTags: ["不安"] },
      [art(1, ["不安"]), art(2, []), art(3, ["不安", "好奇心"])],
    );
    expect(result.chosen.map((a) => a.id).sort()).toEqual(["met-2", "met-3"]);
    expect(result.matchingCount).toBe(0);
  });
});
