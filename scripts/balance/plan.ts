import { createHash } from "node:crypto";

export const RUN_ID = "museum-balance-20261107";
export const MAX_PAID_CALLS = 50;
export const scenarios = {
  sadness: "なんだか悲しい。理由ははっきりしないけれど、気持ちが沈んでいる。",
  mixed:
    "転職が決まってうれしい。でも新しい場所でやっていけるか心配で落ち着かない。",
  unmapped: "不安はないけれど、何もする気が起きない。",
  sparse: "約束を一方的に破られて腹が立つ。今すぐ許したい気持ちにはなれない。",
};
type Scenario = keyof typeof scenarios;
export type Variant = "baseline" | "balanced";
export function caseId(key: string, stage = "retrieval") {
  const hex = createHash("sha256")
    .update(`${RUN_ID}:${key}:${stage}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const pairs: { scenario: Scenario; iteration: number }[] = [
  { scenario: "sadness", iteration: 0 },
  { scenario: "sadness", iteration: 1 },
  { scenario: "sadness", iteration: 2 },
  { scenario: "mixed", iteration: 0 },
  { scenario: "sadness", iteration: 3 },
  { scenario: "sadness", iteration: 4 },
  { scenario: "sadness", iteration: 5 },
  { scenario: "unmapped", iteration: 0 },
  { scenario: "mixed", iteration: 1 },
  { scenario: "unmapped", iteration: 1 },
  { scenario: "sparse", iteration: 0 },
  { scenario: "sparse", iteration: 1 },
];
export const cases = pairs.flatMap(({ scenario, iteration }, pair) =>
  (pair % 2 ? ["balanced", "baseline"] : ["baseline", "balanced"]).map(
    (mode) => {
      const variant = mode as Variant;
      const key = `${scenario}-${iteration}-${variant}`;
      return {
        key,
        id: caseId(key),
        scenario,
        iteration,
        variant,
        text: scenarios[scenario],
      };
    },
  ),
);
