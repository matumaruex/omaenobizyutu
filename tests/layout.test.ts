import { describe, it, expect } from "vitest";
import { PerspectiveCamera, Vector3, Euler } from "three";
import { exhibitionSlots, paintingSize, ROOM } from "../src/lib/layout";
import { collection } from "../src/lib/collection";
describe("discovery from the center of a room", () => {
  for (let count = 4; count <= 12; count++)
    it(`${count} works occupy all four walls without overlapping`, () => {
      const slots = exhibitionSlots(count);
      expect(slots).toHaveLength(count);
      expect(new Set(slots.slice(0, 4).map((s) => s.rotation[1])).size).toBe(4);
      for (const s of slots) {
        expect(s.position[1]).toBe(ROOM.eye);
        expect(Math.max(Math.abs(s.position[0]), Math.abs(s.position[2]))).toBe(
          ROOM.halfDepth - 0.08,
        );
        const front = new Vector3(0, 0, 1).applyEuler(new Euler(...s.rotation));
        expect(
          front.dot(new Vector3(-s.position[0], 0, -s.position[2])),
        ).toBeCloseTo(ROOM.halfDepth - 0.08);
        // Turning toward each work brings its center into view from the same position.
        const camera = new PerspectiveCamera(ROOM.fov, 390 / 664, 0.1, 65);
        camera.position.set(0, ROOM.eye, 0);
        camera.rotation.set(
          0,
          Math.atan2(-s.position[0], -s.position[2]),
          0,
          "YXZ",
        );
        camera.updateMatrixWorld();
        const p = new Vector3(...s.position).project(camera);
        expect(p.x).toBeCloseTo(0);
        expect(p.y).toBeCloseTo(0);
        expect(p.z).toBeGreaterThan(-1);
        expect(p.z).toBeLessThan(1);
      }
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++)
          expect(
            new Vector3(...slots[i].position).distanceTo(
              new Vector3(...slots[j].position),
            ),
          ).toBeGreaterThan(3);
      for (const aspect of [390 / 664, 1.44]) {
        const camera = new PerspectiveCamera(ROOM.fov, aspect, 0.1, 65);
        camera.position.set(0, ROOM.eye, 0);
        camera.updateMatrixWorld();
        const visible = slots.filter((s) => {
          const p = new Vector3(...s.position).project(camera);
          return Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1;
        });
        expect(visible.length).toBeGreaterThanOrEqual(1);
        expect(visible.length).toBeLessThan(count);
        if (count <= 8) expect(visible.length).toBeLessThanOrEqual(2);
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
      // The complete frame must fit a portrait phone while facing its wall.
      const visibleWidth =
        2 *
        (ROOM.halfDepth - 0.08) *
        Math.tan((ROOM.fov * Math.PI) / 360) *
        (390 / 664);
      expect(size.width + 0.202).toBeLessThan(visibleWidth * 0.9);
      expect(ROOM.eye - (size.height + 0.202) / 2).toBeGreaterThan(0.25);
    }
  });
  it("starts without works and rejects unsupported counts", () => {
    expect(exhibitionSlots(0)).toEqual([]);
    for (const count of [-1, 13, 4.5])
      expect(() => exhibitionSlots(count)).toThrow();
  });
});
