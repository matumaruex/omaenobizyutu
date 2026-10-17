import { test, expect, type Page } from "@playwright/test";
import { collection } from "../../src/lib/collection";
async function turn(page: Page, mobile: boolean, degrees: number) {
  const box = (await page.locator("canvas").boundingBox())!;
  const dx = (degrees * Math.PI) / 180 / 0.0024;
  const steps = Math.ceil(Math.abs(dx) / (box.width * 0.4));
  const touch = mobile ? await page.context().newCDPSession(page) : null;
  for (let i = 0; i < steps; i++) {
    const start = { x: box.width / 2 - dx / steps / 2, y: box.height * 0.45 };
    const end = { x: start.x + dx / steps, y: start.y };
    if (touch) {
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
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 6 });
      await page.mouse.up();
    }
  }
  await touch?.detach();
}
test("discover four walls by turning, without walking or floor-tap movement", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const mobile = testInfo.project.name === "mobile";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "部屋に入る" }).click();
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
  await page.waitForTimeout(500);
  const front = await canvas.screenshot();
  const tap = async (x: number, y: number) => {
    if (mobile) await page.touchscreen.tap(x, y);
    else await canvas.click({ position: { x, y } });
  };
  // A floor tap is a no-op: there is no hidden movement mode to learn.
  await tap(box.width * 0.28, box.height * 0.8);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await canvas.screenshot()).equals(front)).toBe(true);
  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");
  expect((await canvas.screenshot()).equals(front)).toBe(true);
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    const points = (d: number) => [
      { x: box.width / 2 - d, y: box.height / 2, id: 1 },
      { x: box.width / 2 + d, y: box.height / 2, id: 2 },
    ];
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(40),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(80),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.wheel(0, -150);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await canvas.screenshot()).equals(front)).toBe(true);
  const pick = async (index: number) => {
    await tap(box.width / 2, box.height / 2);
    await expect(
      page.getByRole("dialog", { name: "作品を鑑賞する" }),
    ).toBeVisible();
    const a = collection.find((a) => a.id === exhibition.selections[index].id)!;
    await expect(
      page.getByRole("img", {
        name: `${a.titleJa} — ${a.artist}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  };
  await pick(0);
  // Four different works become available as the viewer freely turns around.
  for (const [index, name] of [
    [3, "left"],
    [2, "back"],
    [1, "right"],
  ] as const) {
    await turn(page, mobile, 90);
    await page.screenshot({
      path: `artifacts/${testInfo.project.name}-${name}-wall.png`,
    });
    await pick(index);
  }
  await page.getByRole("button", { name: "気持ちを教える" }).click();
  await page.getByLabel("今の気持ちを教えてください").fill("まだ言葉の途中");
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "展示に戻る" }).click();
  await pick(1);
  await turn(page, mobile, 90);
  await pick(0);
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement))
    .toBeNull();
});
