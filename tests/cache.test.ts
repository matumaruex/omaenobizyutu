import { it, expect, vi, afterEach } from "vitest";
import seed from "../src/data/catalog-seed.json";
const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  revision: vi.fn(),
  after: vi.fn(),
  options: [] as unknown[],
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown, keys: unknown, options: unknown) => {
    mocks.options.push({ keys, options });
    return fn;
  },
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../src/lib/catalog/remote", () => ({
  readHead: mocks.head,
  readRevision: mocks.revision,
}));
import { getCatalog } from "../src/lib/catalog/server";
afterEach(() => {
  vi.useRealTimers();
  mocks.head.mockReset();
  mocks.revision.mockReset();
  mocks.after.mockReset();
});
it("configures a day-long shared cache, and immutable revision caches", () => {
  expect(mocks.options).toContainEqual({
    keys: ["kaiga-data-latest-v1"],
    options: { revalidate: 86400 },
  });
  expect(mocks.options).toContainEqual({
    keys: ["kaiga-data-revision-v1"],
    options: { revalidate: false },
  });
});
it("returns a ready cache value and a failed refresh never substitutes legacy artwork", async () => {
  mocks.head.mockResolvedValue(seed.commit);
  expect((await getCatalog()).artworks).toHaveLength(200);
  mocks.head.mockRejectedValue(Error("GitHub unavailable"));
  expect((await getCatalog()).commit).toBe(seed.commit);
  expect(
    (await getCatalog()).artworks.every(
      (a) => a.id.startsWith("aic-") || a.id.startsWith("met-"),
    ),
  ).toBe(true);
});
it("does not wait for a cold remote fetch, and retains the job after the response", async () => {
  vi.useFakeTimers();
  let resolve!: (commit: string) => void;
  mocks.head.mockImplementation(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  const pending = getCatalog();
  await vi.advanceTimersByTimeAsync(151);
  const initial = await pending;
  expect(initial.commit).toBe(seed.commit);
  expect(mocks.after).toHaveBeenCalledTimes(1);
  mocks.revision.mockResolvedValue({ ...seed, commit: "b".repeat(40) });
  resolve("b".repeat(40));
  await mocks.after.mock.calls[0][0]();
  expect(mocks.revision).toHaveBeenCalledWith("b".repeat(40));
});
