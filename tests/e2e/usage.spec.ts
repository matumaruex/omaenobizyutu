import { test, expect } from "@playwright/test";
import { setup, exhibition } from "./fixtures";
// These tests cover accounting UI; full 3D rendering is covered in museum and
// navigation specs. Exercise the supported no-WebGL path to avoid extra GPU work.
test.beforeEach(async ({ page }) => {
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
});
test("trial usage panel shows real-response fields and estimates without generating art", async ({
  page,
}, info) => {
  await setup(page);
  let paid = 0,
    reads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) paid++;
    if (r.url().endsWith("/api/usage")) reads++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "表示設定" }).click();
  await expect(
    page.getByRole("button", { name: "API使用量・料金（試験用）" }),
  ).toHaveCount(0);
  await page.getByLabel("選定結果を確認する").check();
  await page.getByRole("button", { name: "API使用量・料金（試験用）" }).click();
  const dialog = page.getByRole("dialog", {
    name: "API使用量・料金（試験用）",
  });
  await expect(dialog).toContainText("累計API呼び出し：2回");
  await expect(dialog).toContainText("未取得が1件");
  await expect(dialog.locator(".usage-tokens")).toContainText("6,000");
  await expect(dialog.locator(".usage-tokens")).toContainText("2,000");
  await expect(dialog).toContainText("実際の請求額とは異なる");
  await expect(dialog).toContainText("1米ドル＝150円");
  await dialog.getByText("現在の単価・換算設定").click();
  await expect(dialog).toContainText("0.0028米ドル");
  await dialog.getByRole("button", { name: "記録を更新" }).click();
  await expect(
    dialog.getByRole("button", { name: "記録を更新" }),
  ).toBeEnabled();
  expect(reads).toBe(2);
  expect(paid).toBe(0);
  await page.screenshot({ path: `artifacts/${info.project.name}-usage.png` });
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "表示設定" })).toBeVisible();
});
test("generation locks the button and sends exactly one unique request ID", async ({
  page,
}) => {
  await setup(page);
  let requests = 0,
    key = "";
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/exhibition", async (route) => {
    requests++;
    key = route.request().headers()["idempotency-key"];
    await gate;
    await route.fulfill({ json: exhibition() });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かに過ごしたい");
  await page.getByRole("button", { name: "展示する" }).click();
  const locked = page.getByRole("button", { name: "選定中", exact: true });
  await expect(locked).toBeDisabled();
  // Submit events in the same turn cannot bypass the immediate ref guard.
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(requests).toBe(1);
  expect(key).toMatch(/^[a-f0-9-]{36}$/);
  release();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("failed selection retains known usage and flags a failed accounting write", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/exhibition", (route) =>
    route.fulfill({
      status: 502,
      json: {
        error: "選定結果を確認できませんでした。",
        accounting: {
          persisted: false,
          record: {
            id: "failed",
            createdAt: "2026-10-20T00:00:00Z",
            model: "mimo-v2.6-flash",
            status: "failed",
            usage: {
              inputTokens: 1000,
              outputTokens: 100,
              reasoningTokens: null,
              cachedInputTokens: 0,
            },
            estimate: { nanoJpy: 25_200_000, cacheAssumedMiss: false },
            pricing: { version: "試験単価", usdJpy: 150 },
          },
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.getByLabel("選定結果を確認する").check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("言葉を探している");
  await page.getByRole("button", { name: "展示する" }).click();
  const usage = page.getByRole("region", { name: "直近のAPI使用量" });
  await expect(usage).toContainText("1,000");
  await expect(usage).toContainText("未取得");
  await expect(usage).toContainText("0.0252");
  await expect(usage).toContainText("累計に反映されていない可能性");
  await expect(page.getByLabel("今の気持ちを教えてください")).toHaveValue(
    "言葉を探している",
  );
});

test("a failed connection displays a safe reason and unknown fees without retrying", async ({
  page,
}, info) => {
  await setup(page);
  let calls = 0;
  await page.route("**/api/exhibition", (route) => {
    calls++;
    return route.fulfill({
      status: 502,
      json: {
        error: "MiMoとの通信が途中で失敗しました。自動で再送はしていません。",
        accounting: {
          persisted: true,
          record: {
            id: "failed-network",
            createdAt: "2026-10-20T04:19:30Z",
            model: "mimo-v2.6-flash",
            status: "failed",
            usage: {
              inputTokens: null,
              outputTokens: null,
              reasoningTokens: null,
              cachedInputTokens: null,
            },
            estimate: null,
            pricing: { version: "試験単価", usdJpy: 150 },
            failure: { kind: "network", elapsedMs: 20000 },
          },
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.getByLabel("選定結果を確認する").check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page
    .getByLabel("今の気持ちを教えてください")
    .fill("不安でもやもやする");
  await page.getByRole("button", { name: "展示する" }).click();
  const usage = page.getByRole("region", { name: "直近のAPI使用量" });
  await expect(usage).toContainText("問い合わせ開始から20.0秒");
  await expect(usage).toContainText("料金は未確定");
  await expect(usage).toContainText("0円を意味しません");
  await expect(
    page.getByRole("button", { name: "展示する", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("今の気持ちを教えてください")).toHaveValue(
    "不安でもやもやする",
  );
  await page.screenshot({
    path: `artifacts/${info.project.name}-failed-connection.png`,
  });
  expect(calls).toBe(1);
});
