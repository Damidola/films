"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Discovery = require("../dist/state.js");
global.Library = require("../dist/domain/library.js");
const store = (value) => {
  const m = new Map(value ? [["dc-state-v2", JSON.stringify(value)]] : []);
  return { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) };
};
const item = (rank, tags, more = {}) => ({
  rank,
  tags,
  type: "series",
  ru: "Title " + rank,
  year: 2020,
  score: 7,
  trailer: { videoId: "vid" + rank },
  discoveryEligible: true,
  ...more,
});
test("new visits and legacy preferences default to random/all without losing feedback", () => {
  for (const saved of [
    undefined,
    {
      mode: "ordered",
      feedType: "series",
      decisions: { 2: "like" },
      watched: { 3: "dislike" },
      sound: false,
    },
  ]) {
    const d = new Discovery([], store(saved));
    assert.equal(d.data.mode, "random");
    assert.equal(d.data.feedType, "all");
    if (saved) {
      assert.equal(d.data.decisions[2], "like");
      assert.equal(d.data.watched[3], "dislike");
      assert.equal(d.data.sound, false);
    }
  }
});
test("both actual bookmarks and watched-good change membership of the personalized hundred, including after reload", () => {
  const items = [
    item(1, ["awkward"]),
    item(2, ["crime"]),
    ...Array.from({ length: 120 }, (_, n) =>
      item(n + 10, [n < 60 ? "awkward" : "crime"], { candidatePool: true }),
    ),
  ];
  const db = store();
  let d = new Discovery(items, db);
  d.decide(1, "like");
  const a = new Set(d.personalSelection().map((i) => i.rank));
  assert.equal(a.size, 100);
  assert.ok([...Array(60)].every((_, n) => a.has(n + 10)));
  d.decide(1, null);
  d.markWatched(2, "like");
  d = new Discovery(items, db);
  const b = new Set(d.personalSelection().map((i) => i.rank));
  assert.equal(b.size, 100);
  assert.ok([...Array(60)].every((_, n) => b.has(n + 70)));
  assert.ok([...a].some((id) => !b.has(id)));
  d.decide(70, "dislike");
  d.markWatched(71, "dislike");
  assert.ok(!d.personalSelection().some((i) => [70, 71].includes(i.rank)));
  assert.ok(!d.eligible().some((i) => [2, 70, 71].includes(i.rank)));
});
test("watched-good has stronger influence than a trailer bookmark and 18+ is not a similarity signal", () => {
  const d = new Discovery(
    [
      item(1, ["crime"]),
      item(2, ["awkward"]),
      item(3, ["crime"]),
      item(4, ["awkward"]),
      item(5, ["18+", "nudity"]),
    ],
    store(),
  );
  d.markWatched(1, "like");
  d.decide(2, "like");
  assert.ok(d.tasteMatch(d.items[2]).score > d.tasteMatch(d.items[3]).score);
  assert.equal(d.tasteMatch(d.items[4]).score, 0);
  assert.equal(d.isGood(2), false);
  assert.equal(d.isGood(1), true);
});
test("plain vertical skips persist at the bottom without becoming feedback or progress", () => {
  const db = store({
    discoveryPolicy: 2,
    collectionsVersion: 2,
    mode: "ordered",
  });
  const items = [1, 2, 3, 4].map((n) => item(n, []));
  let d = new Discovery(items, db);
  d.nextBatch();
  d.markShown(1);
  d.defer(1);
  d = new Discovery(items, db);
  assert.deepEqual(
    d.nextBatch().map((i) => i.rank),
    [2, 3, 4, 1],
  );
  assert.equal(d.progress().done, 0);
  d.decide(2, "like");
  d.markWatched(2, "like");
  d.markWatched(3, "dislike");
  assert.equal(d.progress().done, 2);
  assert.equal(d.progress().percent, 50);
  assert.ok(!d.eligible().some((i) => [2, 3].includes(i.rank)));
});
test("canonical seed migration preserves removal and dislikes without duplicate good cards", () => {
  const seeds = [
    { id: "seed-one", canonicalRank: 1, rank: 1, tags: ["crime"] },
    { id: "seed-two", canonicalRank: 2, rank: 2, tags: ["awkward"] },
  ];
  const db = store({
    collectionsVersion: 2,
    seedGood: { "seed-one": false },
    watched: { 2: "dislike" },
  });
  const d = new Discovery(
    [item(1, ["crime"]), item(2, ["awkward"])],
    db,
    Math.random,
    seeds,
  );
  assert.equal(d.goodItems().length, 0);
  d.setGood("seed-one", true);
  assert.deepEqual(
    d.goodItems().map((i) => i.rank),
    [1],
  );
  d.save();
  const reload = new Discovery(d.items, db, Math.random, seeds);
  assert.deepEqual(
    reload.goodItems().map((i) => i.rank),
    [1],
  );
  reload.setGood(1, false);
  assert.equal(reload.goodItems().length, 0);
});
test("unavailable years, IMDb ratings, foreign trailers and search links never enter discovery", () => {
  global.AppConfig = {
    englishTrailersRequired: true,
    directLinksRequired: true,
  };
  const valid = {
    ...item(1, ["crime"]),
    trailer: { videoId: "12345678901", language: "en", maxHeight: 1080 },
    rezka: "https://hdrezka.asia/serialy/example-2020",
  };
  const library = Library.buildLibrary(
    [
      valid,
      { ...valid, rank: 2, year: 1999 },
      { ...valid, rank: 3, score: 5.9 },
      { ...valid, rank: 4, trailer: { ...valid.trailer, language: "de" } },
      { ...valid, rank: 5, rezka: "https://hdrezka.asia/search/?q=example" },
    ],
    null,
    [],
  );
  assert.deepEqual(
    library.items.filter((i) => i.discoveryEligible).map((i) => i.rank),
    [1],
  );
  delete global.AppConfig;
});
test("undo preserves independent bookmark and watched values", () => {
  const d = new Discovery([item(1, [])], store());
  d.decide(1, "like");
  d.markWatched(1, "like");
  d.markWatched(1, "dislike");
  d.undo();
  assert.equal(d.data.watched[1], "like");
  assert.equal(d.isGood(1), true);
  d.undo();
  assert.equal(d.data.watched[1], undefined);
  assert.equal(d.data.decisions[1], "like");
});

