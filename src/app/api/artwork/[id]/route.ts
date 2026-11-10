import { fetchArtworkImage, ImageFailure } from "@/lib/images/fetch";
import { getRevisionCatalog } from "@/lib/catalog/server";
export const runtime = "nodejs";
export const maxDuration = 60;
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
  const started = Date.now();
  try {
    const { bytes, fallback, attempts, recoveredFrom } =
      await fetchArtworkImage(image, request.signal);
    if (attempts > 1)
      console.info("artwork_fetch_recovered", {
        id,
        fallback,
        attempts,
        recoveredFrom,
        elapsedMs: Date.now() - started,
      });
    // Stream the already hash-verified bytes, rather than returning a large
    // buffered Response. Vercel allows streaming responses beyond its
    // ordinary 4.5MB Function response-payload limit.
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 64 * 1024, bytes.length);
        controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
        offset = end;
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": fallback
          ? "public, max-age=60"
          : version
            ? "public, max-age=31536000, immutable"
            : "public, max-age=86400",
        "CDN-Cache-Control": fallback
          ? "public, s-maxage=60"
          : "public, s-maxage=86400",
        "X-Artwork-Quality": fallback ? "standard" : "original",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const failure =
      error instanceof ImageFailure ? error : new ImageFailure("FETCH_FAILED");
    const stage = failure.code,
      upstreamStatus = failure.upstreamStatus;
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
