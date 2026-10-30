import { profileResponse } from "./profile.mjs";
import { commentsResponse } from "./comments.mjs";
import { ReviewService, reviewsResponse } from "./reviews/service.mjs";
const EMBEDDED_ASSETS = {}; // BUILD_ASSETS
const ASSET_TYPES = []; // BUILD_TYPES
function getAsset(name) {
  const value = EMBEDDED_ASSETS[name];
  return Array.isArray(value) ? {
    type: ASSET_TYPES[value[0]], binary: Boolean(value[1] & 1),
    compressed: Boolean(value[1] & 2), encoded85: Boolean(value[1] & 4), size: value[4], body: value[2], etag: '"' + value[3] + '"',
  } : value;
}
function decodeBinary(body, size) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
  const bytes = new Uint8Array(size);
  for (let i = 0, at = 0; i < body.length; i += 5) {
    let value = 0;
    for (let j = 0; j < 5; j++) value = value * 85 + alphabet.indexOf(body[i + j]);
    for (let j = 3; j >= 0; j--) { if (at + j < size) bytes[at + j] = value % 256; value = Math.floor(value / 256); }
    at += 4;
  }
  return bytes;
}
async function assetBody(asset) {
  if (asset.encoded85) return decodeBinary(asset.body, asset.size);
  if (asset.compressed) {
    const bytes = Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0));
    return new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  }
  return asset.binary
    ? Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0))
    : asset.body;
}
async function jsonAsset(name) {
  if (
    ["catalog.html", "feed.html", "favorites.html", "good.html"].includes(name)
  )
    name = "index.html";
  const asset = getAsset(name);
  if (!asset) return null;
  try {
    return JSON.parse(await new Response(await assetBody(asset)).text());
  } catch {
    return null;
  }
}
let servicesPromise;
function services() {
  return servicesPromise ||= (async () => {
    const library = await jsonAsset("library.json");
    const reviewWorks = new Map(library.items.map((item) => [item.rank, {
      rank: item.rank, title: item.title, ru: item.ru, year: item.year,
      kpId: item.kpurl?.match(/\/(\d+)\/?$/)?.[1],
      reviewSource: item.reviewSource || null,
      videoIds: [...new Set([item.trailer, ...(item.trailerAlternates || [])]
        .filter(Boolean).map((video) => video.videoId))],
    }]));
    const allowedVideos = new Set([...reviewWorks.values()].flatMap((work) => work.videoIds));
const reviewService = new ReviewService({
  works: reviewWorks,
  loadSnapshot: async ({ work, provider, videoId }) => {
    if (provider === "hdrezka")
      return jsonAsset("reviews/hdrezka/" + work.rank + ".json");
    const data = await jsonAsset("comments/" + videoId + ".json");
    return data
      ? {
          ...data,
          schemaVersion: 1,
          workId: work.rank,
          provider: "youtube",
          status:
            data.status === "disabled"
              ? "disabled"
              : data.comments.length
                ? "ok"
                : "empty",
          source: {
            name: "YouTube",
            host: "youtube.com",
            url: "https://www.youtube.com/watch?v=" + videoId,
          },
        }
      : null;
  },
});
    return { reviewWorks, allowedVideos, reviewService };
  })();
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/profile")
      return profileResponse(request, env, (await services()).reviewWorks);
    if (url.pathname === "/api/reviews")
      return reviewsResponse(request, ctx, (await services()).reviewService);
    if (url.pathname === "/api/comments")
      return commentsResponse(request, ctx, {
        allowedVideos: (await services()).allowedVideos,
        fallback: (id) => jsonAsset("comments/" + id + ".json"),
      });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    let name;
    try {
      name =
        decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (
      ["catalog.html", "feed.html", "favorites.html", "good.html"].includes(
        name,
      )
    )
      name = "index.html";
    const asset = getAsset(name);
    if (!asset) return new Response("Not found", { status: 404 });
    const headers = {
      "Content-Type": asset.type,
      "Cache-Control": (name.endsWith(".html") || name === "library.json")
        ? "no-cache"
        : "public,max-age=86400",
      ETag: asset.etag,
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers.get("If-None-Match") === asset.etag)
      return new Response(null, { status: 304, headers });
    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(await assetBody(asset), { headers });
  },
};
