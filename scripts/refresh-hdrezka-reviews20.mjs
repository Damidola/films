/** Public HDrezka autocomplete + public comments. No VPN, login, browser challenge or arbitrary IDs. */
import fs from "node:fs/promises";
import path from "node:path";
import { compileLibrary } from "./library-data.mjs";
import { readRegisteredHdrezkaReviews } from "../worker/reviews/hdrezka.mjs";
import { parseHtml, elements, cleanText } from "../worker/reviews/html.mjs";
const root = path.resolve(import.meta.dirname, "..");
const library = await compileLibrary(root);
const selectionFile = process.argv[2] || "research/discovery-200-current-selection.json";
const ranks = new Set(
  JSON.parse(
    await fs.readFile(
      path.resolve(root, selectionFile),
      "utf8",
    ),
  ).items.map((i) => i.rank),
);
const items = library.items.filter((i) => ranks.has(i.rank));
const sourceFile = path.join(root, "dist/review-sources.json");
const sources = JSON.parse(await fs.readFile(sourceFile, "utf8"));
const report = [];
let cursor = 0,
  nextRequestAt = 0,
  blocked = false;
const normalize = (s) =>
  String(s || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/g, "");
async function fetchPublic(url, options = {}) {
  if (blocked) throw Error("source-blocked");
  const at = Math.max(Date.now(), nextRequestAt);
  nextRequestAt = at + 600;
  await new Promise((resolve) => setTimeout(resolve, at - Date.now()));
  if (blocked) throw Error("source-blocked");
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(14000),
  });
  if ([403, 429].includes(response.status)) {
    blocked = true;
    throw Error("source-blocked");
  }
  return response;
}
async function discover(work) {
  const checked = new Set();
  for (const q of [work.title, work.ru]) {
    if (checked.has(q)) continue;
    checked.add(q);
    const r = await fetchPublic("https://hdrezka.me/engine/ajax/search.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q }),
    });
    if (!r.ok) continue;
    const html = await r.text();
    for (const anchor of [...elements(parseHtml(html))].filter(
      (n) => n.tag === "a",
    )) {
      const url = anchor.attrs.href || "";
      if (
        !/^https:\/\/hdrezka\.me\/(?:series|films|cartoons|animation)\/[^/]+\/\d+-[^/]+\.html$/.test(
          url,
        )
      )
        continue;
      const text = cleanText(anchor);
      if (!new RegExp("(?:^|[^0-9])" + work.year + "(?:[^0-9]|$)").test(text))
        continue;
      const english = text
        .match(/\((.*)\)/)?.[1]
        ?.replace(/,\s*(?:(?:сериал|мультфильм|аниме),\s*)?\d{4}[\s\S]*$/, "")
        .trim();
      const ru = cleanText(
        [...elements(anchor)].find((n) =>
          (n.attrs.class || "").split(/\s+/).includes("enty"),
        ) || anchor,
      );
      const originalMatch = (english || "")
        .split(" / ")
        .some((t) => normalize(t) === normalize(work.title));
      const translatedMatch = ru
        .split(" / ")
        .some((t) => normalize(t) === normalize(work.ru));
      if (!originalMatch && !translatedMatch) continue;
      if (work.type === "film" && url.includes("/series/")) continue;
      if (work.type === "series" && url.includes("/films/")) continue;
      return {
        workId: work.rank,
        title: work.title,
        kpId: work.kpurl.match(/\/(\d+)\/?$/)?.[1],
        url,
        basis: "exact-original-title-year",
        matchedTitle: work.title,
        matchedYear: work.year,
        matchText: text,
        sourceHost: "hdrezka.me",
        checkedAt: new Date().toISOString(),
      };
    }
  }
  throw Error("page-not-found");
}
async function checkpoint() {
  sources.checkedAt = new Date().toISOString();
  await fs.writeFile(sourceFile, JSON.stringify(sources, null, 2) + "\n");
  await fs.writeFile(
    path.join(root, "research/hdrezka-20-report.json"),
    JSON.stringify(
      {
        checkedAt: sources.checkedAt,
        target: items.length,
        processed: report.length,
        withTwenty: report.filter((x) => x.count >= 20).length,
        blocked,
        items: report,
      },
      null,
      2,
    ) + "\n",
  );
}
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < items.length) {
      const work = items[cursor++];
      let saved = null;
      try {
        saved = JSON.parse(
          await fs.readFile(
            path.join(root, "dist/reviews/hdrezka/" + work.rank + ".json"),
            "utf8",
          ),
        );
      } catch {}
      if (
        saved?.source?.host === "hdrezka.me" &&
        (saved.comments?.length >= 20 || saved.allAvailable === true)
      ) {
        report.push({
          workId: work.rank,
          title: work.title,
          status: "ok",
          count: saved.comments.length,
          cached: true,
          url: saved.source.url,
        });
        continue;
      }
      try {
        let source = sources.sources[String(work.rank)];
        if (source?.sourceHost !== "hdrezka.me") source = await discover(work);
        const data = await readRegisteredHdrezkaReviews(
          {
            rank: work.rank,
            title: work.title,
            year: work.year,
            kpId: work.kpurl.match(/\/(\d+)\/?$/)?.[1],
          },
          source,
          fetchPublic,
        );
        if (!data.comments.length) throw Error("empty");
        await fs.writeFile(
          path.join(root, "dist/reviews/hdrezka/" + work.rank + ".json"),
          JSON.stringify(data) + "\n",
        );
        sources.sources[String(work.rank)] = source;
        report.push({
          workId: work.rank,
          title: work.title,
          status: "ok",
          count: data.comments.length,
          url: data.source.url,
          basis: source.basis,
          allAvailable: data.allAvailable,
        });
      } catch (error) {
        report.push({
          workId: work.rank,
          title: work.title,
          status: error.message,
          count: saved?.comments?.length || 0,
          retained: !!saved?.comments?.length,
        });
      }
      if (report.length % 20 === 0) {
        await checkpoint();
        console.log(
          "HDrezka",
          report.length + "/" + items.length,
          "20 reviews:",
          report.filter((x) => x.count >= 20).length,
          "blocked:",
          blocked,
        );
      }
    }
  }),
);
await checkpoint();
console.log(
  "DONE",
  JSON.stringify({
    target: items.length,
    withTwenty: report.filter((x) => x.count >= 20).length,
    withAny: report.filter((x) => x.count).length,
    blocked,
    unresolved: report
      .filter((x) => x.count < 20)
      .map((x) => ({ title: x.title, status: x.status, count: x.count })),
  }),
);
