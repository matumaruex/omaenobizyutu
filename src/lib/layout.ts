import type { Artwork, Slot } from "./types";
export const SPHERE = {
  radius: 6.8,
  lookLimit: Math.PI / 2 - 0.015,
};
// Reveal the front first, then above, below and behind. Every supported count
// includes both hemispheres; the fixed positions keep re-curation predictable.
const directions = [
  [0, 0],
  [-18, 35],
  [18, -35],
  [180, 0],
  [-90, -20],
  [90, 20],
  [135, 55],
  [-135, -55],
  [0, 80],
  [0, -80],
  [-145, 35],
  [145, -35],
];
export function exhibitionSlots(count: number): Slot[] {
  if (!Number.isInteger(count) || count < 0 || count > 12)
    throw new Error("展示数は0〜12です");
  return directions.slice(0, count).map(([azimuth, elevation]) => {
    const a = (azimuth * Math.PI) / 180,
      e = (elevation * Math.PI) / 180;
    return {
      position: [
        Math.sin(a) * Math.cos(e) * SPHERE.radius,
        Math.sin(e) * SPHERE.radius,
        -Math.cos(a) * Math.cos(e) * SPHERE.radius,
      ],
      // Read as YXZ by the scene: the image's front faces the viewer at origin.
      rotation: [e, -a, 0],
    };
  });
}
export function paintingSize(art: Pick<Artwork, "width" | "height">) {
  const ratio = art.width / art.height;
  const height = Math.min(2.4, 2.8 / ratio);
  return { width: height * ratio, height };
}
