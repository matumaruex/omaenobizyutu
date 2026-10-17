import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const artworks = JSON.parse(await readFile("src/data/collection.json", "utf8"));
for (const artwork of artworks) {
  const image = await readFile(path.join(root, "public", artwork.localImage));
  artwork.localImage = `data:image/jpeg;base64,${image.toString("base64")}`;
}
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Museum from './src/components/Museum';
import { createDemoExhibition } from './src/lib/curation';
// This portable preview uses the same demo curator entirely in the browser.
window.fetch = async (input, init) => {
  const url = String(input);
  if (url === '/api/config') return Response.json({ aiAvailable: false });
  if (url === '/api/exhibition') {
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { text } = JSON.parse(init.body);
    return Response.json(createDemoExhibition(text));
  }
  throw new Error('この確認用デモでは外部通信は利用しません。');
};
const root = createRoot(document.getElementById('root'));
let version = 0;
const show = () => root.render(<Museum key={version++} />);
show();
document.addEventListener('click', event => {
  if (event.target.closest?.('a[href="/"]')) { event.preventDefault(); show(); }
});
`;
const output = await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "portable-demo.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  minify: true,
  platform: "browser",
  format: "iife",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "standalone-preview",
      setup(api) {
        api.onResolve({ filter: /^next\/dynamic$/ }, () => ({
          path: "dynamic",
          namespace: "portable",
        }));
        api.onLoad({ filter: /.*/, namespace: "portable" }, () => ({
          contents: `import React, {lazy,Suspense} from 'react'; export default function dynamic(loader,options={}){const Lazy=lazy(loader);return function Dynamic(props){return React.createElement(Suspense,{fallback:options.loading?React.createElement(options.loading):null},React.createElement(Lazy,props));}}`,
          loader: "js",
          resolveDir: root,
        }));
        api.onLoad({ filter: /src\/data\/collection\.json$/ }, () => ({
          contents: JSON.stringify(artworks),
          loader: "json",
        }));
      },
    },
  ],
});
const js = output.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = await readFile("src/app/globals.css", "utf8");
const html = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>余白の美術館 — 確認用デモ</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/yohaku-demo.html", html);
console.log(
  `Portable demo created (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB). No API key, installation or server required.`,
);
