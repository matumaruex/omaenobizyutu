import { describe, expect, it } from "vitest";
import {
  candidateExposure,
  createRecentExhibitionsStore,
  normalizeRecentExhibitions,
  RECENT_EXHIBITIONS_KEY,
} from "../src/lib/recent-exhibitions";

describe("browser-local recent exhibitions", () => {
  it("stores only IDs, keeps the latest twenty exhibitions, and survives a fresh instance", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const a = createRecentExhibitionsStore(() => storage);
    for (let i = 1; i <= 23; i++)
      a.remember([`met-${i}`, `met-${i}`, "入力文", "aic-12"]);
    expect(a.read()).toEqual(
      Array.from({ length: 20 }, (_, i) => 23 - i).map((i) => [
        `met-${i}`,
        "aic-12",
      ]),
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
    ).toEqual([[], ["met-2"], ...Array(18).fill(["aic-3"])]);
    expect(
      normalizeRecentExhibitions([
        Array.from({ length: 20 }, (_, i) => `met-${i + 1}`),
      ])[0],
    ).toHaveLength(8);
  });
});

describe("bounded exposure metadata", () => {
  it("keeps old five-entry storage and accepts twenty full, longest-ID groups", () => {
    let raw = JSON.stringify(
      Array.from({ length: 5 }, (_, i) => [`met-${i + 1}`]),
    );
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const store = createRecentExhibitionsStore(() => storage);
    expect(store.read()).toHaveLength(5);
    store.remember(["aic-20"]);
    expect(store.read().slice(1)).toEqual(
      Array.from({ length: 5 }, (_, i) => [`met-${i + 1}`]),
    );
    const full = Array.from({ length: 20 }, (_, i) =>
      Array.from(
        { length: 8 },
        (_, j) => `met-${1000000000000000 + i * 8 + j}`,
      ),
    );
    raw = JSON.stringify(full);
    expect(raw.length).toBeLessThanOrEqual(5000);
    expect(createRecentExhibitionsStore(() => storage).read()).toEqual(full);
  });
  it("sends only candidate numbers, separates recent/older and counts exhibitions not duplicate IDs", () => {
    const history = Array.from({ length: 21 }, () => [] as string[]);
    history[0] = ["met-1", "met-1", "met-99"];
    history[4] = ["met-2"];
    history[5] = ["met-2", "met-3"];
    history[19] = ["met-2", "met-3", "met-4"];
    history[20] = ["met-5"];
    expect(
      candidateExposure(
        ["met-4", "met-2", "met-1", "met-3", "met-5", "met-6"],
        history,
      ),
    ).toEqual({
      recentlyViewedCandidates: [2, 3],
      earlierViewedCandidates: [1, 4],
      frequentlyViewedCandidates: [2],
    });
    expect(candidateExposure(["met-1"], [])).toEqual({});
  });
});
