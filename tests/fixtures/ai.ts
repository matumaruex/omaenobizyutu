import seed from "../../src/data/catalog-seed.json";
// Deterministic fake model output, including an untagged work; never a selector
// used by production. HTTP contract tests still run through the real AI SDK.
const counts = new Map<string, number>();
export const candidateWorks = [...seed.selection]
  .reverse()
  .filter((art) => {
    const n = counts.get(art.artistKey) ?? 0;
    if (n >= 2) return false;
    counts.set(art.artistKey, n + 1);
    return true;
  })
  .slice(0, 24);
export const candidateOutput = () => ({
  candidates: candidateWorks.map((a) => a.id),
});
