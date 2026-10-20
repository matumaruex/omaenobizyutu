import { test, expect } from "@playwright/test";
import { setup } from "./fixtures";
test("guests can view the exhibition and its explanation, with no shared trial tools", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl2") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await setup(page);
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        aiAvailable: true,
        usageAvailable: true,
        inspectionAvailable: false,
      },
    }),
  );
  let calls = 0,
    privateReads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) calls++;
    if (/\/api\/(usage|history)(\?|$)/.test(r.url())) privateReads++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "表示設定" }).click();
  await expect(page.getByLabel("選定結果を確認する")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /履歴|API使用量/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("運営側へ記録されます");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("穏やかな気持ち");
  await page.getByRole("button", { name: "展示する", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(
    page.getByRole("button", { name: /履歴|API使用量|選定結果を確認/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "作品一覧", exact: true }).click();
  await page.locator(".artwork-grid button").first().click();
  await page.getByRole("button", { name: "解説を開く", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "制作背景", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(privateReads).toBe(0);
});
