import { test, expect } from "@playwright/test";
import { setup, exhibition } from "./fixtures";
import type { HistoryEntry } from "../../src/lib/history/types";
const label = "選定・料金の履歴（試験用）";
const input = "静かだけど、不安もある <script>window.bad=true</script>";
function entry(): HistoryEntry {
  const result = exhibition();
  return {
    accounting: {
      id: "4d191b34-423f-4cb9-8ae0-68e2ee06928a",
      createdAt: "2026-10-20T00:00:00Z",
      model: "mimo-v2.6-flash",
      status: "succeeded",
      usage: {
        inputTokens: 6000,
        outputTokens: 700,
        cachedInputTokens: 2000,
        reasoningTokens: 0,
      },
      estimate: { nanoJpy: 114240000, cacheAssumedMiss: false },
      pricing: {
        version: "試験単価",
        usdJpy: 150,
        inputUsdPerMillion: 0.14,
        cachedInputUsdPerMillion: 0.0028,
        outputUsdPerMillion: 0.28,
        source: "https://mimo.mi.com/docs/en-US/pricing",
        checkedOn: "2026-10-20",
      },
    },
    history: {
      input,
      selection: {
        title: result.title,
        atmosphere: result.atmosphere,
        works: result.selections.map((s) => ({
          id: s.id,
          title: s.artwork.title,
          titleJa: s.artwork.titleJa,
          artist: s.artwork.artist,
          role: "共鳴",
          reason: s.reason,
        })),
      },
      search: {
        catalogCommit: result.verification.catalogCommit,
        catalogCount: 200,
        taggedCount: 167,
        matchingCount: 40,
        detectedCategories: ["安心", "不安"],
        candidates: result.selections.map((s) => ({
          id: s.id,
          title: s.artwork.title,
          artist: s.artwork.artist,
          primary: ["安心"],
          secondary: ["不安"],
          matchedTags: ["安心", "不安"],
          score: 2,
        })),
      },
    },
  };
}
test.beforeEach(async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type === "webgl2"
        ? null
        : Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
});
test("selection and fee history survives leaving and reloads without generating again", async ({
  page,
}, info) => {
  let saved: HistoryEntry | null = null,
    paid = 0,
    reports = 0;
  await page.route("**/api/history?**", (route) =>
    route.fulfill({
      json: {
        calls: saved ? 1 : 0,
        offset: 0,
        limit: 20,
        entries: saved ? [saved] : [],
      },
    }),
  );
  await page.route("**/api/history/*/display", async (route) => {
    reports++;
    if (saved?.history)
      saved.history.display = {
        displayedIds: route.request().postDataJSON().displayedIds,
        reportedAt: new Date().toISOString(),
      };
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/exhibition", (route) => {
    paid++;
    saved = entry();
    expect(route.request().postDataJSON().text).toBe(input);
    const r = exhibition();
    return route.fulfill({
      json: {
        ...r,
        verification: {
          ...r.verification,
          search: saved.history!.search,
          accounting: { record: saved.accounting, persisted: true },
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await expect(
    page.getByText("試験記録として保存します", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("今の気持ちを教えてください").fill(input);
  await page.getByRole("button", { name: "展示する" }).click();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  await expect.poll(() => reports).toBe(1);
  await page.getByRole("button", { name: "部屋から出る" }).click();
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.getByRole("button", { name: label }).click();
  const dialog = page.getByRole("dialog", { name: label });
  await dialog.locator(".history-entry > summary").click();
  await expect(dialog.locator(".review-input")).toHaveText(input);
  await expect(dialog).toContainText("0.1142");
  await expect(dialog).toContainText("画像読み込み済み");
  await dialog.getByText("候補検索から選定までの流れ", { exact: true }).click();
  await expect(dialog).toContainText("主タグ・補助タグのある167点");
  await expect(dialog).toContainText("aic-28560");
  await expect(dialog).toContainText("AI内部の推論過程は記録しません");
  await page.screenshot({
    path: `artifacts/${info.project.name}-selection-history.png`,
  });
  await page.reload();
  await page.getByRole("button", { name: "表示設定" }).click();
  await expect(page.getByLabel("選定結果を確認する")).not.toBeChecked();
  await page.getByRole("button", { name: label }).click();
  await page.locator(".history-entry > summary").click();
  await expect(page.locator(".review-input")).toHaveText(input);
  expect(paid).toBe(1);
  expect(reports).toBe(1);
  expect(await page.evaluate(() => Object.hasOwn(window, "bad"))).toBe(false);
});
test("old usage remains visible with unavailable selections and free history pagination", async ({
  page,
}) => {
  let paid = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) paid++;
  });
  await page.route("**/api/history?**", (route) => {
    const offset = Number(
      new URL(route.request().url()).searchParams.get("offset"),
    );
    const old = { ...entry(), history: null };
    return route.fulfill({
      json: {
        calls: 21,
        offset,
        limit: 20,
        entries: [
          { ...old, accounting: { ...old.accounting, id: `old-${offset}` } },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "表示設定" }).click();
  await page.getByRole("button", { name: label }).click();
  await page.locator(".history-entry > summary").click();
  await expect(page.getByRole("dialog", { name: label })).toContainText(
    "この機能の追加前のため保存されていません",
  );
  await page.getByRole("button", { name: "以前の記録", exact: true }).click();
  await expect(page.getByRole("dialog", { name: label })).toContainText(
    "21〜21件目",
  );
  await expect(
    page.getByRole("button", { name: "以前の記録", exact: true }),
  ).toBeDisabled();
  expect(paid).toBe(0);
});

// Browser fixtures do not call MiMo or Redis.
for (const version of [
  "ai-semantic-v1",
  "ai-semantic-v2",
  "ai-semantic-v3",
] as const)
  test(`semantic retrieval ${version} and final selection remain distinct`, async ({
    page,
  }) => {
    const final = entry();
    const group = final.accounting.id;
    final.accounting.pipeline = { exhibitionId: group, stage: "selection" };
    const search = final.history!.search!;
    search.method = version;
    if (version === "ai-semantic-v3") search.proposedCount = 24;
    search.eligibleCount = 300;
    search.catalogCount = 300;
    search.matchingCount = null;
    search.detectedCategories = [];
    search.candidates = search.candidates.map((c) => ({
      ...c,
      score: null,
      matchedTags: [],
      reason:
        version === "ai-semantic-v1"
          ? "曖昧な気持ちと作品の待つ場面に接点があるため。"
          : undefined,
    }));
    const first: HistoryEntry = {
      accounting: {
        ...final.accounting,
        id: "5d191b34-423f-4cb9-8ae0-68e2ee06928a",
        pipeline: { exhibitionId: group, stage: "retrieval" },
      },
      history: { input, search },
    };
    await page.route("**/api/history?**", (route) =>
      route.fulfill({
        json: { calls: 2, offset: 0, limit: 20, entries: [final, first] },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "表示設定" }).click();
    await page.getByRole("button", { name: label }).click();
    const rows = page.locator(".history-entry");
    await rows.nth(1).locator(":scope > summary").click();
    await expect(rows.nth(1)).toContainText("候補選びの記録です");
    await expect(rows.nth(1)).not.toContainText(
      "失敗・中断などで結果を保存できなかった",
    );
    await rows
      .nth(1)
      .getByText("候補検索から選定までの流れ", { exact: true })
      .click();
    await expect(rows.nth(1)).toContainText("タグの有無を問わず300点");
    if (version === "ai-semantic-v1")
      await expect(rows.nth(1)).toContainText("曖昧な気持ちと作品の待つ場面");
    else await expect(rows.nth(1)).toContainText("候補選びは作品IDだけを出力");
    await expect(rows.nth(1)).not.toContainText("検索点");
    await rows.nth(0).locator(":scope > summary").click();
    await expect(rows.nth(0)).toContainText("最終選定");
    await expect(
      rows.nth(0).locator(":scope > .review-works > li"),
    ).toHaveCount(8);
  });
