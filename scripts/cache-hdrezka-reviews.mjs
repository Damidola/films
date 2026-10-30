/** Parse captured public pages. Snapshots retain source, identity and original comment links. */
import fs from "node:fs/promises";
import path from "node:path";
import { parseHdrezkaReviews } from "../worker/reviews/hdrezka.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  sources = JSON.parse(
    await fs.readFile(
      path.join(root, "research/hdrezka-review-discovery.json"),
      "utf8",
    ),
  );
const report = [];
await fs.mkdir(path.join(root, "dist/reviews/hdrezka"), { recursive: true });
for (const row of Object.values(sources)) {
  if (row.status !== "verified") continue;
  try {
    const html = await fs.readFile(path.join(root, row.capturedFile), "utf8"),
      data = parseHdrezkaReviews(
        html,
        { rank: row.workId, kpId: row.kpId },
        row,
      );
    await fs.writeFile(
      path.join(root, "dist/reviews/hdrezka/" + row.workId + ".json"),
      JSON.stringify(data) + "\n",
    );
    report.push({
      workId: row.workId,
      url: row.url,
      status: data.status,
      count: data.comments.length,
    });
  } catch (e) {
    report.push({
      workId: row.workId,
      url: row.url,
      status: "unavailable",
      reason: e.message,
    });
  }
}
await fs.writeFile(
  path.join(root, "research/hdrezka-reviews-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    pages: report.length,
    withReviews: report.filter((r) => r.count > 0).length,
    reviews: report.reduce((sum, r) => sum + (r.count || 0), 0),
    unavailable: report.filter((r) => r.status === "unavailable").length,
  }),
);
