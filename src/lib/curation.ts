import type { Selection } from "./types";
export function validateSelections(
  selections: Selection[],
  allowedIds: string[],
) {
  return (
    selections.length >= 4 &&
    selections.length <= 12 &&
    new Set(selections.map((a) => a.id)).size === selections.length &&
    selections.every((a) => allowedIds.includes(a.id))
  );
}
