import { test, expect } from "@playwright/test";
import { collection } from "../../src/lib/collection";
test("empty room → emotion → real exhibition → quiet artwork view → new exhibition", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.goto("/");
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await expect(page.getByRole("button")).toHaveText([
    "部屋から出る",
    "気持ちを教える",
  ]);
  await expect(page.getByRole("heading")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "移動スティック" }),
  ).toBeVisible();
  await expect(page.locator("textarea, .minimap, .crosshair")).toHaveCount(0);
  await expect(
    page.locator(".intro-description, .prompt-row, .navigation-note"),
  ).toHaveCount(0);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.locator('[aria-label="白い3D展示室、展示作品0点"]'),
  ).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-empty.png`,
  });
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page
    .getByLabel("今の気持ちを教えてください")
    .fill("恋人と別れて寂しい");
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/exhibition") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "展示する" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const first = await response.json();
  expect(first.mode).toBe("demo");
  expect(first.selections.length).toBeGreaterThanOrEqual(4);
  for (const selection of first.selections)
    expect(collection.some((a) => a.id === selection.id)).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-exhibition.png`,
  });
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByRole("button", { name: /作品一覧/ }).click();
  const image = page.locator(".artwork-grid img").first();
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 500,
    ),
  ).toBeTruthy();
  await page.locator(".artwork-grid button").first().click();
  await expect(
    page.getByRole("dialog", { name: "作品を鑑賞する" }),
  ).toBeVisible();
  await expect(page.locator("#art-info")).toHaveCount(0);
  await page.getByRole("button", { name: "作品について" }).click();
  await expect(page.locator("#art-info")).toBeVisible();
  await page.getByRole("button", { name: "この作品が選ばれた理由" }).click();
  await expect(
    page.getByText("デモ選定・編集上の解釈", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "作品について" }).click();
  await expect(page.locator("#art-info")).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page
    .getByLabel("今の気持ちを教えてください")
    .fill("明日が楽しみで嬉しい");
  const secondResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/exhibition") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "展示する" }).click();
  const second = await (await secondResponse).json();
  expect(second.selections.map((a: { id: number }) => a.id)).not.toEqual(
    first.selections.map((a: { id: number }) => a.id),
  );
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  await expect(page.getByRole("heading")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveText([
    "部屋から出る",
    "気持ちを教える",
  ]);
  await page.getByRole("button", { name: "部屋から出る" }).click();
  await expect(page.getByRole("button", { name: "部屋に入る" })).toBeVisible();
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await expect(
    page.locator('[aria-label="白い3D展示室、展示作品0点"]'),
  ).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
test("API rejects invalid input and unavailable AI without paid calls", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/exhibition", {
        data: { text: "  ", mode: "demo" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/exhibition", {
        data: { text: "あ".repeat(801), mode: "demo" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/exhibition", {
        data: { text: "静か", mode: "ai" },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/exhibition", {
        data: { text: "静か", mode: "demo" },
        headers: { origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
});
test("selection failures keep the room and show a retryable message", async ({
  page,
}) => {
  await page.route("**/api/exhibition", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "選定サービスに接続できませんでした。" }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かな気持ち");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText(
    "選定サービスに接続できませんでした",
  );
  await expect(page.getByRole("button", { name: "展示する" })).toBeEnabled();
  await expect(page.locator("canvas")).toBeVisible();
});
test("all local collection images decode at their actual aspect ratios", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  const results = await page.evaluate(
    async (artworks) =>
      Promise.all(
        artworks.map(async (art) => {
          const img = new Image();
          img.src = art.localImage;
          try {
            await img.decode();
            return {
              id: art.id,
              width: img.naturalWidth,
              height: img.naturalHeight,
              ratio: img.naturalWidth / img.naturalHeight,
              expected: art.width / art.height,
            };
          } catch {
            return { id: art.id, width: 0, height: 0, ratio: 0, expected: 1 };
          }
        }),
      ),
    collection,
  );
  for (const result of results) {
    expect(result.width, `ID ${result.id}`).toBeGreaterThan(500);
    expect(
      Math.abs(result.ratio - result.expected),
      `ID ${result.id} ratio`,
    ).toBeLessThan(0.04);
  }
});
test("image failures show an error and leave the empty room usable", async ({
  page,
}) => {
  await page.route("**/artworks/*.jpg", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByLabel("今の気持ちを教えてください").fill("静かな気持ち");
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(page.locator(".form-error")).toContainText(
    "作品画像を十分に読み込めませんでした",
  );
  await expect(page.getByRole("button", { name: "展示する" })).toBeEnabled();
  await expect(
    page.locator('[aria-label="白い3D展示室、展示作品0点"]'),
  ).toBeVisible();
});
test("pending curation can be cancelled without erasing the input", async ({
  page,
}) => {
  await page.route("**/api/exhibition", () => {});
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByLabel("今の気持ちを教えてください").fill("まだ言葉の途中");
  await page.getByRole("button", { name: "展示する" }).click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("button", { name: "展示する" })).toBeEnabled();
  await expect(page.getByLabel("今の気持ちを教えてください")).toHaveValue(
    "まだ言葉の途中",
  );
});

test("the empty room can be explored before entering a feeling", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(page.getByLabel("今の気持ちを教えてください")).toBeVisible();
  await expect(page.getByRole("button", { name: "展示する" })).toBeDisabled();
  await page.getByRole("button", { name: "部屋を見回す" }).click();
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(
    page.locator('[aria-label="白い3D展示室、展示作品0点"]'),
  ).toBeVisible();
  await expect(page.locator(".exhibition-caption")).toHaveCount(0);
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(page.getByLabel("今の気持ちを教えてください")).toBeEmpty();
});
