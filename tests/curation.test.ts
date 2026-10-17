import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { collection } from "../src/lib/collection";
import provenance from "../src/data/provenance.json";
import {
  createDemoExhibition,
  demoProfile,
  validateSelections,
} from "../src/lib/curation";
describe("real artwork catalog and constrained selection", () => {
  it("has unique actual IDs, PD evidence and byte-matched full artwork images", () => {
    expect(collection.length).toBeGreaterThanOrEqual(12);
    expect(new Set(collection.map((a) => a.id)).size).toBe(collection.length);
    for (const a of collection) {
      expect(a.publicDomain).toBe(true);
      expect(a.title).toBeTruthy();
      expect(a.artist).toBeTruthy();
      expect(a.imageId).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.source).toBe(`https://www.artic.edu/artworks/${a.id}`);
      const source = provenance.find((p) => p.id === a.id)!;
      expect(source.license).toBe("Public domain");
      expect(source.copyrighted).toBe("False");
      expect(
        createHash("sha256")
          .update(readFileSync(`public${a.localImage}`))
          .digest("hex"),
      ).toBe(source.sha256);
    }
  });
  const texts = [
    "恋人と別れて寂しい",
    "明日が楽しみで嬉しい",
    "昔のことを思い出して懐かしい",
    "何もかもうまくいかなくて不安",
    "ほっと落ち着いた穏やかな気持ち",
    "喜びと不安が混ざっている",
  ];
  for (const text of texts)
    it(`valid and varied curation for ${text}`, () => {
      const result = createDemoExhibition(text);
      expect(result.mode).toBe("demo");
      expect(
        validateSelections(
          result.selections,
          collection.map((a) => a.id),
        ),
      ).toBe(true);
      expect(result.selections.at(-1)?.role).toBe("余韻");
      expect(new Set(result.selections.map((s) => s.role)).size).toBe(4);
    });
  it("changes selection for loss, anticipation and nostalgia", () => {
    const results = texts.slice(0, 3).map((t) => createDemoExhibition(t));
    expect(
      new Set(results.map((r) => r.selections.map((s) => s.id).join(","))).size,
    ).toBe(3);
  });
  it("uses relevance, not text length, for exhibition count", () => {
    expect(createDemoExhibition("寂しい").selections).toEqual(
      createDemoExhibition("寂しい" + "。".repeat(300)).selections,
    );
    expect(
      new Set(texts.map((t) => createDemoExhibition(t).selections.length)).size,
    ).toBeGreaterThan(1);
  });
  it("treats explicit negation conservatively in the demo", () => {
    expect(demoProfile("悲しくない").loss).toBeLessThan(
      demoProfile("悲しい").loss,
    );
  });
  it("rejects duplicate and hallucinated IDs", () => {
    const valid = createDemoExhibition("静か").selections;
    expect(
      validateSelections(
        [...valid.slice(1), valid[1]],
        collection.map((a) => a.id),
      ),
    ).toBe(false);
    expect(
      validateSelections(
        [{ ...valid[0], id: -1 }, ...valid.slice(1)],
        collection.map((a) => a.id),
      ),
    ).toBe(false);
  });
});
