import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { compileLibrary, reviewRegistry } from "./library-data.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  dist = path.join(root, "dist");
const library = await compileLibrary(root),
  records = library.items,
  works = [...reviewRegistry(library).values()];
const referenced = new Set(
    [...records, ...library.seeds].map((i) => i.image).filter(Boolean),
  ),
  activeVideos = new Set(works.flatMap((i) => i.videoIds));
// HDrezka is the offline review source. YouTube comments are read on demand
// through their adapter; raw research snapshots are not deployment assets.
const workRanks = new Set(records.map((item) => item.rank));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const assets = {};
const assetTypes = [...new Set([...Object.values(types), "application/octet-stream"])];
const sourceOnly = new Set([
  "catalog.json",
  "personal-candidates.json",
  "papich-series.json",
  "taste-seeds.json",
  "review-sources.json",
]);
const BASE85 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
function encodeBinary(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 4) {
    let value = 0;
    for (let j = 0; j < 4; j++) value = value * 256 + (bytes[i + j] || 0);
    const digits = Array(5);
    for (let j = 4; j >= 0; j--) { digits[j] = BASE85[value % 85]; value = Math.floor(value / 85); }
    parts.push(digits.join(""));
  }
  return parts.join("");
}
function addAsset(name, input) {
  const ext = path.extname(name),
    binary = ![".html", ".js", ".css", ".json", ".svg"].includes(ext);
  let bytes = Buffer.from(input);
  if (ext === ".json")
    bytes = Buffer.from(JSON.stringify(JSON.parse(bytes.toString("utf8"))));
  // Compact manifest: MIME index, encoding flags, body, content hash, optional byte length.
  assets[name] = [
    assetTypes.indexOf(types[ext] || "application/octet-stream"),
    binary ? 5 : 2,
    binary ? encodeBinary(bytes) : gzipSync(bytes, { level: 9 }).toString("base64"),
    crypto.createHash("sha256").update(bytes).digest("base64url").slice(0, 11),
    ...(binary ? [bytes.length] : []),
  ];
}
async function walk(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    if (["server", ".openai"].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walk(full);
      continue;
    }
    const name = path.relative(dist, full).split(path.sep).join("/");
    if (
      sourceOnly.has(name) ||
      (name.startsWith("assets/") &&
        /\.(?:jpe?g|png|webp)$/.test(name) &&
        !referenced.has(name)) ||
      name.startsWith("comments/") ||
      (name.startsWith("reviews/hdrezka/") &&
        !workRanks.has(Number(path.basename(name, ".json"))))
    )
      continue;
    addAsset(name, await fs.readFile(full));
  }
}
await walk(dist);
for (const entry of (await fs.readFile(path.join(root, "content/manual-additions.json"), "utf8").then(JSON.parse)).entries || []) {
  if (entry.reviews)
    addAsset(`reviews/hdrezka/${entry.work.rank}.json`, JSON.stringify(entry.reviews));
}
addAsset("library.json", JSON.stringify(library));
let entry = await fs.readFile(path.join(root, "worker/index.mjs"), "utf8");
entry = entry
  .replace(
    "const EMBEDDED_ASSETS = {}; // BUILD_ASSETS",
    () => "const EMBEDDED_ASSETS = " + JSON.stringify(assets) + ";",
  ).replace(
    "const ASSET_TYPES = []; // BUILD_TYPES",
    "const ASSET_TYPES = " + JSON.stringify(assetTypes) + ";",
  );
const bundled = await build({
  stdin: {
    contents: entry,
    resolveDir: path.join(root, "worker"),
    sourcefile: "index.mjs",
    loader: "js",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  legalComments: "none",
});
const source = bundled.outputFiles[0].text;
const bytes = Buffer.byteLength(source);
if (bytes > 10 * 1024 * 1024) throw Error("Worker exceeds 10 MiB: " + bytes);
const output = path.join(root, ".site-build");
await fs.mkdir(path.join(output, "dist/server"), { recursive: true });
await fs.mkdir(path.join(output, ".openai"), { recursive: true });
await fs.writeFile(path.join(output, "dist/server/index.js"), source);
await fs.copyFile(
  path.join(root, ".openai/hosting.json"),
  path.join(output, ".openai/hosting.json"),
);
await fs.cp(path.join(root, "drizzle"), path.join(output, ".openai/drizzle"), {
  recursive: true,
});
// Sites full-stack migrations are discovered under the conventional dist/.openai tree.
await fs.mkdir(path.join(output, "dist/.openai"), { recursive: true });
await fs.copyFile(
  path.join(root, ".openai/hosting.json"),
  path.join(output, "dist/.openai/hosting.json"),
);
await fs.cp(
  path.join(root, "drizzle"),
  path.join(output, "dist/.openai/drizzle"),
  { recursive: true },
);
console.log(
  JSON.stringify({
    assets: Object.keys(assets).length,
    works: works.length,
    reviewPages: works.filter((w) => w.reviewSource).length,
    videoIds: activeVideos.size,
    workerBytes: bytes,
    output,
  }),
);
