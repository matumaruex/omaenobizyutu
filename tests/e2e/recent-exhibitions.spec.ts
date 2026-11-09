import { test, expect } from "@playwright/test";
import { setup, exhibition, ids } from "./fixtures";
import { RECENT_EXHIBITIONS_KEY } from "../../src/lib/recent-exhibitions";

test("guest keeps only displayed IDs across reloads and sends them only when creating another exhibition", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setup(page);
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { aiAvailable: true, inspectionAvailable: false } }),
  );
  const requests: { text: string; recentExhibitions: string[][] }[] = [];
  const requestIds: string[] = [];
  const sharedHistoryReads: string[] = [];
  page.on("request", (req) => {
    if (/\/api\/(history|usage)(\?|$)/.test(req.url()))
      sharedHistoryReads.push(req.url());
  });
  await page.route("**/api/exhibition", (route) => {
    requests.push(route.request().postDataJSON());
    requestIds.push(route.request().headers()["idempotency-key"]);
    return route.fulfill({ json: exhibition() });
  });
  for (const text of ["静かな気持ち", "明日はどんな日だろう"]) {
    await page.goto("/");
    await page.getByRole("button", { name: "部屋に入る" }).click();
    await page.getByRole("button", { name: "気持ちを教える" }).click();
    await expect(
      page.getByRole("button", { name: "選定・料金の履歴（試験用）" }),
    ).toHaveCount(0);
    await page.getByLabel("今の気持ちを教えてください").fill(text);
    await page.getByRole("button", { name: "展示する" }).click();
    await expect(
      page.locator('[aria-label="中央から見回す八角形の展示室、展示作品8点"]'),
    ).toBeVisible();
  }
  expect(requests.map((r) => r.recentExhibitions)).toEqual([[], [ids]]);
  expect(new Set(requestIds).size).toBe(2);
  expect(sharedHistoryReads).toEqual([]);
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    RECENT_EXHIBITIONS_KEY,
  );
  expect(JSON.parse(stored!)).toEqual([ids, ids]);
  expect(stored).not.toContain("静かな");
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByRole("button", { name: "作品一覧", exact: true }).click();
  await page.locator(".artwork-grid button").first().click();
  await page.getByRole("button", { name: "解説を開く" }).click();
  expect(requests).toHaveLength(2);
});

test("failed images and cancelled selection never become a recent exhibition", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/artwork/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かな気持ち");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText(
    "作品画像を十分に読み込めませんでした",
  );
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      RECENT_EXHIBITIONS_KEY,
    ),
  ).toBeNull();
  await page.route("**/api/exhibition", () => {});
  await page.getByRole("button", { name: "展示する" }).click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      RECENT_EXHIBITIONS_KEY,
    ),
  ).toBeNull();
});
