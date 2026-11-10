import type { Artwork, Slot } from "./types";
import { EXHIBITION_SIZE } from "../config/exhibition";
const wallDistance = 3.6;
export const ROOM = {
  wallCount: EXHIBITION_SIZE,
  wallDistance,
  wallWidth: 2 * wallDistance * Math.tan(Math.PI / EXHIBITION_SIZE),
  floorRadius: wallDistance / Math.cos(Math.PI / EXHIBITION_SIZE),
  height: 4.1,
  eye: 1.8,
  horizontalFov: 75,
  lookLimit: 1.2,
};
export const FRAME = { mat: 0.075, rail: 0.026 };
export const FRAME_BORDER = (FRAME.mat + FRAME.rail) * 2;

// Three.js takes a vertical FOV. Preserve the horizontal composition on phones:
// show roughly one third of each neighboring facet with less edge stretching.
// A minimum vertical field keeps tall frames visible on very wide screens.
export function roomVerticalFov(aspect: number) {
  return Math.max(
    50,
    (2 *
      Math.atan(Math.tan((ROOM.horizontalFov * Math.PI) / 360) / aspect) *
      180) /
      Math.PI,
  );
}
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
  // Fit the framed work to the wall, preserving the original image ratio.
  // Very tall works use the height limit rather than being cropped or stretched.
  const maxWidth = ROOM.wallWidth * 0.78 - FRAME_BORDER;
  const maxHeight = 3 - FRAME_BORDER;
  const height = Math.min(maxHeight, maxWidth / ratio);
  return { width: height * ratio, height };
}
