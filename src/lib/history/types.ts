import type { Role } from "../types";
import type { UsageRecord } from "../usage/types";
export interface SearchTrace {
  catalogCommit: string;
  catalogCount: number;
  taggedCount: number;
  matchingCount: number;
  detectedCategories: string[];
  candidates: {
    id: string;
    title: string;
    artist: string;
    primary: string[];
    secondary: string[];
    matchedTags: string[];
    score: number;
  }[];
}
export interface SavedSelection {
  title: string;
  atmosphere: string;
  works: {
    id: string;
    title: string;
    titleJa: string;
    artist: string;
    role: Role;
    reason: string;
  }[];
}
export interface SelectionHistory {
  input: string;
  search?: SearchTrace;
  selection?: SavedSelection;
  display?: { displayedIds: string[]; reportedAt: string };
}
export interface HistoryEntry {
  accounting: UsageRecord;
  history: SelectionHistory | null;
}
export interface HistoryReport {
  calls: number;
  offset: number;
  limit: number;
  entries: HistoryEntry[];
}
