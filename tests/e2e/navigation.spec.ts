import { test, expect, type Page } from "@playwright/test";
import { collection } from "../../src/lib/collection";
// The same gesture angles are applied through real mouse or touch events.
async function look(
  page: Page,
  mobile: boolean,
  degreesX: number,
  degreesY: number,
) {
  const box = (await page.locator("canvas").boundingBox())!;
  const dx = (degreesX * Math.PI) / 180 / 0.0024,
    dy = (degreesY * Math.PI) / 180 / 0.0024;
  const steps = Math.ceil(
    Math.max(
      Math.abs(dx) / (box.width * 0.45),
      Math.abs(dy) / (box.height * 0.4),
    ),
  );
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  for (let i = 0; i < steps; i++) {
    const start = {
      x: box.width * 0.5 - dx / steps / 2,
      y: box.height * 0.45 - dy / steps / 2,
    };
    const end = { x: start.x + dx / steps, y: start.y + dy / steps };
    if (touch) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [start],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [end],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 6 });
      await page.mouse.up();
    }
  }
  await touch?.detach();
}
test("fixed viewpoint, upper and lower paintings, and view restoration", async ({
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
  const canvas = page.locator("canvas");
  await page.waitForTimeout(500);
  const front = await canvas.screenshot();
  await page.keyboard.down("w");
  await page.waitForTimeout(450);
  await page.keyboard.up("w");
  expect((await canvas.screenshot()).equals(front)).toBe(true);
  await expect(page.locator(".joystick")).toHaveCount(0);
  const pick = async (index: number) => {
    const box = (await canvas.boundingBox())!;
    if (mobile) await page.touchscreen.tap(box.width / 2, box.height / 2);
    else
      await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
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
  await pick(0);
  expect((await canvas.screenshot()).equals(front)).toBe(true);
  await look(page, mobile, 18, 35);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-upper.png`,
  });
  const upper = await canvas.screenshot();
  expect(upper.equals(front)).toBe(false);
  await pick(1);
  await pick(1);
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("まだ言葉の途中");
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "展示に戻る" }).click();
  await pick(1);
  await look(page, mobile, -36, -70);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-lower.png`,
  });
  await pick(2);
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
});
