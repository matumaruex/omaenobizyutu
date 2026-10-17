export const emotions = [
  "solitude",
  "loss",
  "hope",
  "joy",
  "nostalgia",
  "calm",
  "love",
  "conflict",
] as const;
export type Emotion = (typeof emotions)[number];
export type Role = "共鳴" | "別のまなざし" | "偶然の出会い" | "余韻";
export interface Artwork {
  id: number;
  title: string;
  titleJa: string;
  artist: string;
  date: string;
  imageId: string;
  width: number;
  height: number;
  localImage: string;
  publicDomain: true;
  medium: string;
  subjects: string[];
  palette: string[];
  facts: string;
  interpretation: string;
  emotions: Record<Emotion, number>;
  source: string;
  verifiedAt: string;
  metadataSource: string;
  credit: string;
  imageSource: string;
  imageLicense: string;
}
export interface Selection {
  id: number;
  role: Role;
  reason: string;
}
export interface Exhibition {
  title: string;
  atmosphere: string;
  selections: Selection[];
  mode: "demo" | "ai";
  notice?: string;
}
export interface Exhibit extends Selection {
  artwork: Artwork;
  image: HTMLImageElement;
}
export interface Slot {
  position: [number, number, number];
  rotation: [number, number, number];
}
