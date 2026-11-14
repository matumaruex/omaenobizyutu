import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SearchTraceView from "../src/components/SearchTraceView";
import type { SearchTrace } from "../src/lib/history/types";

it("explains old and new saved exhibitions using the version recorded at selection", () => {
  const trace: SearchTrace = {
    method: "ai-tags-v2",
    catalogCommit: "fixture",
    catalogCount: 100,
    taggedCount: 100,
    matchingCount: 30,
    detectedCategories: ["安心"],
    candidates: [],
    sampling: {
      version: "weighted-exposure-v1",
      seed: "fixture",
      recentExhibitions: [],
    },
  };
  const old = renderToStaticMarkup(
    createElement(SearchTraceView, { search: trace, selectedIds: [] }),
  );
  const updated = renderToStaticMarkup(
    createElement(SearchTraceView, {
      search: {
        ...trace,
        sampling: { ...trace.sampling!, version: "weighted-exposure-v2" },
      },
      selectedIds: [],
    }),
  );
  expect(old).toContain("直近5展示で出た作品");
  expect(old).not.toContain("6〜20展示前");
  expect(old).not.toContain("最終MiMoには鑑賞履歴");
  expect(updated).toContain("6〜20展示前は弱め");
  expect(updated).toContain("最終MiMoには鑑賞履歴");
});
