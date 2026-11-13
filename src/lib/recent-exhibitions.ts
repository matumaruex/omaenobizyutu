// Only artwork IDs, newest exhibition first. No input, titles, or explanations.
export const RECENT_EXHIBITIONS_KEY = "museum-recent-exhibitions-v1";
export const ARTWORK_ID_PATTERN = /^(?:aic|met)-[1-9]\d{0,15}$/;
export const RECENT_EXHIBITIONS_LIMIT = 20;
export const RECENT_WORKS_LIMIT = 8;
export const RECENT_STRONG_LIMIT = 5;

// Only current candidate numbers are sent to the final model, never past input.
export function candidateExposure(
  candidateIds: readonly string[],
  recentExhibitions: unknown,
) {
  const history = normalizeRecentExhibitions(recentExhibitions);
  const recent: number[] = [];
  const earlier: number[] = [];
  const frequent: number[] = [];
  candidateIds.forEach((id, index) => {
    const appearances = history.flatMap((ids, age) =>
      ids.includes(id) ? [age] : [],
    );
    if (!appearances.length) return;
    (appearances[0] < RECENT_STRONG_LIMIT ? recent : earlier).push(index + 1);
    if (appearances.length >= 3) frequent.push(index + 1);
  });
  return {
    ...(recent.length ? { recentlyViewedCandidates: recent } : {}),
    ...(earlier.length ? { earlierViewedCandidates: earlier } : {}),
    ...(frequent.length ? { frequentlyViewedCandidates: frequent } : {}),
  };
}

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
