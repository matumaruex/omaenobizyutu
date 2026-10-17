import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3, Euler } from "three";
import {
  exhibitionSlots,
  paintingSize,
  fieldOverview,
  FIELD,
} from "../src/lib/layout";
import { collection } from "../src/lib/collection";
describe("scattered paintings", () => {
  for (let count = 4; count <= 12; count++)
    it(`${count} works fit into the overview without overlapping on tall or wide screens`, () => {
      const slots = exhibitionSlots(count);
      expect(slots).toHaveLength(count);
      expect(new Set(slots.map((s) => s.position[2])).size).toBeGreaterThan(2);
      for (const aspect of [0.4, 390 / 664, 1.44, 2.2]) {
        const view = fieldOverview(count, aspect);
        const camera = new PerspectiveCamera(FIELD.fov, aspect, 0.1, 400);
        camera.position.set(view.x, view.y, view.z);
        camera.updateMatrixWorld();
        const boxes = slots.map((s) => {
          const corners = [-1, 1].flatMap((x) =>
            [-1, 1].map((y) =>
              new Vector3(x * 1.4, y * 1.2, 0)
                .applyEuler(new Euler(...s.rotation))
                .add(new Vector3(...s.position))
                .project(camera),
            ),
          );
          corners.forEach((p) => {
            expect(Math.abs(p.x)).toBeLessThan(0.95);
            expect(Math.abs(p.y)).toBeLessThan(0.86);
          });
          return {
            left: Math.min(...corners.map((p) => p.x)),
            right: Math.max(...corners.map((p) => p.x)),
            top: Math.max(...corners.map((p) => p.y)),
            bottom: Math.min(...corners.map((p) => p.y)),
          };
        });
        for (let i = 0; i < count; i++)
          for (let j = i + 1; j < count; j++) {
            const a = boxes[i],
              b = boxes[j];
            expect(
              a.right < b.left ||
                b.right < a.left ||
                a.top < b.bottom ||
                b.top < a.bottom,
            ).toBe(true);
          }
      }
    });
  it("preserves actual image proportions", () => {
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
    expect(Number.isFinite(fieldOverview(0, 0.5).z)).toBe(true);
    for (const count of [-1, 13, 4.5])
      expect(() => exhibitionSlots(count)).toThrow();
  });
});
