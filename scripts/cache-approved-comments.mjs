/** Cache only genuine public YouTube comments; missing/disabled comments stay empty. */
import fs from "node:fs/promises";
import { readYouTubeComments } from "../worker/youtube-comments-reader.mjs";
const paths = [
  "catalog.json",
  "personal-candidates.json",
  "papich-series.json",
];
const records = (
  await Promise.all(
    paths.map((p) =>
      fs
        .readFile(new URL("../dist/" + p, import.meta.url), "utf8")
        .then(JSON.parse),
    ),
  )
).flatMap((data) => (Array.isArray(data) ? data : data.items));
const ids = [
  ...new Set(
    records
      .filter((i) => i.trailer)
      .flatMap((i) => [i.trailer, ...(i.trailerAlternates || [])])
      .map((v) => v.videoId),
  ),
];
let cursor = 0;
const results = [];
await fs.mkdir(new URL("../dist/comments/", import.meta.url), {
  recursive: true,
});
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++],
        p = new URL("../dist/comments/" + id + ".json", import.meta.url);
      try {
        const old = JSON.parse(await fs.readFile(p, "utf8"));
        if (old.videoId === id && old.comments?.length) {
          results.push({ id, status: "existing", count: old.comments.length });
          continue;
        }
      } catch {}
      try {
        const data = await readYouTubeComments(
          id,
          fetch,
          AbortSignal.timeout(14000),
        );
        await fs.writeFile(p, JSON.stringify(data) + "\n");
        results.push({ id, status: "saved", count: data.comments.length });
      } catch (e) {
        results.push({ id, status: "unavailable", message: e.message });
      }
    }
  }),
);
await fs.writeFile(
  new URL("../research/approved-comments-report.json", import.meta.url),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    videos: ids.length,
    available: results.filter((r) => r.count > 0).length,
    comments: results.reduce((s, r) => s + (r.count || 0), 0),
  }),
);
