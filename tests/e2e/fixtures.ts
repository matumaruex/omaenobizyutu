import type { Page } from "@playwright/test";
import path from "node:path";
import seed from "../../src/data/catalog-seed.json";
const fixtureImages = ["aic-28560", "aic-27992", "aic-80607", "aic-14620"];
export const ids = [
  ...fixtureImages,
  "aic-869",
  "aic-4758",
  "aic-4796",
  "aic-8991",
];
export function exhibition(reverse = false) {
  return {
    title: "作品との接点",
    atmosphere: "気持ちを入口に、異なる作品固有の主題と背景に触れる構成。",
    selections: (reverse ? [...ids].reverse() : ids).map((id, i) => ({
      id,
      role: i === ids.length - 1 ? "余韻" : "共鳴",
      reason:
        "作品の具体的な主題と、この文章との無理のない接点を選定の手掛かりとしました。",
      artwork: {
        ...seed.artworks.find((a) => a.id === id)!,
        interpretation: seed.selection.find((a) => a.id === id)!.meaning,
      },
    })),
    verification: {
      model: "mimo-v2.6-flash",
      catalogCommit: seed.commit,
      candidateCount: 24,
      catalogCount: seed.artworks.length,
      inputTokens: 6000,
      outputTokens: 700,
      usage: {
        inputTokens: 6000,
        outputTokens: 700,
        reasoningTokens: 0,
        cachedInputTokens: 2000,
      },
    },
  };
}
export async function setup(page: Page) {
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        aiAvailable: true,
        inspectionAvailable: true,
        catalogCount: seed.artworks.length,
        catalogCommit: seed.commit,
      },
    }),
  );
  await page.route("**/api/usage", (r) =>
    r.fulfill({
      json: {
        calls: 2,
        limit: 50,
        totalNanoJpy: 147840000,
        unpricedCalls: 1,
        pendingCalls: 0,
        pricing: {
          version: "試験単価",
          inputUsdPerMillion: 0.14,
          cachedInputUsdPerMillion: 0.0028,
          outputUsdPerMillion: 0.28,
          usdJpy: 150,
          source: "https://mimo.mi.com/docs/en-US/pricing",
          checkedOn: "2026-10-20",
        },
        records: [
          {
            id: "fixture",
            model: "mimo-v2.6-flash",
            createdAt: "2026-10-19T00:00:00Z",
            status: "succeeded",
            elapsedMs: 23400,
            usage: {
              inputTokens: 6000,
              outputTokens: 700,
              reasoningTokens: 0,
              cachedInputTokens: 2000,
            },
            estimate: { nanoJpy: 114240000, cacheAssumedMiss: false },
            pricing: { version: "試験単価", usdJpy: 150 },
          },
        ],
      },
    }),
  );
  await page.route("**/api/artwork/**", async (r) => {
    const id = new URL(r.request().url()).pathname.split("/").at(-1)!;
    if (!ids.includes(id)) return r.abort();
    await r.fulfill({
      // Reuse local test images for eight unique works; never fetch real images.
      path: path.resolve(
        "tests/fixtures",
        `${fixtureImages[ids.indexOf(id) % fixtureImages.length]}.jpg`,
      ),
      contentType: "image/jpeg",
    });
  });
  await page.route("**/api/exhibition", (r) =>
    r.fulfill({
      json: exhibition(r.request().postDataJSON().text.includes("明日")),
    }),
  );
}
