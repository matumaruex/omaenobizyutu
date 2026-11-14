import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fetchArtworkImage } from "../src/lib/images/fetch";
const bytes = readFileSync("tests/fixtures/aic-27992.jpg");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const image = {
  id: "met-37907",
  url: "https://images.metmuseum.org/original.jpg",
  sha256,
};
const signal = () => new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("retries a bad cached-era response freshly without storing unchecked bytes", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("temporary HTML", { status: 200 }))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  const result = await fetchArtworkImage(image, signal());
  expect(result).toMatchObject({
    bytes,
    fallback: false,
    attempts: 2,
    recoveredFrom: "IMAGE_NOT_JPEG",
  });
  expect(fetch.mock.calls.every(([, init]) => init.cache === "no-store")).toBe(
    true,
  );
});
it("recovers hash mismatch through only the registered same-work standard image", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(bytes))
    .mockResolvedValueOnce(new Response(bytes))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  const result = await fetchArtworkImage(
    {
      ...image,
      sha256: "a".repeat(64),
      fallback: { url: "https://images.metmuseum.org/standard.jpg", sha256 },
    },
    signal(),
  );
  expect(result).toMatchObject({
    fallback: true,
    attempts: 3,
    recoveredFrom: "IMAGE_MISMATCH",
  });
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    image.url,
    image.url,
    "https://images.metmuseum.org/standard.jpg",
  ]);
});
it("does not accept a wrong fallback or loop forever", async () => {
  const fetch = vi.fn(async () => new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  await expect(
    fetchArtworkImage(
      {
        ...image,
        sha256: "a".repeat(64),
        fallback: {
          url: "https://images.metmuseum.org/standard.jpg",
          sha256: "b".repeat(64),
        },
      },
      signal(),
    ),
  ).rejects.toMatchObject({ code: "IMAGE_MISMATCH" });
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("skips retrying a permanent 404 and uses the verified alternate", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  expect(
    await fetchArtworkImage(
      {
        ...image,
        fallback: {
          url: "https://raw.githubusercontent.com/test/standard.jpg",
          sha256,
        },
      },
      signal(),
    ),
  ).toMatchObject({ fallback: true, attempts: 2 });
});
it("does not fetch unapproved redirect hosts or oversized bodies", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://localhost/secret" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(fetchArtworkImage(image, signal())).rejects.toMatchObject({
    code: "INVALID_IMAGE_HOST",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockReset().mockImplementation(
    async () =>
      new Response(bytes, {
        headers: { "content-length": String(33 * 1024 * 1024) },
      }),
  );
  await expect(fetchArtworkImage(image, signal())).rejects.toMatchObject({
    code: "IMAGE_TOO_LARGE",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("cancellation does not start another attempt", async () => {
  const controller = new AbortController();
  const fetch = vi.fn(async () => {
    controller.abort();
    throw Error("cancelled");
  });
  vi.stubGlobal("fetch", fetch);
  await expect(
    fetchArtworkImage(image, controller.signal),
  ).rejects.toMatchObject({ code: "IMAGE_CANCELLED" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("a slow primary times out within the shared budget and recovers", async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  });
  const fetch = vi
    .fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener(
            "abort",
            () => reject(Error("aborted")),
            { once: true },
          ),
        ),
    )
    .mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener(
            "abort",
            () => reject(Error("aborted")),
            { once: true },
          ),
        ),
    )
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  const pending = fetchArtworkImage(image, signal());
  await vi.advanceTimersByTimeAsync(25001);
  expect(await pending).toMatchObject({
    attempts: 2,
    recoveredFrom: "IMAGE_TIMEOUT",
    fallback: false,
  });
});
