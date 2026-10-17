import data from "@/data/collection.json";
import type { Artwork } from "./types";
export const collection = data as Artwork[];
export function artworkById(id: number) {
  return collection.find((a) => a.id === id);
}
export function iiifImage(art: Artwork, width = 1200) {
  return `https://www.artic.edu/iiif/2/${encodeURIComponent(art.imageId)}/full/${width},/0/default.jpg`;
}
