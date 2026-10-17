import type { Artwork, Slot } from "./types";
export const ROOM = {
  halfWidth: 10,
  halfDepth: 10,
  height: 5.8,
  eye: 1.65,
  margin: 0.45,
};
// Each slot has its own 4m wall interval. Maximum framed width is 2.9m.
export function exhibitionSlots(count: number): Slot[] {
  if (!Number.isInteger(count) || count < 0 || count > 12)
    throw new Error("展示数は0〜12です");
  const slots: Slot[] = [];
  const xs = [0, -5.5, 5.5];
  for (const x of xs)
    slots.push({ position: [x, 2.2, -9.85], rotation: [0, 0, 0] });
  for (const z of [-5.5, 0, 5.5])
    slots.push({ position: [9.85, 2.2, z], rotation: [0, -Math.PI / 2, 0] });
  for (const z of [-5.5, 0, 5.5])
    slots.push({ position: [-9.85, 2.2, z], rotation: [0, Math.PI / 2, 0] });
  for (const x of xs)
    slots.push({ position: [x, 2.2, 9.85], rotation: [0, Math.PI, 0] });
  return slots.slice(0, count);
}
export function paintingSize(art: Pick<Artwork, "width" | "height">) {
  const ratio = art.width / art.height;
  const height = Math.min(2.4, 2.8 / ratio);
  return { width: height * ratio, height };
}
export function constrainPosition(x: number, z: number) {
  const limit = ROOM.halfWidth - ROOM.margin;
  return [
    Math.max(-limit, Math.min(limit, x)),
    Math.max(-limit, Math.min(limit, z)),
  ] as const;
}
