import type { Artwork, Slot } from "./types";
export const ROOM = {
  halfWidth: 6.2,
  halfDepth: 6.2,
  height: 4.1,
  eye: 1.65,
  fov: 58,
  lookLimit: 1.2,
};
// Fill all four walls before adding a second work to any wall. From the fixed
// center, works on the side and rear walls are discovered by turning around.
export function exhibitionSlots(count: number): Slot[] {
  if (!Number.isInteger(count) || count < 0 || count > 12)
    throw new Error("展示数は0〜12です");
  const slots: Slot[] = [];
  for (const offset of [0, -3.8, 3.8]) {
    slots.push({
      position: [offset, ROOM.eye, -ROOM.halfDepth + 0.08],
      rotation: [0, 0, 0],
    });
    slots.push({
      position: [ROOM.halfWidth - 0.08, ROOM.eye, offset],
      rotation: [0, -Math.PI / 2, 0],
    });
    slots.push({
      position: [-offset, ROOM.eye, ROOM.halfDepth - 0.08],
      rotation: [0, Math.PI, 0],
    });
    slots.push({
      position: [-ROOM.halfWidth + 0.08, ROOM.eye, -offset],
      rotation: [0, Math.PI / 2, 0],
    });
  }
  return slots.slice(0, count);
}
export function paintingSize(art: Pick<Artwork, "width" | "height">) {
  const ratio = art.width / art.height;
  const height = Math.min(2.4, 2.8 / ratio);
  return { width: height * ratio, height };
}
