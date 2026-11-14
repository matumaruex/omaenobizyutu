import type { Selection } from "./types";
import { EXHIBITION_SIZE } from "../config/exhibition";
export function validateSelections(
  selections: Selection[],
  allowedIds: string[],
) {
  return (
    selections.length === EXHIBITION_SIZE &&
    new Set(selections.map((a) => a.id)).size === selections.length &&
    selections.every((a) => allowedIds.includes(a.id))
  );
}
