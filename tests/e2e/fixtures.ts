import type { Page } from "@playwright/test";
import path from "node:path";
import seed from "../../src/data/catalog-seed.json";
export const ids = ["aic-28560", "aic-27992", "aic-80607", "aic-14620"];
export function exhibition(reverse = false) {
  return {
    title: "作品との接点",
    atmosphere: "気持ちを入口に、異なる作品固有の主題と背景に触れる構成。",
    selections: (reverse ? [...ids].reverse() : ids).map((id, i) => ({
      id,
      role: i === 3 ? "余韻" : "共鳴",
      reason:
        "作品の具体的な主題と、この文章との無理のない接点を選定の手掛かりとしました。",
      artwork: seed.artworks.find((a) => a.id === id)!,
    })),
    verification: {
      model: "mimo-v2.6-flash",
      catalogCommit: seed.commit,
      candidateCount: 24,
      catalogCount: 200,
      inputTokens: 6000,
      outputTokens: 700,
    },
  };
}
export async function setup(page: Page) {
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        aiAvailable: true,
        catalogCount: 200,
        catalogCommit: seed.commit,
      },
    }),
  );
  await page.route("**/api/artwork/**", async (r) => {
    const id = new URL(r.request().url()).pathname.split("/").at(-1)!;
    if (!ids.includes(id)) return r.abort();
    await r.fulfill({
      path: path.resolve("tests/fixtures", `${id}.jpg`),
      contentType: "image/jpeg",
    });
  });
  await page.route("**/api/exhibition", (r) =>
    r.fulfill({
      json: exhibition(r.request().postDataJSON().text.includes("明日")),
    }),
  );
}
