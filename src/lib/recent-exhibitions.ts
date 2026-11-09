// Only artwork IDs, newest exhibition first. No input, titles, or explanations.
export const RECENT_EXHIBITIONS_KEY = "museum-recent-exhibitions-v1";
export const ARTWORK_ID_PATTERN = /^(?:aic|met)-[1-9]\d{0,15}$/;
export const RECENT_EXHIBITIONS_LIMIT = 5;
export const RECENT_WORKS_LIMIT = 8;

export function normalizeRecentExhibitions(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, RECENT_EXHIBITIONS_LIMIT)
    .map((group) =>
      Array.isArray(group)
        ? [
            ...new Set(
              group
                .slice(0, RECENT_WORKS_LIMIT)
                .filter(
                  (id): id is string =>
                    typeof id === "string" && ARTWORK_ID_PATTERN.test(id),
                ),
            ),
          ]
        : [],
    );
}

export function createRecentExhibitionsStore(
  getStorage: () => Pick<Storage, "getItem" | "setItem"> = () =>
    window.localStorage,
) {
  let memory: string[][] = [];
  let unavailable = false;
  function read() {
    try {
      if (unavailable) return memory.map((ids) => [...ids]);
      const raw = getStorage().getItem(RECENT_EXHIBITIONS_KEY);
      // Bounded parsing even if another script/extension changes local storage.
      memory =
        raw && raw.length <= 5000
          ? normalizeRecentExhibitions(JSON.parse(raw))
          : [];
    } catch {
      // Private mode / blocked or corrupt storage must not prevent selection.
      unavailable = true;
    }
    return memory.map((ids) => [...ids]);
  }
  return {
    read,
    remember(ids: string[]) {
      const group = normalizeRecentExhibitions([ids])[0];
      if (!group?.length) return;
      memory = [group, ...read()].slice(0, RECENT_EXHIBITIONS_LIMIT);
      try {
        getStorage().setItem(RECENT_EXHIBITIONS_KEY, JSON.stringify(memory));
      } catch {
        unavailable = true; /* Keep history for this visit. */
      }
    },
  };
}
