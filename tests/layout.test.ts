import { describe, it, expect } from "vitest";
import { Euler, Vector3 } from "three";
import { exhibitionSlots, paintingSize, SPHERE } from "../src/lib/layout";
import { collection } from "../src/lib/collection";
describe("spherical exhibition", () => {
  for (let count = 4; count <= 12; count++)
    it(`${count} works surround the viewer, face inward and do not overlap`, () => {
      const slots = exhibitionSlots(count);
      expect(slots).toHaveLength(count);
      expect(slots[0].position).toEqual([0, 0, -SPHERE.radius]);
      expect(slots.some((s) => s.position[1] > 3)).toBe(true);
      expect(slots.some((s) => s.position[1] < -3)).toBe(true);
      expect(slots.some((s) => s.position[2] > 0)).toBe(true);
      const cap = Math.atan(Math.hypot(2.8, 2.4) / 2 / SPHERE.radius);
      for (const slot of slots) {
        const position = new Vector3(...slot.position);
        expect(position.length()).toBeCloseTo(SPHERE.radius);
        const front = new Vector3(0, 0, 1).applyEuler(
          new Euler(...slot.rotation, "YXZ"),
        );
        expect(front.dot(position.normalize().negate())).toBeCloseTo(1);
      }
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++)
          expect(
            new Vector3(...slots[i].position).angleTo(
              new Vector3(...slots[j].position),
            ),
          ).toBeGreaterThan(cap * 2);
    });
  it("preserves portrait, square and landscape ratios within the image bounds", () => {
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
  it("keeps an empty sky empty and rejects unsupported counts", () => {
    expect(exhibitionSlots(0)).toEqual([]);
    for (const count of [-1, 13, 4.5])
      expect(() => exhibitionSlots(count)).toThrow();
  });
});
