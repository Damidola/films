/** One canonical dataset shared by production build, local server, and review registry. */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildLibrary, providerUrl } = require("../dist/domain/library.js");
export async function compileLibrary(root) {
  const dist = path.join(root, "dist");
  const names = [
    "catalog.json",
    "papich-series.json",
    "taste-seeds.json",
    "personal-candidates.json",
    "review-sources.json",
    "provider-links.json",
  ];
  const [catalog, papich, seeds, candidates, reviews, providers, additionsFile] = await Promise.all(
    [...names.map((n) => path.join(dist, n)), path.join(root, "content/manual-additions.json")].map((n) => fs.readFile(n, "utf8").then(JSON.parse)),
  );
  const additions = additionsFile.entries || [];
  const addedRanks = new Set(additions.map((entry) => entry.work.rank));
  const config = require("../dist/config.js");
  const library = buildLibrary(
    catalog,
    papich,
    seeds,
    [
      ...(config.personalCandidatesEnabled
        ? candidates.filter((item) => !addedRanks.has(item.rank))
        : []),
      ...additions.map((entry) => entry.work),
    ],
    config,
  );
  const additionProviders = Object.fromEntries(
    additions.map((entry) => [String(entry.work.rank), entry.providers || {}]),
  );
  const additionReviews = Object.fromEntries(
    additions
      .filter((entry) => entry.reviewSource)
      .map((entry) => [String(entry.work.rank), entry.reviewSource]),
  );
  for (const item of library.items) {
    for (const field of ["title", "ru"])
      if (typeof item[field] === "string")
        item[field] = item[field]
          .replace(/\\xa0/g, " ")
          .replace(/\u00a0/g, " ");
    const kino = additionProviders[String(item.rank)]?.kinogo || providers.kinogo[String(item.rank)];
    item.kinogo = kino?.url || null;
    if (kino) {
      item.providerVerification = { ...item.providerVerification, kinogo: kino };
    }
    const source = additionReviews[String(item.rank)] || reviews.sources[String(item.rank)];
    if (source) {
      item.rezka = providerUrl(source.url, "rezka");
      item.reviewSource = {
        url: source.url,
        kpId: source.kpId,
        basis: source.basis,
        matchedTitle: source.matchedTitle,
        matchedYear: source.matchedYear,
        sourceYear: source.sourceYear,
      };
    }
  }
  const canonical = new Map(library.items.map((item) => [item.rank, item]));
  for (const seed of library.seeds) {
    const item = canonical.get(seed.canonicalRank || seed.rank);
    seed.kinogo = item?.kinogo || null;
  }
  const { items: archive, ...papichMeta } = papich;
  return {
    schemaVersion: 1,
    items: library.items,
    seeds: library.seeds,
    papich: papichMeta,
  };
}
export function reviewRegistry(library) {
  return new Map(
    library.items.map((i) => [
      i.rank,
      {
        rank: i.rank,
        title: i.title,
        year: i.year,
        ru: i.ru,
        kpId: (i.kpurl || "").match(/\/(\d+)\/?$/)?.[1],
        reviewSource: i.reviewSource || null,
        videoIds: [
          ...new Set(
            [i.trailer, ...(i.trailerAlternates || [])]
              .filter(Boolean)
              .map((v) => v.videoId),
          ),
        ],
      },
    ]),
  );
}
