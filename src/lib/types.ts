import type { TokenUsage, UsageRecord } from "./usage/types";
export type Role = "共鳴" | "別のまなざし" | "偶然の出会い" | "余韻";
export interface Artwork {
  id: string;
  title: string;
  titleJa: string;
  artist: string;
  date: string;
  width: number;
  height: number;
  localImage: string;
  source: string;
  museum: string;
  medium: string;
  facts: string;
  credit: string;
  imageSource: string;
  imageLicense: string;
  licenseNote: string;
}
export interface Selection {
  id: string;
  role: Role;
  reason: string;
  artwork?: Artwork;
}
export interface Exhibition {
  title: string;
  atmosphere: string;
  selections: Selection[];
  verification: {
    model: string;
    catalogCommit: string;
    candidateCount: number;
    catalogCount: number;
    inputTokens: number | null;
    outputTokens: number | null;
    usage: TokenUsage;
    accounting?: { record: UsageRecord; persisted: boolean };
  };
}
export interface SelectionReview {
  input: string;
  exhibition: Exhibition;
  displayedIds: string[];
}
export interface Exhibit extends Selection {
  artwork: Artwork;
  image: HTMLImageElement;
}
export interface Slot {
  position: [number, number, number];
  rotation: [number, number, number];
}
export interface CatalogMaterial {
  id: string;
  title: string;
  artist: string;
  primary: string[];
  secondary: string[];
  strengths: Partial<Record<string, number>>;
  summary: string;
  fitting: { situation: string; reason: string; strength: number }[];
  cautions: string[];
  meaning: {
    author_intent: {
      status: string;
      summary: string | null;
      source_url: string | null;
    };
    scholarly_interpretation: { summary: string; source_url: string };
    creation_context: string;
    visual_clues: string;
    uncertainty_note: string;
  };
}
export interface CatalogImage {
  id: string;
  url: string;
  sha256: string;
}
export interface Catalog {
  commit: string;
  artworks: Artwork[];
  selection: CatalogMaterial[];
  images: CatalogImage[];
}
