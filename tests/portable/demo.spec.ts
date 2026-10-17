import { test, expect } from "@playwright/test";
test("downloaded HTML opens offline and creates an exhibition", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && request.resourceType() !== "document")
      external.push(request.url());
  });
  await page.goto("http://127.0.0.1:3001/yohaku-demo.html");
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.locator('[aria-label="白い3D展示室、展示作品0点"]'),
  ).toBeVisible();
  await page.getByLabel("今の気持ちを教えてください").fill("明日が楽しみ");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(page.getByRole("button", { name: /作品一覧/ })).toBeVisible();
  await page.getByRole("button", { name: /作品一覧/ }).click();
  const image = page.locator(".artwork-grid img").first();
  expect(
    await image.evaluate(
      (image: HTMLImageElement) => image.complete && image.naturalWidth > 500,
    ),
  ).toBeTruthy();
  await page.locator(".artwork-grid button").first().click();
  await expect(
    page.getByRole("dialog", { name: "作品を鑑賞する" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("link", { name: "余白の美術館 トップ" }).click();
  await expect(page.getByRole("button", { name: "部屋に入る" })).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
