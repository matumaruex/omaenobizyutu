import { describe, it, expect } from "vitest";
import { CircleGeometry, PerspectiveCamera, Vector3, Euler } from "three";
import {
  exhibitionSlots,
  paintingSize,
  ROOM,
  ROOM_WALLS,
  roomVerticalFov,
  FRAME_BORDER,
} from "../src/lib/layout";
import seed from "../src/data/catalog-seed.json";

describe("discovery from the center of an octagonal room", () => {
  it("joins all eight walls to each other and to the octagonal floor", () => {
    expect(ROOM_WALLS).toHaveLength(8);
    const floor = new CircleGeometry(ROOM.floorRadius, 8, Math.PI / 8);
    floor.rotateX(-Math.PI / 2);
    const vertices = floor.getAttribute("position");
    for (const [index, wall] of ROOM_WALLS.entries()) {
      const corner = (slot: typeof wall, side: number) =>
        new Vector3((side * ROOM.wallWidth) / 2, -ROOM.height / 2, 0)
          .applyEuler(new Euler(...slot.rotation))
          .add(new Vector3(...slot.position));
      const right = corner(wall, 1);
      const nextLeft = corner(ROOM_WALLS[(index + 1) % 8], -1);
      expect(right.distanceTo(nextLeft)).toBeLessThan(1e-10);
      expect(Math.hypot(right.x, right.z)).toBeCloseTo(ROOM.floorRadius);
      expect(
        Array.from({ length: 8 }, (_, i) =>
          right.distanceTo(new Vector3().fromBufferAttribute(vertices, i + 1)),
        ).some((distance) => distance < 1e-5),
      ).toBe(true);
    }
    floor.dispose();
  });

  it("hangs eight works at equal distances, 45 degrees apart, facing the center", () => {
    const slots = exhibitionSlots(8);
    expect(slots).toHaveLength(8);
    for (const [index, slot] of slots.entries()) {
      const position = new Vector3(...slot.position);
      expect(position.y).toBe(ROOM.eye);
      expect(Math.hypot(position.x, position.z)).toBeCloseTo(
        ROOM.wallDistance - 0.08,
      );
      const front = new Vector3(0, 0, 1).applyEuler(
        new Euler(...slot.rotation),
      );
      expect(front.dot(new Vector3(-position.x, 0, -position.z))).toBeCloseTo(
        ROOM.wallDistance - 0.08,
      );
      const next = slots[(index + 1) % 8];
      const direction = new Vector3(position.x, 0, position.z).normalize();
      const nextDirection = new Vector3(
        next.position[0],
        0,
        next.position[2],
      ).normalize();
      expect(direction.angleTo(nextDirection)).toBeCloseTo(Math.PI / 4);
      for (const aspect of [390 / 664, 1.44]) {
        const camera = new PerspectiveCamera(
          roomVerticalFov(aspect),
          aspect,
          0.1,
          65,
        );
        camera.position.set(0, ROOM.eye, 0);
        camera.lookAt(position);
        camera.updateMatrixWorld();
        const projected = position.clone().project(camera);
        expect(projected.x).toBeCloseTo(0);
        expect(projected.y).toBeCloseTo(0);
        expect(projected.z).toBeGreaterThan(-1);
        expect(projected.z).toBeLessThan(1);
      }
    }
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++)
        expect(
          new Vector3(...slots[i].position).distanceTo(
            new Vector3(...slots[j].position),
          ),
        ).toBeGreaterThan(ROOM.wallWidth * 0.8);
  });

  it("preserves image proportions and fits the whole frame on a portrait phone", () => {
    for (const [width, height] of [
      [1, 4],
      [1, 1],
      [5, 1],
      ...seed.artworks.map((a) => [a.width, a.height]),
    ]) {
      const size = paintingSize({ width, height });
      expect(size.width / size.height).toBeCloseTo(width / height);
      expect(size.width + FRAME_BORDER).toBeLessThanOrEqual(
        ROOM.wallWidth * 0.78 + 1e-10,
      );
      expect(size.height + FRAME_BORDER).toBeLessThanOrEqual(3.00001);
      const visibleWidth =
        2 *
        (ROOM.wallDistance - 0.08) *
        Math.tan((roomVerticalFov(390 / 664) * Math.PI) / 360) *
        (390 / 664);
      expect(size.width + FRAME_BORDER).toBeLessThan(visibleWidth * 0.9);
      expect(ROOM.eye - (size.height + FRAME_BORDER) / 2).toBeGreaterThan(0.25);
    }
  });

  it("reveals neighboring thirds with reduced wide-angle stretching, including after rotation", () => {
    for (const aspect of [
      320 / 740,
      390 / 844,
      430 / 932,
      1,
      1.44,
      844 / 390,
      3,
    ]) {
      const camera = new PerspectiveCamera(
        roomVerticalFov(aspect),
        aspect,
        0.1,
        65,
      );
      camera.position.set(0, ROOM.eye, 0);
      for (let i = 0; i < 8; i++) {
        const front = ROOM_WALLS[i];
        camera.lookAt(front.position[0], ROOM.eye, front.position[2]);
        camera.updateMatrixWorld();
        for (const offset of [-1, 1]) {
          const neighbor = ROOM_WALLS[(i + offset + 8) % 8];
          const projected = new Vector3(
            neighbor.position[0],
            ROOM.eye,
            neighbor.position[2],
          ).project(camera);
          if (aspect <= 1.44) {
            // Neighbor centers stay just outside the view rather than filling
            // the edges with strongly stretched half-paintings.
            expect(Math.abs(projected.x)).toBeGreaterThan(1.2);
            expect(Math.abs(projected.x)).toBeLessThan(1.4);
          }
          const third = new Vector3((-offset * ROOM.wallWidth) / 6, 0, 0)
            .applyEuler(new Euler(...neighbor.rotation))
            .add(
              new Vector3(neighbor.position[0], ROOM.eye, neighbor.position[2]),
            )
            .project(camera);
          expect(Math.abs(third.x)).toBeLessThan(1);
        }
      }
      for (const art of seed.artworks) {
        const size = paintingSize(art);
        const point = new Vector3(
          (size.width + FRAME_BORDER) / 2,
          ROOM.eye + (size.height + FRAME_BORDER) / 2,
          -(ROOM.wallDistance - 0.08),
        );
        camera.lookAt(0, ROOM.eye, -ROOM.wallDistance);
        camera.updateMatrixWorld();
        point.project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
      }
    }
  });

  it("fills 70–80% of a wall with normal portrait, square and landscape frames", () => {
    for (const ratio of [0.75, 1, 1.5, 3, 5]) {
      const size = paintingSize({ width: ratio, height: 1 });
      expect(
        (size.width + FRAME_BORDER) / ROOM.wallWidth,
      ).toBeGreaterThanOrEqual(0.7);
      expect((size.width + FRAME_BORDER) / ROOM.wallWidth).toBeLessThanOrEqual(
        0.8,
      );
    }
  });

  it("keeps one work per wall when an image is unavailable and rejects overflow", () => {
    expect(exhibitionSlots(0)).toEqual([]);
    for (let count = 1; count <= 8; count++) {
      const slots = exhibitionSlots(count);
      expect(slots).toHaveLength(count);
      expect(new Set(slots.map((s) => s.rotation[1])).size).toBe(count);
    }
    for (const count of [-1, 9, 12, 4.5, NaN])
      expect(() => exhibitionSlots(count)).toThrow();
  });
});