test("Papich archive is an explicit feed filter; default discovery still excludes old or low-rated archive titles", () => {
  const archived = item(2, ["crime"], {
    year: 1990,
    score: 5,
    papichScore: 7,
    papichOnly: true,
    discoveryEligible: false,
  });
  const d = new Discovery([item(1, []), archived], store());
  assert.deepEqual(
    d.eligible().map((i) => i.rank),
    [1],
  );
  d.data.feedType = "papich";
  assert.deepEqual(
    d.eligible().map((i) => i.rank),
    [2],
  );
  d.markWatched(2, "like");
  assert.deepEqual(d.eligible(), []);
  assert.equal(d.progress().done, 1);
});
test("generic drama/action cannot explain Invincible by Mr Inbetween; specific themes and actual good drive matching", () => {
  const ray = item(1, ["Боевик", "Драма", "Криминал"], {
    kind: "Игровой сериал",
    syn: "Наёмный убийца совмещает работу и семью",
  });
  const invincible = item(2, ["Action", "Drama", "Фантастика"], {
    kind: "Анимационный сериал",
    syn: "Подросток становится супергероем",
  });
  const barry = item(3, ["Криминал", "Драма"], {
    kind: "Игровой сериал",
    syn: "Наёмный убийца хочет стать актёром",
  });
  const heroes = item(4, ["Боевик", "Драма"], {
    kind: "Игровой сериал",
    syn: "Супергерои злоупотребляют властью",
  });
  const d = new Discovery([ray, invincible, barry, heroes], store());
  d.markWatched(1, "like");
  assert.equal(d.tasteMatch(invincible).score, 0);
  assert.equal(d.tasteMatch(invincible).because, null);
  assert.equal(d.tasteMatch(barry).because.rank, 1);
  d.setGood(1, false);
  d.markWatched(4, "like");
  assert.ok(d.tasteMatch(invincible).score > 0);
});
test("catalog decisions and rejected collection remain separate after reload, with a reversible rejection", () => {
  const items = [
    item(1, []),
    item(2, []),
    item(3, []),
    item(4, []),
    item(5, []),
  ];
  const db = store();
  let d = new Discovery(items, db);
  d.decide(1, "dislike");
  d.markWatched(2, "dislike");
  d.decide(3, "like");
  d.markWatched(4, "like");
  d.defer(5);
  d = new Discovery(items, db);
  assert.deepEqual(
    items.filter((i) => d.isUndecided(i)).map((i) => i.rank),
    [5],
  );
  assert.deepEqual(
    items.filter((i) => d.isRejected(i.rank)).map((i) => i.rank),
    [1, 2],
  );
  d.restoreRejected(1);
  d.restoreRejected(2);
  d = new Discovery(items, db);
  assert.ok(d.isUndecided(items[0]) && d.isUndecided(items[1]));
  assert.equal(d.data.decisions[3], "like");
  assert.equal(d.data.watched[4], "like");
});
test("excluded production countries disappear from base, Papich, and seed collections, independently of trailer language", () => {
  const ru = item(1, [], {
    productionCountries: ["RU"],
    trailer: { language: "en" },
  });
  const ua = item(2, [], {
    productionCountries: ["UA"],
    trailer: { language: "ru" },
  });
  const su = item(3, [], {
    productionCountries: ["SU"],
    papich: { kinopoiskId: "3" },
  });
  const library = Library.buildLibrary(
    [ru, ua],
    { items: [su] },
    [{ rank: 1, id: "seed-ru" }],
    [],
    { excludedCountryCodes: ["RU", "SU"] },
  );
  assert.deepEqual(
    library.items.map((i) => i.rank),
    [2],
  );
  assert.equal(library.seeds.length, 0);
});
