import { describe, it, expect } from "vitest";
import {
  exhibitionSlots,
  paintingSize,
  constrainPosition,
} from "../src/lib/layout";
import { collection } from "../src/lib/collection";
describe("variable exhibition architecture", () => {
  for (let count = 4; count <= 12; count++)
    it(`${count} works have distinct, bounded wall intervals`, () => {
      const slots = exhibitionSlots(count);
      expect(slots).toHaveLength(count);
      expect(new Set(slots.map((s) => s.position.join(","))).size).toBe(count);
      for (const slot of slots) {
        expect(
          Math.max(Math.abs(slot.position[0]), Math.abs(slot.position[2])),
        ).toBe(9.85);
        expect(slot.position[1]).toBe(2.2);
      }
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++)
          expect(
            Math.hypot(
              slots[i].position[0] - slots[j].position[0],
              slots[i].position[2] - slots[j].position[2],
            ),
          ).toBeGreaterThan(4);
    });
  it("preserves portrait, square and landscape ratios within the frame bounds", () => {
    for (const [width, height] of [
      [1, 4],
      [1, 1],
      [5, 1],
      ...collection.map((a) => [a.width, a.height]),
    ]) {
      const size = paintingSize({ width, height });
      expect(size.width / size.height).toBeCloseTo(width / height);
      expect(size.width).toBeLessThanOrEqual(2.80001);
      expect(size.height).toBeLessThanOrEqual(2.40001);
    }
  });
  it("stops the camera before the wall", () => {
    expect(constrainPosition(500, -500)).toEqual([9.55, -9.55]);
    expect(constrainPosition(0, 3)).toEqual([0, 3]);
  });
});
