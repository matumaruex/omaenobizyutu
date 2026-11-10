import { it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import seed from "../src/data/catalog-seed.json";
vi.mock("../src/lib/catalog/server", () => ({
  getRevisionCatalog: async (commit: string) => {
    if (commit !== seed.commit) throw Error("invalid revision");
    return seed;
  },
}));
import { GET } from "../src/app/api/artwork/[id]/route";
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const url = `http://localhost/api/artwork/aic-27992?revision=${seed.commit}&v=${seed.images.find((a) => a.id === "aic-27992")!.sha256.slice(0, 16)}`;
it("serves only the DB hash-matched JPEG, with immutable versioned caching", async () => {
  const bytes = readFileSync("tests/fixtures/aic-27992.jpg");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(bytes, { headers: { "Content-Type": "image/jpeg" } }),
    ),
  );
  const r = await GET(new Request(url), {
    params: Promise.resolve({ id: "aic-27992" }),
  });
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("immutable");
  expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);
});
it("rejects mismatched bytes and unknown IDs", async () => {
  const mock = vi.fn(async () => new Response("wrong bytes"));
  vi.stubGlobal("fetch", mock);
  expect(
    (
      await GET(new Request(url), {
        params: Promise.resolve({ id: "aic-27992" }),
      })
    ).status,
  ).toBe(502);
  expect(
    (
      await GET(new Request(url), {
        params: Promise.resolve({ id: "met-9999999" }),
      })
    ).status,
  ).toBe(404);
  expect(mock).toHaveBeenCalledTimes(2);
});
it("refuses redirects outside allowed image hosts", async () => {
  const mock = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
  );
  vi.stubGlobal("fetch", mock);
  expect(
    (
      await GET(new Request(url), {
        params: Promise.resolve({ id: "aic-27992" }),
      })
    ).status,
  ).toBe(502);
  expect(mock).toHaveBeenCalledTimes(1);
});

it("exposes safe upstream diagnostics without response text or URLs", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("private provider text", { status: 403 })),
  );
  const r = await GET(new Request(url), {
    params: Promise.resolve({ id: "aic-27992" }),
  });
  expect(r.status).toBe(502);
  expect(r.headers.get("X-Artwork-Error")).toBe("IMAGE_UNAVAILABLE");
  expect(r.headers.get("X-Artwork-Upstream-Status")).toBe("403");
  expect(console.warn).toHaveBeenCalledWith(
    "artwork_fetch_failed",
    expect.objectContaining({ id: "aic-27992", upstreamStatus: 403 }),
  );
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
    "private provider text",
  );
});

it("caches a verified standard fallback briefly so original quality can recover", async () => {
  const image = seed.images.find((a) => a.id === "met-37907")!;
  const originalFallback = image.fallback;
  const bytes = readFileSync("tests/fixtures/aic-27992.jpg");
  const sha256 = seed.images.find((a) => a.id === "aic-27992")!.sha256;
  image.fallback = { url: "https://images.metmuseum.org/standard.jpg", sha256 };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes)),
  );
  try {
    const r = await GET(
      new Request(
        `http://localhost/api/artwork/met-37907?revision=${seed.commit}&v=${image.sha256.slice(0, 16)}`,
      ),
      { params: Promise.resolve({ id: image.id }) },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Artwork-Quality")).toBe("standard");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(r.headers.get("CDN-Cache-Control")).toBe("public, s-maxage=60");
    expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);
  } finally {
    image.fallback = originalFallback;
  }
});
