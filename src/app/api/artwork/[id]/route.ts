import { createHash } from "node:crypto";
import { getRevisionCatalog } from "@/lib/catalog/server";
export const runtime = "nodejs";
export const maxDuration = 30;
const allowedHosts = new Set([
  "images.metmuseum.org",
  "thumb.wikimedia.org",
  "upload.wikimedia.org",
  "raw.githubusercontent.com",
]);
function allowed(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    allowedHosts.has(url.hostname)
  );
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const revision = new URL(request.url).searchParams.get("revision");
  if (!revision || !/^[a-f0-9]{40}$/.test(revision))
    return new Response(null, { status: 404 });
  let catalog;
  try {
    catalog = await getRevisionCatalog(revision);
  } catch {
    return new Response(null, { status: 502 });
  }
  const image = catalog.images.find((a) => a.id === id);
  if (!image) return new Response(null, { status: 404 });
  const version = new URL(request.url).searchParams.get("v");
  if (version && version !== image.sha256.slice(0, 16))
    return new Response(null, { status: 404 });
  let upstreamStatus: number | undefined;
  let stage = "FETCH_FAILED";
  const started = Date.now();
  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(20000),
    ]);
    let url = new URL(image.url),
      response: Response | undefined;
    for (let redirect = 0; redirect <= 3; redirect++) {
      if (!allowed(url)) {
        stage = "INVALID_IMAGE_HOST";
        throw Error();
      }
      response = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "force-cache",
        next: { revalidate: 86400 },
      });
      upstreamStatus = response.status;
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw Error("INVALID_REDIRECT");
      url = new URL(location, url);
    }
    if (!response?.ok || !response.body) {
      stage = "IMAGE_UNAVAILABLE";
      throw Error();
    }
    stage = "BODY_FAILED";
    const limit = 8 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body.cancel();
      stage = "IMAGE_TOO_LARGE";
      throw Error();
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        stage = "IMAGE_TOO_LARGE";
        throw Error();
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    stage = "IMAGE_MISMATCH";
    if (
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      createHash("sha256").update(bytes).digest("hex") !== image.sha256
    )
      throw Error("IMAGE_MISMATCH");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": version
          ? "public, max-age=31536000, immutable"
          : "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Only stable diagnostic fields; never log the request URL, image bytes,
    // cookies, keys or arbitrary upstream error/response text.
    console.warn("artwork_fetch_failed", {
      id,
      sourceHost: new URL(image.url).hostname,
      code: stage,
      upstreamStatus,
      elapsedMs: Date.now() - started,
    });
    return new Response(null, {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
        "X-Artwork-Error": stage,
        ...(upstreamStatus
          ? { "X-Artwork-Upstream-Status": String(upstreamStatus) }
          : {}),
      },
    });
  }
}
