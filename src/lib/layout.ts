import type { Artwork, Slot } from "./types";
export const FIELD = { fov: 50, nearest: 5, padding: 2 };
const positions: [number, number, number][] = [
  [-2, 1.3, 0.6],
  [2.1, 1.8, -0.2],
  [-1.7, -2.8, -0.55],
  [2.7, -2.1, 0.25],
  [-5.8, -0.7, -0.3],
  [6.4, 0.7, -0.7],
  [-0.4, 5.3, -0.65],
  [0.2, -6.2, -0.85],
  [-4.6, 4.5, -0.45],
  [4.4, 5.2, -0.5],
  [-5.7, -5.1, -0.9],
  [5.1, -5.8, -0.4],
];
const tilts = [
  -0.04, 0.05, 0.025, -0.035, -0.04, 0.045, -0.035, 0.04, 0.02, -0.05, 0.04,
  -0.03,
];
export function exhibitionSlots(count: number): Slot[] {
  if (!Number.isInteger(count) || count < 0 || count > 12)
    throw new Error("展示数は0〜12です");
  return positions.slice(0, count).map((position, i) => ({
    position: [...position],
    rotation: [0, 0, tilts[i]],
  }));
}
export function paintingSize(art: Pick<Artwork, "width" | "height">) {
  const ratio = art.width / art.height;
  const height = Math.min(2.4, 2.8 / ratio);
  return { width: height * ratio, height };
}
// Fit every work with room for the small UI. The same cloud is used on phones
// and desktops; only the initial viewing distance adapts to the screen.
export function fieldOverview(count: number, aspect: number) {
  const slots = exhibitionSlots(count || 4);
  const xs = slots.map((s) => s.position[0]),
    ys = slots.map((s) => s.position[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const halfWidth = (maxX - minX) / 2 + FIELD.padding;
  const halfHeight = (maxY - minY) / 2 + FIELD.padding;
  const tangent = Math.tan((FIELD.fov * Math.PI) / 360);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z:
      Math.max(9, halfHeight / tangent, halfWidth / (tangent * aspect)) * 1.15 +
      1,
    halfWidth,
    halfHeight,
  };
}
