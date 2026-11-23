import { test, expect } from "@playwright/test";
import { setup, ids } from "./fixtures";

test("a transient image failure recovers all eight works without reselecting", async ({
  page,
}) => {
  await setup(page);
  let selections = 0;
  let failures = 0;
  let retries = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) selections++;
  });
  await page.route("**/api/artwork/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("imageRetry")) {
      failures++;
      return route.abort();
    }
    retries++;
    await route.fallback();
  });
  await page.goto("/");
  await page.addStyleTag({
    content: "nextjs-portal {display:none !important}",
  });
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かに見たい");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(
    page.locator('[aria-label="中央から見回す八角形の展示室、展示作品8点"]'),
  ).toBeVisible({ timeout: 30000 });
  expect(failures).toBe(ids.length);
  expect(retries).toBe(ids.length);
  expect(selections).toBe(1);
  await expect(
    page.getByText(
      "一部の画像を読み込めなかったため、読み込めた作品だけで展示しました。",
    ),
  ).toHaveCount(0);
});

test("persistent failure stops after one browser retry and reports partial display", async ({
  page,
}) => {
  await setup(page);
  let requests = 0;
  let selections = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) selections++;
  });
  await page.route("**/api/artwork/aic-28560**", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/");
  await page.addStyleTag({
    content: "nextjs-portal {display:none !important}",
  });
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かに見たい");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(
    page.locator('[aria-label="中央から見回す八角形の展示室、展示作品7点"]'),
  ).toBeVisible({ timeout: 30000 });
  expect(requests).toBe(2);
  expect(selections).toBe(1);
  await expect(
    page.getByText(
      "一部の画像を読み込めなかったため、読み込めた作品だけで展示しました。",
    ),
  ).toBeVisible();
});
