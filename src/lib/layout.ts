import type { Artwork, Slot } from "./types";
import { EXHIBITION_SIZE } from "../config/exhibition";
const wallDistance = 6.2;
export const ROOM = {
  wallCount: EXHIBITION_SIZE,
  wallDistance,
  wallWidth: 2 * wallDistance * Math.tan(Math.PI / EXHIBITION_SIZE),
  floorRadius: wallDistance / Math.cos(Math.PI / EXHIBITION_SIZE),
  height: 4.1,
  eye: 1.65,
  fov: 58,
  lookLimit: 1.2,
};
// Shared wall centers and inward-facing rotations keep frames and architecture
// aligned. The first wall is straight ahead; the rest follow clockwise.
export const ROOM_WALLS: Slot[] = Array.from(
  { length: ROOM.wallCount },
  (_, index) => {
    const angle = (index * Math.PI * 2) / ROOM.wallCount;
    return {
      position: [
        Math.sin(angle) * ROOM.wallDistance,
        ROOM.height / 2,
        -Math.cos(angle) * ROOM.wallDistance,
      ],
      rotation: [0, -angle, 0],
    };
  },
);

// A missing image leaves fewer works, but never puts two works on one wall.
export function exhibitionSlots(count: number): Slot[] {
  if (!Number.isInteger(count) || count < 0 || count > EXHIBITION_SIZE)
    throw new Error(`展示数は0〜${EXHIBITION_SIZE}です`);
  const distance = ROOM.wallDistance - 0.08;
  return ROOM_WALLS.slice(0, count).map((wall) => ({
    position: [
      (wall.position[0] / ROOM.wallDistance) * distance,
      ROOM.eye,
      (wall.position[2] / ROOM.wallDistance) * distance,
    ],
    rotation: [...wall.rotation],
  }));
}
export function paintingSize(art: Pick<Artwork, "width" | "height">) {
  const ratio = art.width / art.height;
  const height = Math.min(2.4, 2.8 / ratio);
  return { width: height * ratio, height };
}
