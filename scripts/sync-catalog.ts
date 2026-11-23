import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeCatalog } from "../src/lib/catalog/normalize";
const at = process.argv.indexOf("--source");
const temp = at < 0 ? mkdtempSync(join(tmpdir(), "museum-catalog-")) : null;
try {
  const source = at >= 0 ? process.argv[at + 1] : join(temp!, "source");
  if (temp)
    execFileSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "https://github.com/matumaruex/kaiga-data.git",
        source,
      ],
      { stdio: "inherit" },
    );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: source,
    encoding: "utf8",
  }).trim();
  const read = (path: string) =>
    JSON.parse(
      execFileSync("git", ["show", `${commit}:${path}`], {
        cwd: source,
        encoding: "utf8",
        maxBuffer: 10_000_000,
      }),
    );
  const catalog = normalizeCatalog(
    read("data/artworks.json"),
    read("data/image-sources.json"),
    commit,
  );
  writeFileSync(
    "src/data/catalog-seed.json",
    JSON.stringify(catalog, null, 2) + "\n",
  );
  console.log(
    `Prepared initial cache: ${catalog.artworks.length} works, ${commit}.`,
  );
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
