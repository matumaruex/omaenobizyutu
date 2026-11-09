import { describe, expect, it } from "vitest";
import seed from "../src/data/catalog-seed.json";
import { exposureWeight, retrieveByTags } from "../src/lib/ai/tag-candidates";

const profile = { tags: ["悲しみ"], negatedTags: [] };
const pick = (requestSeed: string, recentExhibitions: string[][] = []) =>
  retrieveByTags("悲しい", profile, seed.selection, {
    seed: requestSeed,
    recentExhibitions,
  }).chosen;

describe("candidate rotation without additional model calls", () => {
  it("replays the same request and is independent of catalog order", () => {
    const sampling = { seed: "request-1", recentExhibitions: [] };
    expect(pick(sampling.seed)).toEqual(
      retrieveByTags("悲しい", profile, [...seed.selection].reverse(), sampling)
        .chosen,
    );
    expect(pick(sampling.seed)).toEqual(pick(sampling.seed));
    expect(pick("request-2")).not.toEqual(pick(sampling.seed));
  });
  it("gives every eligible sadness work a chance across generations", () => {
    const covered = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const works = pick(`request-${i}`);
      expect(works).toHaveLength(24);
      expect(new Set(works.map((a) => a.id)).size).toBe(24);
      for (const art of works) {
        expect([...art.primary, ...art.secondary]).toContain("悲しみ");
        expect(
          works.filter((a) => a.artistKey === art.artistKey).length,
        ).toBeLessThanOrEqual(2);
        covered.add(art.id);
      }
    }
    expect(covered.size).toBe(
      seed.selection.filter((a) =>
        [...a.primary, ...a.secondary].includes("悲しみ"),
      ).length,
    );
  });
  it("reduces recent exposure statistically without permanent exclusion", () => {
    const recent = pick("previous")
      .slice(0, 8)
      .map((a) => a.id);
    const counts = [0, 0];
    const reappeared = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const [mode, history] of [[], [recent]].entries()) {
        for (const a of pick(`trial-${i}`, history)) {
          if (recent.includes(a.id)) {
            counts[mode]++;
            if (mode) reappeared.add(a.id);
          }
        }
      }
    }
    expect(counts[1]).toBeLessThan(counts[0] * 0.8);
    expect(reappeared.size).toBe(8);
    expect(
      exposureWeight(
        "a",
        Array.from({ length: 100 }, () => ["a"]),
      ),
    ).toBeGreaterThanOrEqual(0.2);
    expect(exposureWeight("a", [[], [], [], [], [], ["a"]])).toBe(1);
  });
  it("ignores numeric strengths and preserves negation and sparse-tag coverage", () => {
    const altered = seed.selection.map((a) => ({
      ...a,
      strengths: {},
      fitting: a.fitting.map((f) => ({ ...f, strength: 999 })),
    }));
    const options = { seed: "same", recentExhibitions: [] };
    expect(
      retrieveByTags("悲しい", profile, altered, options).chosen.map(
        (a) => a.id,
      ),
    ).toEqual(pick("same").map((a) => a.id));
    const works = retrieveByTags(
      "不安ではない",
      { tags: [], negatedTags: ["不安"] },
      seed.selection,
      options,
    ).chosen;
    expect(
      works.every(
        (a) =>
          ![...a.primary, ...a.secondary].length ||
          [...a.primary, ...a.secondary].some((t) => t !== "不安"),
      ),
    ).toBe(true);
    const sparse = retrieveByTags(
      "悲しくて怒っている",
      { tags: ["悲しみ", "怒り"], negatedTags: [] },
      seed.selection,
      options,
    ).chosen;
    expect(
      sparse.some((a) => [...a.primary, ...a.secondary].includes("怒り")),
    ).toBe(true);
  });
});
