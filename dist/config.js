(function (root) {
  const config = {
    personalCandidatesEnabled: true,
    englishTrailersRequired: true,
    directLinksRequired: true,
    minYear: 2000,
    minImdb: 6,
    recommendationLimit: 200,
    recommendationReleases: [{
      id: "dark-humor-50-2026-10-20",
      ranks: Array.from({ length: 50 }, (_, index) => 541 + index),
    }, {
      id: "dark-series-17-2026-10-21",
      ranks: [591, 202, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607],
    }],
    excludedRecommendationRanks: [
      28, 80, 120, 145, 146, 290, 301, 311, 320, 410,
      284, 300, 313, 317, 318, 323, 324, 326, 342, 344,
      345, 360, 365, 366, 367, 368, 376, 378, 379, 383,
      393, 405, 411, 413, 414, 458, 459, 460, 461, 480,
    ],
    excludedCountryCodes: ["RU", "SU"],
  };
  if (typeof module !== "undefined") module.exports = config;
  else root.AppConfig = config;
})(typeof window === "undefined" ? globalThis : window);
