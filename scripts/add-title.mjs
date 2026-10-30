#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, ".."), input = process.argv[2];
if (!input) throw new Error("Usage: npm run add:title -- path/to/title.json");
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), "utf8"));
const entry = JSON.parse(await fs.readFile(path.resolve(input), "utf8"));
const work = entry.work;
if (!work || !work.title || !work.ru || !Number.isInteger(work.year) || !work.trailer?.videoId || !work.image)
  throw new Error("Title needs work.title, work.ru, year, verified trailer, and poster path.");
if (!entry.providers?.kinogo?.url || !/^https:\/\/uakinogo\.io\/(?:filmy|serialy|multserialy|original)\/\d+-[^/]+\.html$/.test(entry.providers.kinogo.url))
  throw new Error("Add a checked direct uakinogo.io page URL, not a search URL.");
if (!entry.reviewSource?.url || !/^https:\/\/hdrezka\.me\//.test(entry.reviewSource.url))
  throw new Error("Add the matched HDrezka title page as reviewSource.url.");
if (entry.reviews && (entry.reviews.workId !== work.rank || !Array.isArray(entry.reviews.comments) || entry.reviews.comments.length > 20))
  throw new Error("Review snapshot must match the rank and contain at most 20 public comments.");

const manifest = await read("content/manual-additions.json");
const candidates = await read("dist/personal-candidates.json");
const catalog = await read("dist/catalog.json");
const ranks = [...manifest.entries.map((x) => x.work.rank), ...candidates.map((x) => x.rank), ...catalog.map((x) => x.rank)].filter(Number.isInteger);
if (work.rank == null) work.rank = Math.max(0, ...ranks) + 1;
if (ranks.includes(work.rank)) throw new Error(`Rank ${work.rank} is already in use.`);
entry.reviewSource.workId = work.rank;
entry.reviewSource.title = work.title;
entry.reviewSource.matchedTitle ||= work.title;
entry.reviewSource.matchedYear ||= work.year;
if (entry.reviews) entry.reviews.workId = work.rank;
manifest.entries.push(entry);
await fs.writeFile(path.join(root, "content/manual-additions.json"), JSON.stringify(manifest, null, 2) + "\n");

if (entry.planned) {
  const journalPath = path.join(root, "drizzle/meta/_journal.json"), journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
  const idx = journal.entries.length, tag = `${String(idx).padStart(4, "0")}_add_title_${work.rank}`;
  const sql = `-- Owner-requested title saved to Буду смотреть.\nINSERT INTO \`taste_feedback\` (\`user_id\`,\`work_id\`,\`title\`,\`decision\`,\`watched\`,\`good\`,\`updated_at\`,\`bookmarked_at\`) VALUES ('single-user',${work.rank},'${String(work.ru).replaceAll("'", "''")}','like',NULL,0,${Date.now()},${Date.now()}) ON CONFLICT (\`user_id\`,\`work_id\`) DO UPDATE SET \`decision\`='like', \`watched\`=NULL, \`good\`=0, \`updated_at\`=excluded.updated_at, \`bookmarked_at\`=excluded.bookmarked_at WHERE excluded.updated_at > taste_feedback.updated_at;\n`;
  await fs.writeFile(path.join(root, "drizzle", `${tag}.sql`), sql);
  journal.entries.push({ idx, version: journal.entries.at(-1)?.version || "6", when: Date.now(), tag, breakpoints: true });
  await fs.writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n");
}

console.log(`Added rank ${work.rank}: ${work.ru} (${work.title}) to the single additions manifest.`);
if (entry.planned) console.log("A D1 migration for «Буду смотреть» was generated.");
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
console.log("Built the site; publish the generated .site-build archive as usual.");
