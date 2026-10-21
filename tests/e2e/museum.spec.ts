import { test, expect } from "@playwright/test";
import { setup, exhibition } from "./fixtures";
test("API-only room → selection → art → optional review; viewing never reselects", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await setup(page);
  const errors: string[] = [];
  let calls = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) calls++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.getByLabel("選定結果を確認する").check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await expect(page.getByRole("button")).toHaveText([
    "部屋から出る",
    "気持ちを教える",
  ]);
  await expect(page.getByRole("heading")).toHaveCount(0);
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page
    .getByLabel("今の気持ちを教えてください")
    .fill("嬉しいけれど不安もある");
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: `artifacts/${info.project.name}-api-room.png`,
  });
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByRole("button", { name: "選定結果を確認（試験用）" }).click();
  const dialog = page.getByRole("dialog", { name: "選定結果（試験用）" });
  await expect(dialog).toContainText("嬉しいけれど不安もある");
  await expect(dialog.locator("ol li")).toHaveCount(8);
  await expect(dialog).toContainText("DB 300作品");
  await expect(dialog).toContainText("aic-28560");
  await page.screenshot({
    path: `artifacts/${info.project.name}-selection-review.png`,
  });
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "作品一覧", exact: true }).click();
  await page.locator(".artwork-grid button").first().click();
  await page.getByRole("button", { name: "解説を開く" }).click();
  await expect(page.locator("#art-info")).toContainText(
    exhibition().selections[0].artwork.museum,
  );
  await page.getByRole("button", { name: "この作品が選ばれた理由" }).click();
  await expect(page.locator("#art-reason")).toContainText(
    "AIによる鑑賞上の解釈",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "部屋から出る" }).click();
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(
    page.getByRole("button", { name: "選定結果を確認（試験用）" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("今の気持ちを教えてください")).toBeEmpty();
  expect(errors).toEqual([]);
});
test("review is hidden by default and selection errors keep the input without retrying", async ({
  page,
}) => {
  await setup(page);
  let calls = 0;
  await page.route("**/api/exhibition", (r) => {
    calls++;
    return r.fulfill({
      status: 502,
      json: { error: "MiMoの選定を完了できませんでした。" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("不安な気持ち");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("MiMo");
  await expect(page.getByLabel("今の気持ちを教えてください")).toHaveValue(
    "不安な気持ち",
  );
  await expect(page.getByRole("button", { name: "展示する" })).toBeEnabled();
  expect(calls).toBe(1);
  await expect(page.getByText(/無料デモ/)).toHaveCount(0);
});
test("failed images leave the empty room and do not call MiMo again", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/artwork/**", (r) => r.abort());
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) calls++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かな気持ち");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText(
    "作品画像を十分に読み込めませんでした",
  );
  expect(calls).toBe(1);
  await expect(
    page.locator('[aria-label="中央から見回す八角形の展示室、展示作品0点"]'),
  ).toBeVisible();
});
test("pending selection can be cancelled with the input retained", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/exhibition", () => {});
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("まだ言葉の途中");
  await page.getByRole("button", { name: "展示する" }).click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByLabel("今の気持ちを教えてください")).toHaveValue(
    "まだ言葉の途中",
  );
  await expect(page.getByRole("button", { name: "展示する" })).toBeEnabled();
});

test("an image taking longer than 15 seconds is kept without another selection", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setup(page);
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) calls++;
  });
  await page.route("**/api/artwork/aic-28560**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 16000));
    await route.fulfill({
      path: "tests/fixtures/aic-28560.jpg",
      contentType: "image/jpeg",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("ゆっくり見たい");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(
    page.locator('[aria-label="中央から見回す八角形の展示室、展示作品8点"]'),
  ).toBeVisible({ timeout: 30000 });
  expect(calls).toBe(1);
  await expect(page.locator(".form-error[role=alert]")).toHaveCount(0);
});
