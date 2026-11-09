import { describe, expect, it } from "vitest";
import {
  createRecentExhibitionsStore,
  normalizeRecentExhibitions,
  RECENT_EXHIBITIONS_KEY,
} from "../src/lib/recent-exhibitions";

describe("browser-local recent exhibitions", () => {
  it("stores only IDs, keeps the latest five exhibitions, and survives a fresh instance", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const a = createRecentExhibitionsStore(() => storage);
    for (let i = 1; i <= 7; i++)
      a.remember([`met-${i}`, `met-${i}`, "入力文", "aic-12"]);
    expect(a.read()).toEqual(
      [7, 6, 5, 4, 3].map((i) => [`met-${i}`, "aic-12"]),
    );
    expect(createRecentExhibitionsStore(() => storage).read()).toEqual(
      a.read(),
    );
    expect(values.size).toBe(1);
    expect(values.get(RECENT_EXHIBITIONS_KEY)).not.toContain("入力文");
    const b = createRecentExhibitionsStore(() => ({
      getItem: () => null,
      setItem: () => {},
    }));
    expect(b.read()).toEqual([]);
  });
  it.each(["access", "write"])(
    "retains session history when storage %s is denied",
    (mode) => {
      const store = createRecentExhibitionsStore(() => {
        if (mode === "access") throw Error("blocked");
        return {
          getItem: () => null,
          setItem: () => {
            throw Error("quota");
          },
        };
      });
      expect(store.read()).toEqual([]);
      store.remember(["met-1"]);
      store.remember(["met-2"]);
      expect(store.read()).toEqual([["met-2"], ["met-1"]]);
    },
  );
  it("ignores malformed storage and bounds all groups while preserving their age", () => {
    const store = createRecentExhibitionsStore(() => ({
      getItem: () => "broken{",
      setItem: () => {},
    }));
    expect(store.read()).toEqual([]);
    store.remember(["met-1"]);
    expect(store.read()).toEqual([["met-1"]]);
    expect(
      normalizeRecentExhibitions([
        null,
        ["bad", "met-2", "met-2"],
        ...Array(20).fill(["aic-3"]),
      ]),
    ).toEqual([[], ["met-2"], ["aic-3"], ["aic-3"], ["aic-3"]]);
    expect(
      normalizeRecentExhibitions([
        Array.from({ length: 20 }, (_, i) => `met-${i + 1}`),
      ])[0],
    ).toHaveLength(8);
  });
});
