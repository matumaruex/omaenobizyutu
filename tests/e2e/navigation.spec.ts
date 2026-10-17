import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { collection } from "../../src/lib/collection";
import { exhibitionSlots, fieldOverview, FIELD } from "../../src/lib/layout";
async function drag(page: Page, mobile: boolean, dx: number, dy: number) {
  const box = (await page.locator("canvas").boundingBox())!;
  const start = { x: box.width * 0.5 - dx / 2, y: box.height * 0.45 - dy / 2 };
  const end = { x: start.x + dx, y: start.y + dy };
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...end, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
  }
}
async function zoom(page: Page, mobile: boolean, inward: boolean) {
  const box = (await page.locator("canvas").boundingBox())!;
  const x = box.width / 2,
    y = box.height / 2;
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    const points = (d: number) => [
      { x: x - d, y, id: 1 },
      { x: x + d, y, id: 2 },
    ];
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(inward ? 40 : 80),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(inward ? 80 : 40),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, inward ? -100 : 100);
    await page.mouse.wheel(0, inward ? -100 : 100);
  }
  await page.waitForTimeout(150);
}
test("free choice from overview, pinch or wheel zoom, panning and view retention", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const mobile = testInfo.project.name === "mobile";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "空間に入る" }).click();
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("ひとりで寂しい");
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/exhibition") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "展示する" }).click();
  const exhibition = await (await response).json();
  await expect(
    page.getByRole("button", { name: "気持ちを教える" }),
  ).toBeVisible();
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!;
  const view = fieldOverview(
    exhibition.selections.length,
    box.width / box.height,
  );
  const slots = exhibitionSlots(exhibition.selections.length);
  const pose = { x: view.x, y: view.y, z: view.z };
  await page.waitForTimeout(500);
  const pick = async (index: number) => {
    const camera = new PerspectiveCamera(
      FIELD.fov,
      box.width / box.height,
      0.1,
      400,
    );
    camera.position.set(pose.x, pose.y, pose.z);
    camera.updateMatrixWorld();
    const p = new Vector3(...slots[index].position).project(camera);
    const position = {
      x: ((p.x + 1) * box.width) / 2,
      y: ((1 - p.y) * box.height) / 2,
    };
    if (mobile) await page.touchscreen.tap(position.x, position.y);
    else await canvas.click({ position });
    await expect(
      page.getByRole("dialog", { name: "作品を鑑賞する" }),
    ).toBeVisible();
    const artwork = collection.find(
      (a) => a.id === exhibition.selections[index].id,
    )!;
    await expect(
      page.getByRole("img", {
        name: `${artwork.titleJa} — ${artwork.artist}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  };
  // Choose the last work first: all works are available without a viewing order.
  await pick(exhibition.selections.length - 1);
  await pick(0);
  const overview = await canvas.screenshot();
  await zoom(page, mobile, true);
  pose.z *= mobile ? 0.5 : Math.exp(-0.4);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await canvas.screenshot()).equals(overview)).toBe(false);
  await pick(0);
  const dx = 25,
    dy = 20,
    height = 2 * Math.tan((FIELD.fov * Math.PI) / 360) * pose.z;
  await drag(page, mobile, dx, dy);
  pose.x -= ((dx / box.width) * height * box.width) / box.height;
  pose.y += (dy / box.height) * height;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pick(0);
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("まだ言葉の途中");
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "展示に戻る" }).click();
  await pick(0);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-zoomed.png`,
  });
  await drag(page, mobile, -dx, -dy);
  pose.x = view.x;
  pose.y = view.y;
  await zoom(page, mobile, false);
  pose.z = view.z;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pick(exhibition.selections.length - 1);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-overview.png`,
  });
});
