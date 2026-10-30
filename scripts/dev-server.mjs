import { profileResponse } from "../worker/profile.mjs";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { compileLibrary, reviewRegistry } from "./library-data.mjs";
import { ReviewService, reviewsResponse } from "../worker/reviews/service.mjs";
import { commentsResponse } from "../worker/comments.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  dist = path.join(root, "dist"),
  library = await compileLibrary(root),
  works = reviewRegistry(library),
  allowedVideos = new Set([...works.values()].flatMap((w) => w.videoIds));
const readJson = async (name) => {
  try {
    return JSON.parse(await fs.readFile(path.join(dist, name), "utf8"));
  } catch {
    return null;
  }
};
const service = new ReviewService({
  works,
  loadSnapshot: async ({ work, provider, videoId }) => {
    if (provider === "hdrezka")
      return readJson("reviews/hdrezka/" + work.rank + ".json");
    const data = await readJson("comments/" + videoId + ".json");
    return data
      ? {
          ...data,
          schemaVersion: 1,
          workId: work.rank,
          provider: "youtube",
          status: data.comments.length ? "ok" : "empty",
          source: {
            name: "YouTube",
            host: "youtube.com",
            url: "https://www.youtube.com/watch?v=" + videoId,
          },
        }
      : null;
  },
});
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost:8000");
      if (url.pathname === "/api/profile") {
        const response = await profileResponse(new Request(url), {}, works);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      if (["/api/reviews", "/api/comments"].includes(url.pathname)) {
        const jobs = [];
        const ctx = { waitUntil: (p) => jobs.push(p) };
        const request = new Request(url, { method: req.method });
        const response =
          url.pathname === "/api/reviews"
            ? await reviewsResponse(request, ctx, service)
            : await commentsResponse(request, ctx, {
                allowedVideos,
                fallback: (id) => readJson("comments/" + id + ".json"),
              });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (url.pathname === "/library.json") {
        res.writeHead(200, {
          "Content-Type": types[".json"],
          "Cache-Control": "no-cache",
        });
        res.end(JSON.stringify(library));
        return;
      }
      const name = [
          "/",
          "/index.html",
          "/catalog.html",
          "/feed.html",
          "/favorites.html",
          "/good.html",
        ].includes(url.pathname)
          ? "index.html"
          : decodeURIComponent(url.pathname).slice(1),
        file = path.resolve(dist, name);
      if (!file.startsWith(dist + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const bytes = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(8000, "0.0.0.0", () => console.log("Local: http://localhost:8000"));
