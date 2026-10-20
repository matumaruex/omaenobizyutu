import { test, expect, type Page } from "@playwright/test";
import { setup, exhibition } from "./fixtures";

test.setTimeout(60000);
// The detail panel also works without WebGL; museum.spec verifies the real room.
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
async function createExhibition(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("静かに絵を見たい");
  await page.getByRole("button", { name: "展示する", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "気持ちを教える", exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
async function openArtwork(page: Page, index: number) {
  await page
    .getByRole("button", { name: "気持ちを教える", exact: true })
    .click();
  await page.getByRole("button", { name: "作品一覧", exact: true }).click();
  await page.locator(".artwork-grid button").nth(index).click();
  return page.getByRole("dialog", { name: "作品を鑑賞する" });
}
test("the room contains full DB explanations with optional sources and no further AI call", async ({
  page,
}, info) => {
  await setup(page);
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) calls++;
  });
  await createExhibition(page);
  const dialog = await openArtwork(page, 0);
  await expect(dialog.locator(".artwork-stage img")).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(dialog.getByRole("button")).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: "解説を開く", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/${info.project.name}-artwork-first.png`,
  });
  const expected = exhibition().selections[0].artwork.interpretation;
  const toggle = dialog.locator(".artwork-reading-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    dialog.getByRole("heading", { name: "制作背景", exact: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveText("解説を閉じる");
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(
    dialog.getByRole("region", { name: "描かれているもの", exact: true }),
  ).toContainText(expected.visual_clues);
  await expect(
    dialog.getByRole("region", { name: "制作背景", exact: true }),
  ).toContainText(expected.creation_context);
  await expect(
    dialog.getByRole("region", { name: "作品の読み解き", exact: true }),
  ).toContainText(expected.scholarly_interpretation.summary);
  await expect(
    dialog.getByRole("region", { name: "作品の読み解き", exact: true }),
  ).toContainText(expected.uncertainty_note);
  await expect(
    dialog.getByRole("heading", {
      name: "同じ主題・連作についての作者の考え",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", {
      name: "作者がこの作品について述べたこと",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("link", { name: "美術館の作品ページ" }),
  ).toBeHidden();
  await dialog.getByText("画像・出典・所蔵情報", { exact: true }).click();
  await expect(
    dialog.getByRole("link", { name: "元の画像を開く" }),
  ).toHaveAttribute("href", exhibition().selections[0].artwork.localImage);
  await expect(
    dialog.getByRole("link", { name: "画像の利用条件" }),
  ).toHaveAttribute("href", exhibition().selections[0].artwork.imageLicense);
  await expect(
    dialog.getByRole("link", { name: "作品解説の出典" }),
  ).toHaveAttribute("href", expected.scholarly_interpretation.source_url);
  await expect(
    dialog.getByRole("link", { name: "作者の発言・考えの出典" }),
  ).toHaveAttribute("href", expected.author_intent.source_url!);
  await dialog.getByText("画像・出典・所蔵情報", { exact: true }).click();
  await dialog
    .getByRole("region", { name: "制作背景", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/${info.project.name}-artwork-explanation.png`,
  });
  await toggle.click();
  await toggle.click();
  await expect(
    dialog.getByRole("region", { name: "制作背景", exact: true }),
  ).toContainText(expected.creation_context);
  await dialog.getByRole("button", { name: "この作品が選ばれた理由" }).click();
  await expect(dialog.locator("#art-reason")).toContainText(
    "AIによる鑑賞上の解釈",
  );
  expect(calls).toBe(1);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
});

test("author statements retain their verification scope and unverified statements stay hidden", async ({
  page,
}) => {
  await setup(page);
  const result = exhibition();
  const statuses = [
    "direct_for_this_work",
    "related_motif_or_series",
    "related_artistic_program",
    "not_verified_for_this_work",
  ];
  const headings = [
    "作者がこの作品について述べたこと",
    "同じ主題・連作についての作者の考え",
    "作者の制作への考え",
  ];
  for (const [i, selected] of result.selections.entries()) {
    selected.artwork.interpretation = structuredClone(
      selected.artwork.interpretation,
    );
    selected.artwork.interpretation.author_intent = {
      status: statuses[i],
      summary: `作者に関する試験資料${i}`,
      source_url: `https://example.org/author-${i}`,
    };
  }
  await page.route("**/api/exhibition", (route) =>
    route.fulfill({ json: result }),
  );
  let calls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/exhibition")) calls++;
  });
  await createExhibition(page);
  for (let i = 0; i < 4; i++) {
    const dialog = await openArtwork(page, i);
    await dialog
      .getByRole("button", { name: "解説を開く", exact: true })
      .click();
    for (const [j, heading] of headings.entries()) {
      await expect(
        dialog.getByRole("heading", { name: heading, exact: true }),
      ).toHaveCount(i === j ? 1 : 0);
    }
    if (i === 1 || i === 2)
      await expect(
        dialog.getByText(/この作品そのものへの発言とは限りません/),
      ).toBeVisible();
    if (i === 3) {
      await expect(
        dialog.getByText("作者に関する試験資料3", { exact: true }),
      ).toHaveCount(0);
      await dialog.getByText("画像・出典・所蔵情報", { exact: true }).click();
      await expect(
        dialog.getByRole("link", { name: "作者の発言・考えの出典" }),
      ).toHaveCount(0);
    }
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  }
  expect(calls).toBe(1);
});
