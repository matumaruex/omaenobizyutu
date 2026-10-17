import { test, expect } from "@playwright/test";
test("movement, look, artwork picking and restoration in the 3D room", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByLabel("今、何を感じていますか？").fill("ひとりで寂しい");
  await page.getByRole("button", { name: "美術館をつくる" }).click();
  await expect(page.getByRole("button", { name: /作品一覧/ })).toBeVisible();
  await page.waitForTimeout(2500);
  const marker = page.locator(".minimap > span");
  const before = await marker.getAttribute("style");
  if (testInfo.project.name === "desktop") {
    await page.keyboard.down("w");
    await page.waitForTimeout(700);
    await page.keyboard.up("w");
  } else {
    const stick = await page
      .getByRole("group", { name: "移動スティック" })
      .boundingBox();
    expect(stick).not.toBeNull();
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: stick!.x + 45, y: stick!.y + 10 }],
    });
    await page.waitForTimeout(700);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  }
  await expect.poll(() => marker.getAttribute("style")).not.toBe(before);
  await page.waitForTimeout(350);
  const stopped = await marker.getAttribute("style");
  await page.getByRole("button", { name: "気持ちをことばにする" }).click();
  await page.getByLabel("今、何を感じていますか？").fill("wasd");
  await page.keyboard.press("w");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "展示に戻る" }).click();
  expect(await marker.getAttribute("style")).toBe(stopped);
  const canvas = page.locator("canvas"),
    box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // The first selected artwork is centered on the front wall and intersects the eye line.
  if (testInfo.project.name === "mobile")
    await page.touchscreen.tap(
      box!.x + box!.width / 2,
      box!.y + box!.height / 2,
    );
  else
    await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(
    page.getByRole("dialog", { name: "作品を鑑賞する" }),
  ).toBeVisible();
  await page.keyboard.press("w");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(await marker.getAttribute("style")).toBe(stopped);
  const start = await page.screenshot();
  if (testInfo.project.name === "desktop") {
    await page.mouse.move(box!.width * 0.6, box!.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box!.width * 0.7, box!.height * 0.55, { steps: 6 });
    await page.mouse.up();
    await canvas.click({
      position: { x: box!.width * 0.85, y: box!.height * 0.8 },
    });
    await expect
      .poll(() => page.evaluate(() => document.pointerLockElement?.tagName))
      .toBe("CANVAS");
    await page.keyboard.press("Escape");
    await expect
      .poll(() => page.evaluate(() => document.pointerLockElement))
      .toBeNull();
  } else {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box!.width * 0.6, y: box!.height * 0.6 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box!.width * 0.8, y: box!.height * 0.55 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  }
  await page.waitForTimeout(350);
  const end = await page.screenshot();
  expect(start.equals(end)).toBe(false);
});
