import { createHash } from "node:crypto";
import { imageHosts } from "../catalog/normalize";
import type { CatalogImage } from "../types";

type Source = Pick<CatalogImage, "url" | "sha256">;
export class ImageFailure extends Error {
  constructor(
    public code: string,
    public upstreamStatus?: number,
  ) {
    super(code);
  }
}
function allowed(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    imageHosts.has(url.hostname)
  );
}
async function verifiedBytes(source: Source, signal: AbortSignal) {
  let url = new URL(source.url);
  let response: Response | undefined;
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!allowed(url)) throw new ImageFailure("INVALID_IMAGE_HOST");
    response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: "image/jpeg" },
      // Never retain an unverified 200 response (HTML, truncated or changed
      // image) in Next's Data Cache. Only verified output enters the CDN.
      cache: "no-store",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirect === 3)
      throw new ImageFailure("INVALID_REDIRECT", response.status);
    url = new URL(location, url);
  }
  if (!response?.ok || !response.body) {
    await response?.body?.cancel();
    throw new ImageFailure("IMAGE_UNAVAILABLE", response?.status);
  }
  const limit = 32 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body.cancel();
    throw new ImageFailure("IMAGE_TOO_LARGE", response.status);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit)
        throw new ImageFailure("IMAGE_TOO_LARGE", response.status);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof ImageFailure
      ? error
      : new ImageFailure(
          signal.aborted ? "IMAGE_TIMEOUT" : "BODY_FAILED",
          response.status,
        );
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new ImageFailure("IMAGE_NOT_JPEG", response.status);
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw new ImageFailure("IMAGE_MISMATCH", response.status);
  return bytes;
}
function retryable(error: ImageFailure) {
  return (
    [
      "FETCH_FAILED",
      "BODY_FAILED",
      "IMAGE_TIMEOUT",
      "IMAGE_NOT_JPEG",
      "IMAGE_MISMATCH",
    ].includes(error.code) ||
    (error.code === "IMAGE_UNAVAILABLE" &&
      (error.upstreamStatus === 408 ||
        error.upstreamStatus === 429 ||
        (error.upstreamStatus ?? 0) >= 500))
  );
}
export async function fetchArtworkImage(
  image: CatalogImage,
  requestSignal: AbortSignal,
) {
  const overall = AbortSignal.any([requestSignal, AbortSignal.timeout(45000)]);
  const attempts: { source: Source; fallback: boolean; timeout: number }[] = [
    { source: image, fallback: false, timeout: 25000 },
    { source: image, fallback: false, timeout: image.fallback ? 8000 : 18000 },
    ...(image.fallback
      ? [{ source: image.fallback, fallback: true, timeout: 10000 }]
      : []),
  ];
  let failure = new ImageFailure("FETCH_FAILED");
  let count = 0;
  for (const attempt of attempts) {
    if (overall.aborted) break;
    // Permanent source failures go straight to the separately verified copy.
    if (count && !attempt.fallback && !retryable(failure)) continue;
    count++;
    const signal = AbortSignal.any([
      overall,
      AbortSignal.timeout(attempt.timeout),
    ]);
    try {
      const bytes = await verifiedBytes(attempt.source, signal);
      return {
        bytes,
        fallback: attempt.fallback,
        attempts: count,
        recoveredFrom: count > 1 ? failure.code : undefined,
      };
    } catch (error) {
      failure =
        error instanceof ImageFailure
          ? error
          : new ImageFailure(signal.aborted ? "IMAGE_TIMEOUT" : "FETCH_FAILED");
    }
  }
  if (requestSignal.aborted) throw new ImageFailure("IMAGE_CANCELLED");
  throw failure;
}
