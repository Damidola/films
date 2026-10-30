(function (root) {
  "use strict";
  const normalize = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]/g, "");
  const genreAliases = {
    Action: "Боевик",
    Comedy: "Комедия",
    Crime: "Криминал",
    Drama: "Драма",
    Thriller: "Триллер",
    Horror: "Хоррор",
    "Science-Fiction": "Фантастика",
    Fantasy: "Фэнтези",
    Mystery: "Детектив",
    Animation: "Мульт",
    War: "Военный",
    History: "История",
    Romance: "Мелодрама",
    Adventure: "Приключения",
  };
  const specificThemes = (item) => {
    const text = [item.syn, ...(item.tags || [])].join(" ").toLowerCase();
    return [
      ["супергерои", /супергеро|superhero/],
      ["наёмный убийца", /на[её]мн.{0,12}убий|киллер|hitman|contract killer/],
      ["политическая сатира", /политическ.{0,15}сатир|political satire/],
      ["мокьюментари", /мокьюмент|псевдодокумент|mockument/],
      ["неловкий юмор", /неловк.{0,15}(юмор|комед)|cringe|awkward/],
      ["криминальная комедия", /криминальн.{0,12}комед|crime comedy/],
      [
        "космическое приключение",
        /космическ.{0,15}(приключ|путешеств)|space adventure/,
      ],
    ]
      .filter(([, re]) => re.test(text))
      .map(([tag]) => tag);
  };
  const tasteTags = (item) => [
    ...specificThemes(item),
    ...new Set(
      (item.tags || [])
        .map((t) => genreAliases[t] || t)
        .filter((t) => !/(?:18\+|обнаж|nudity|эротик|uncensored)/i.test(t))
        .map((t) => t.toLowerCase()),
    ),
  ];
  function providerUrl(value, provider) {
    if (!value) return value;
    try {
      const url = new URL(value);
      url.protocol = "https:";
      if (provider === "kinogo" && (url.hostname !== "uakinogo.io" || !/\/\d+-[^/]+\.html$/.test(url.pathname))) return null;
      if (provider === "rezka") url.hostname = "hdrezka.me";
      url.port = "";
      return url.href;
    } catch { return null; }
  }
  function buildLibrary(
    catalog,
    papich,
    seeds,
    candidates = [],
    config = root.AppConfig || {},
  ) {
    const excludedOrigin = (item) =>
      (item.productionCountries || []).some((code) =>
        (config.excludedCountryCodes || []).includes(code),
      );
    const byRank = new Map(),
      byKp = new Map(),
      byImdb = new Map();
    for (const raw of [...catalog, ...candidates]) {
      if (excludedOrigin(raw)) continue;
      const i = { ...raw, rezka: providerUrl(raw.rezka, "rezka"), kinogo: providerUrl(raw.kinogo, "kinogo") };
      byRank.set(i.rank, i);
      if (i.kpurl) byKp.set(i.kpurl.match(/\/(?:film|series)\/(\d+)/)?.[1], i);
      if (i.imdb) byImdb.set(i.imdb, i);
    }
    for (const raw of papich?.items || []) {
      if (excludedOrigin(raw)) continue;
      const existing = byRank.get(raw.rank) || byKp.get(raw.papich.kinopoiskId);
      const critic = {
        ...raw.papich,
        source: papich.source,
        checkedAt: papich.checkedAt,
        profile: papich.profile,
      };
      if (existing) {
        if (!existing.trailer && raw.trailer) {
          existing.trailer = raw.trailer;
          existing.trailerAlternates = raw.trailerAlternates || [];
        }
        existing.papich = critic;
        existing.papichScore = raw.papichScore;
      } else byRank.set(raw.rank, { ...raw, papich: critic, rezka: providerUrl(raw.rezka, "rezka"), kinogo: providerUrl(raw.kinogo, "kinogo") });
    }
    const resolvedSeeds = seeds
      .filter(
        (seed) =>
          !excludedOrigin(seed) &&
          !(
            seed.rank &&
            [...catalog, ...candidates, ...(papich?.items || [])].some(
              (i) => i.rank === seed.rank && excludedOrigin(i),
            )
          ),
      )
      .map((seed) => {
        const i =
          (seed.rank && byRank.get(seed.rank)) ||
          (seed.imdb && byImdb.get(seed.imdb)) ||
          [...byRank.values()].find(
            (i) =>
              (normalize(i.title) === normalize(seed.title) &&
                i.year === seed.year) ||
              (seed.tvmazeId &&
                i.source?.includes("/shows/" + seed.tvmazeId + "/")),
          );
        return i
          ? {
              ...i,
              id: seed.id,
              canonicalRank: i.rank,
              tags: [...new Set([...(i.tags || []), ...(seed.tags || [])])],
            }
          : seed;
      });
    for (const i of byRank.values()) {
      const seed = resolvedSeeds.find((s) => s.canonicalRank === i.rank);
      if (seed) {
        i.tags = seed.tags;
        i.knownLiked = true;
        i.status = i.status || "Уже смотрел";
      }
      i.recommendationExcluded = (
        config.excludedRecommendationRanks || []
      ).includes(i.rank);
      i.discoveryEligible =
        !i.recommendationExcluded &&
        Number(i.year) >= 2000 &&
        Number(i.score) >= 6 &&
        Boolean(i.trailer?.videoId) &&
        !["fan-trailer", "clip", "related-edition"].includes(i.trailer?.kind) &&
        !i.papichOnly &&
        (!config.englishTrailersRequired ||
          (i.trailer.language === "en" && i.trailer.maxHeight >= 720)) &&
        (!config.directLinksRequired ||
          (Boolean(i.rezka) &&
            !/[?&](?:q|story)=|do=search|\/search\//.test(i.rezka)));
    }
    return {
      items: [...byRank.values()].sort((a, b) => a.rank - b.rank),
      seeds: resolvedSeeds,
    };
  }
  const api = { buildLibrary, tasteTags, specificThemes, normalize, providerUrl };
  if (typeof module !== "undefined") module.exports = api;
  else root.Library = api;
})(typeof window === "undefined" ? globalThis : window);
