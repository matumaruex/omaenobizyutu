import { readFileSync, writeFileSync } from "node:fs";
import catalog from "./catalog.json";

const reports = process.argv
  .slice(2)
  .map((p) => JSON.parse(readFileSync(p, "utf8")));
const rows = reports.flatMap((r) => r.results) as any[];
const median = (xs: number[]) => {
  const ordered = xs.toSorted((a, b) => a - b);
  return ordered.length
    ? (ordered[Math.floor((ordered.length - 1) / 2)] +
        ordered[Math.floor(ordered.length / 2)]) /
        2
    : null;
};
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const groups = Object.fromEntries(
  ["baseline", "balanced"].map((variant) => {
    const subset = rows.filter((r) => r.variant === variant);
    const records = subset.flatMap((r) => r.accounting);
    return [
      variant,
      {
        exhibitions: subset.length,
        successes: subset.filter((r) => r.status === "succeeded").length,
        calls: subset.reduce((sum, r) => sum + r.actualCalls, 0),
        knownJpy: subset.reduce((sum, r) => sum + r.knownNanoJpy, 0) / 1e9,
        coldCacheJpy:
          subset.reduce((sum, r) => sum + r.coldCacheNanoJpy, 0) / 1e9,
        unknown: subset.reduce((sum, r) => sum + r.unpricedCalls, 0),
        medianSeconds: median(subset.map((r) => r.elapsedMs / 1000)),
        meanSeconds: mean(subset.map((r) => r.elapsedMs / 1000)),
        rangeSeconds: subset.length
          ? [
              Math.min(...subset.map((r) => r.elapsedMs / 1000)),
              Math.max(...subset.map((r) => r.elapsedMs / 1000)),
            ]
          : [],
        meanInputTokensPerCall: mean(
          records
            .filter((r) => r.usage.inputTokens !== null)
            .map((r) => r.usage.inputTokens),
        ),
        meanOutputTokensPerCall: mean(
          records
            .filter((r) => r.usage.outputTokens !== null)
            .map((r) => r.usage.outputTokens),
        ),
      },
    ];
  }),
);
const diversity = Object.fromEntries(
  [...new Set(rows.map((r) => r.scenario))].map((scenario) => [
    scenario,
    Object.fromEntries(
      ["baseline", "balanced"].map((variant) => {
        const subset = rows
          .filter(
            (r) =>
              r.scenario === scenario && r.variant === variant && r.selection,
          )
          .sort((a, b) => a.iteration - b.iteration);
        const overlaps = subset
          .slice(1)
          .map(
            (r, i) =>
              r.selection.works.filter((w: any) =>
                subset[i].selection.works.some((p: any) => p.id === w.id),
              ).length,
          );
        return [
          variant,
          {
            n: subset.length,
            tags: subset.map((r) => r.search.detectedCategories),
            candidateUnique: new Set(
              subset.flatMap((r) => r.search.candidates.map((a: any) => a.id)),
            ).size,
            selectedUnique: new Set(
              subset.flatMap((r) => r.selection.works.map((a: any) => a.id)),
            ).size,
            overlaps,
            meanOverlap: mean(overlaps),
          },
        ];
      }),
    ),
  ]),
);
const review = rows.map((r) => ({
  key: r.key,
  input: r.text,
  status: r.status,
  tags: r.search?.detectedCategories,
  negated: r.search?.excludedCategories,
  seconds: r.elapsedMs / 1000,
  jpy: r.knownNanoJpy / 1e9,
  title: r.selection?.title,
  atmosphere: r.selection?.atmosphere,
  works: r.selection?.works.map((w: any) => {
    const a = catalog.selection.find((a) => a.id === w.id)!;
    return {
      ...w,
      tags: [...a.primary, ...a.secondary],
      cautions: a.cautions,
      fitting: a.fitting,
      meaning: a.meaning,
    };
  }),
}));
const summary = {
  groups,
  diversity,
  totalActualCalls: rows.reduce((sum, r) => sum + r.actualCalls, 0),
  totalKnownJpy: rows.reduce((sum, r) => sum + r.knownNanoJpy, 0) / 1e9,
};
writeFileSync(
  "artifacts/museum-balance-summary.json",
  JSON.stringify(summary, null, 2),
);
writeFileSync(
  "artifacts/museum-balance-review.json",
  JSON.stringify(review, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
