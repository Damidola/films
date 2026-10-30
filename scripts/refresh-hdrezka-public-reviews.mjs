/** Resolve public HDrezka pages by exact Kinopoisk ID, then cache the public comments request. */
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseHdrezkaReviews,
  readHdrezkaReviews,
} from "../worker/reviews/hdrezka.mjs";
const root = path.resolve(import.meta.dirname, "..");
const candidates = JSON.parse(
  await fs.readFile(path.join(root, "dist/personal-candidates.json"), "utf8"),
);
const base = JSON.parse(
  await fs.readFile(path.join(root, "dist/catalog.json"), "utf8"),
);
const allSelection = process.argv.includes("--selection");
const onlyRanks = new Set(
  allSelection
    ? JSON.parse(
        await fs.readFile(
          path.join(root, "research/discovery-200-current-selection.json"),
          "utf8",
        ),
      ).items.map((i) => i.rank)
    : process.argv.slice(2).map(Number),
);
const items = [...base, ...candidates].filter((i) =>
  onlyRanks.size
    ? onlyRanks.has(i.rank)
    : i.addedFrom === "shared-taste-discovery-200" || [1, 252].includes(i.rank),
);
const sourceFile = path.join(root, "dist/review-sources.json");
const sources = JSON.parse(await fs.readFile(sourceFile, "utf8"));
const report = [];
let cursor = 0;
let blocked = false;
let nextRequestAt = 0;
const fetchPublic = async (url, options = {}) => {
  if (blocked) throw Error("source-blocked");
  const scheduled = Math.max(Date.now(), nextRequestAt);
  nextRequestAt = scheduled + 500;
  await new Promise((resolve) => setTimeout(resolve, scheduled - Date.now()));
  if (blocked) throw Error("source-blocked");
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10000),
  });
  if (response.status === 403 || response.status === 429) {
    blocked = true;
    throw Error("source-blocked");
  }
  return response;
};
const get = async (url) => {
  const response = await fetchPublic(url);
  if (!response.ok) throw Error("http-" + response.status);
  return response.text();
};
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++],
        kpId = item.kpurl.match(/\/(\d+)\/?$/)?.[1];
      let found = false;
      const checked = new Set();
      try {
        const saved = JSON.parse(
          await fs.readFile(
            path.join(root, "dist/reviews/hdrezka/" + item.rank + ".json"),
            "utf8",
          ),
        );
        if (
          saved.workId === item.rank &&
          saved.comments?.length >= 10 &&
          saved.source?.host === "hdrezka.me" &&
          saved.source.url === sources.sources[String(item.rank)]?.url
        ) {
          report.push({
            workId: item.rank,
            title: item.title,
            status: "ok",
            count: saved.comments.length,
            total: saved.total,
            url: saved.source.url,
            cached: true,
          });
          continue;
        }
      } catch {}
      try {
        for (const query of [item.ru, item.title]) {
          const search = await get(
            "https://hdrezka.me/search/?do=search&subaction=search&q=" +
              encodeURIComponent(query),
          );
          const urls = [...search.matchAll(/href=["']([^"']+)["']/g)]
            .map((m) => m[1].replaceAll("&amp;", "&"))
            .filter(
              (url) =>
                /^https:\/\/hdrezka\.me\/(?:series|films|cartoons|animation)\//.test(
                  url,
                ) && url.endsWith(".html"),
            );
          for (const url of [...new Set(urls)].slice(0, 5)) {
            if (checked.has(url)) continue;
            checked.add(url);
            try {
              const html = await get(url);
              parseHdrezkaReviews(html, { rank: item.rank, kpId }, { url });
              const data = await readHdrezkaReviews(
                { rank: item.rank, kpId },
                { url },
                (requested, options) =>
                  requested === url
                    ? Promise.resolve(
                        new Response(html, {
                          headers: { "Content-Type": "text/html" },
                        }),
                      )
                    : fetchPublic(requested, options),
                AbortSignal.timeout(12000),
              );
              if (!data.comments.length) continue;
              await fs.writeFile(
                path.join(root, "dist/reviews/hdrezka/" + item.rank + ".json"),
                JSON.stringify(data) + "\n",
              );
              sources.sources[String(item.rank)] = {
                workId: item.rank,
                title: item.title,
                kpId,
                url,
                basis: "exact-kinopoisk-id",
                sourceHost: "hdrezka.me",
                checkedAt: new Date().toISOString(),
              };
              report.push({
                workId: item.rank,
                title: item.title,
                status: data.status,
                count: data.comments.length,
                total: data.total,
                url,
              });
              found = true;
              break;
            } catch (error) {
              if (error.message === "source-blocked") throw error;
            }
          }
          if (found) break;
        }
        if (!found)
          report.push({
            workId: item.rank,
            title: item.title,
            status: "not-found",
            checked: checked.size,
          });
      } catch (e) {
        report.push({
          workId: item.rank,
          title: item.title,
          status: "unavailable",
          reason: e.message,
        });
      }
      if (report.length % 10 === 0)
        console.log(
          "HDrezka public comments",
          report.length,
          "/",
          items.length,
        );
    }
  }),
);
sources.checkedAt = new Date().toISOString();
await fs.writeFile(sourceFile, JSON.stringify(sources, null, 2) + "\n");
await fs.writeFile(
  path.join(
    root,
    allSelection
      ? "research/hdrezka-all-200-report.json"
      : "research/discovery-200-hdrezka-public-comments.json",
  ),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  "DONE",
  JSON.stringify({
    works: items.length,
    withReviews: report.filter((r) => r.count > 0).length,
    comments: report.reduce((n, r) => n + (r.count || 0), 0),
    unresolved: report.filter((r) => !r.count).map((r) => r.title),
  }),
);
