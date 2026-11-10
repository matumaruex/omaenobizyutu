import { unstable_cache } from "next/cache";
import { after } from "next/server";
import seedData from "@/data/catalog-seed.json";
import type { Catalog } from "../types";
import { readHead, readRevision } from "./remote";
export const initialCatalog = seedData as Catalog;
const readCachedRevision = unstable_cache(
  readRevision,
  ["kaiga-data-revision-v2-image-fallback"],
  { revalidate: false },
);
export async function getRevisionCatalog(commit: string) {
  return commit === initialCatalog.commit
    ? initialCatalog
    : readCachedRevision(commit);
}
// Only complete, validated catalogs enter the shared Data Cache. Failed refreshes
// throw, so Next's time-based stale-while-revalidate keeps the previous good value.
const latest = unstable_cache(
  async () => getRevisionCatalog(await readHead()),
  // A refreshed bundled snapshot must not reuse an older deployment's cache.
  ["kaiga-data-latest-v2-image-fallback", initialCatalog.commit],
  { revalidate: 86400 },
);
export async function getCatalog() {
  const pending = latest();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 150);
  });
  try {
    const cached = await Promise.race([pending, timeout]);
    if (cached) return cached;
    // A cold cache is filled after the response; this request uses an initial
    // snapshot of the SAME GitHub DB, never a legacy catalog or local curator.
    after(async () => {
      await pending.catch(() => {});
    });
    return initialCatalog;
  } catch {
    return initialCatalog;
  } finally {
    clearTimeout(timer);
  }
}
// Warm the shared cache during prerender so first visitors normally find it ready.
export async function primeCatalog() {
  try {
    await latest();
  } catch {
    /* GitHub unavailable: initial DB snapshot is ready. */
  }
}
