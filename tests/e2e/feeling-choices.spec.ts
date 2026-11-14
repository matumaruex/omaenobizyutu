import { test, expect } from "@playwright/test";
import { setup } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await page.addStyleTag({
    content: "nextjs-portal { display:none !important }",
  });
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
});

test("two broad choices, exclusive unknown, optional words and a single submission", async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition"))
      requests.push(r.postDataJSON().text);
  });
  await page.getByRole("button", { name: "近い感覚から選ぶ" }).click();
  await expect(page.getByRole("button", { name: "展示する" })).toBeDisabled();
  const warm = page.getByRole("button", { name: "穏やか・あたたかい" });
  const sad = page.getByRole("button", { name: "悲しい・ぽっかり" });
  const unknown = page.getByRole("button", {
    name: "まだわからない",
    exact: true,
  });
  await warm.click();
  await sad.click();
  await expect(
    page.getByRole("button", { name: "不安・そわそわ" }),
  ).toBeDisabled();
  await sad.click();
  await expect(
    page.getByRole("button", { name: "不安・そわそわ" }),
  ).toBeEnabled();
  await sad.click();
  await unknown.click();
  await expect(warm).toHaveAttribute("aria-pressed", "false");
  await expect(sad).toHaveAttribute("aria-pressed", "false");
  await warm.click();
  await expect(unknown).toHaveAttribute("aria-pressed", "false");
  await sad.click();
  await page
    .getByLabel("言葉を足す（任意）")
    .fill("悲しいけど、誰かを大切に思っている");
  await expect(page.getByRole("button", { name: "展示する" })).toBeInViewport();
  await page.screenshot({
    path: `artifacts/${info.project.name}-feeling-choices.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(
    page.locator('[aria-label="中央から見回す八角形の展示室、展示作品8点"]'),
  ).toBeVisible({ timeout: 30000 });
  expect(requests).toEqual([
    "近い感覚：穏やか・あたたかい、悲しい・ぽっかり\n自分の言葉：悲しいけど、誰かを大切に思っている",
  ]);
});

test("unknown alone can exhibit without typing", async ({ page }) => {
  await page.getByRole("button", { name: "近い感覚から選ぶ" }).click();
  await page
    .getByRole("button", { name: "まだわからない", exact: true })
    .click();
  const request = page.waitForRequest("**/api/exhibition");
  await page.getByRole("button", { name: "展示する" }).click();
  expect((await request).postDataJSON().text).toBe("近い感覚：まだわからない");
  await expect(
    page.locator('[aria-label="中央から見回す八角形の展示室、展示作品8点"]'),
  ).toBeVisible({ timeout: 30000 });
});

test("mode changes retain words, enforce combined limit and omit hidden choices", async ({
  page,
}) => {
  await page.getByLabel("今の気持ちを教えてください").fill("あ".repeat(800));
  await page.getByRole("button", { name: "近い感覚から選ぶ" }).click();
  await page.getByRole("button", { name: "不安・そわそわ" }).click();
  await expect(page.getByRole("button", { name: "展示する" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("800文字以内");
  await page
    .getByLabel("言葉を足す（任意）")
    .fill("不安ではない、少し疲れただけ");
  await page.getByRole("button", { name: "自分の言葉で書く" }).click();
  await expect(page.getByLabel("今の気持ちを教えてください")).toHaveValue(
    "不安ではない、少し疲れただけ",
  );
  const request = page.waitForRequest("**/api/exhibition");
  await page.getByRole("button", { name: "展示する" }).click();
  expect((await request).postDataJSON().text).toBe(
    "不安ではない、少し疲れただけ",
  );
});
