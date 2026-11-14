import { normalizeCatalog } from "./normalize";
const repository = "matumaruex/kaiga-data";
async function json(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !response.body) throw Error("CATALOG_UNAVAILABLE");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8_000_000) {
      await reader.cancel();
      throw Error("CATALOG_TOO_LARGE");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function readHead() {
  const data = await json(
    `https://api.github.com/repos/${repository}/commits/main`,
  );
  if (!/^[a-f0-9]{40}$/.test(data.sha)) throw Error("INVALID_CATALOG_REVISION");
  return data.sha as string;
}
export async function readRevision(commit: string) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("INVALID_CATALOG_REVISION");
  const base = `https://raw.githubusercontent.com/${repository}/${commit}/data`;
  const [raw, images] = await Promise.all([
    json(`${base}/artworks.json`),
    json(`${base}/image-sources.json`),
  ]);
  return normalizeCatalog(raw, images, commit);
}
