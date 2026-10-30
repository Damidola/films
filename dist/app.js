"use strict";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const paths = {
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8",
  x: "m6 6 12 12M6 18 18 6",
  next: "m6 4 8 8-8 8M19 4v16",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  play: "m9 5 11 7-11 7z",
  shuffle: "m3 3 18 18m-5 0h5v-5M3 21l7-7M14 10l7-7m-5 0h5v5",
  volume: "m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14",
  comments: "M21 11a8 8 0 0 1-8 8H6l-4 3V11a8 8 0 1 1 19 0ZM7 9h10M7 13h6",
  mute: "m11 5-6 4H2v6h3l6 4zM17 9l5 6m0-6-5 6",
  info: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  thumbUp: "M7 10v11H3V10zM7 10l5-8h2v6h5a2 2 0 0 1 2 2l-2 9a2 2 0 0 1-2 2H7",
  thumbDown: "M7 14V3H3v11zM7 14l5 8h2v-6h5a2 2 0 0 0 2-2l-2-9a2 2 0 0 0-2-2H7",
  external: "M14 3h7v7M21 3 11 13M10 3H3v18h18v-7",
  undo: "M3 10h12a6 6 0 0 1 0 12M3 10l6-6M3 10l6 6",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.info}"/></svg>`;
let items = [],
  papichCollection = null,
  tasteSeeds = [],
  engine,
  cloudProfile,
  view = "catalog",
  filter = ["papich", "rejected"].includes(
    new URLSearchParams(location.search).get("category"),
  )
    ? new URLSearchParams(location.search).get("category")
    : "all",
  player = null,
  playerReady = false,
  loadedId = null,
  altIndex = 0,
  waitTimer,
  toastTimer,
  playerToken = 0;
let timeline = [],
  activeIndex = 0,
  scrollTimer,
  scrolling = false,
  apiTimer;
let swipeGesture = null,
  horizontalTransition = false,
  motionVersion = 0,
  runningAnimations = [];
let commentsPanel,
  suppressTitleClickUntil = 0,
  detailPlayback = null;
const manuallyPaused = new Set(),
  playedItems = new Set();
let autoSkipStreak = 0,
  videoSwapTimer;
const videoSlots = [];
let activeVideoSlot = null,
  preloadTimer,
  slotClock = 0;
const typeName = { series: "Сериал", film: "Фильм", game: "Игра" };
const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const memory = {};
const storage = {
  getItem(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory[k] || null;
    }
  },
  setItem(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory[k] = v;
    }
  },
};
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (
      img instanceof HTMLImageElement &&
      img.classList.contains("poster") &&
      img.src.startsWith("https://st.kp.yandex.net/")
    )
      img.src = "assets/series-fallback.svg";
  },
  true,
);
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2200);
}
function rating(i) {
  const number = (value) =>
    (Math.round((Number(value) + Number.EPSILON) * 10) / 10).toFixed(1);
  const r = (label, value, url, cls) => {
    const missing = value == null;
    const text = missing
      ? cls === "kp"
        ? i.kpStatus === "insufficient-votes"
          ? "мало оценок"
          : "ещё нет оценки"
        : "нет оценки"
      : number(value);
    const detail =
      cls === "kp" && i.kpVotes != null
        ? `${new Intl.NumberFormat("ru").format(i.kpVotes)} оценок на Кинопоиске`
        : missing
          ? "Рейтинг источником ещё не сформирован"
          : label;
    return `<${url ? "a" : "span"} class="rating ${cls} ${missing ? "unrated" : ""}" title="${esc(detail)}" ${url ? `href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ""}><span>${label}</span> <b>${esc(text)}</b></${url ? "a" : "span"}>`;
  };
  return (
    (i.papichOnly && i.score == null
      ? ""
      : r(
          "IMDb",
          i.score,
          i.imdb ? "https://www.imdb.com/title/" + i.imdb + "/" : null,
          "imdb",
        )) + r("Кинопоиск", i.kp, i.kpurl, "kp")
  );
}
function watchLinks(i, cls = "watch-link") {
  return [
    ["HDrezka", Library.providerUrl(i.rezka, "rezka")],
    ["KinoGo", Library.providerUrl(i.kinogo, "kinogo")],
  ]
    .map(([name, url]) =>
      url && !/[?&](?:q|story)=|do=search|\/search\//.test(url)
        ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть ${esc(i.ru)} на ${name}"><span class="provider-copy"><b>${name}</b></span>${icon("external")}</a>`
        : `<span class="${cls} provider-disabled" aria-disabled="true"><span class="provider-copy"><b>${name}</b><small>страница пока не найдена</small></span></span>`,
    )
    .join("");
}
function papichRating(i) {
  return Number.isFinite(i.papichScore)
    ? `<a class="rating papich-rating" href="${esc(i.papich.source)}" target="_blank" rel="noopener noreferrer" title="Оценка EvilArthas от ${esc(i.papich.ratedAt)}"><span>Папич</span> <b>${i.papichScore}<small>/10</small></b></a>`
    : "";
}
function setCatalogFilter(next) {
  const previous = filter;
  filter = next;
  if (next === "rejected") $("catalog-sort").value = "recent";
  else if ((previous === "papich") !== (next === "papich")) {
    const saved =
        next === "papich" ? storage.getItem("dc-papich-sort") : "order",
      fallback = next === "papich" ? "papichScore-desc" : "order";
    $("catalog-sort").value = [...$("catalog-sort").options].some(
      (o) => o.value === saved,
    )
      ? saved
      : fallback;
  }
  document
    .querySelectorAll("[data-filter]")
    .forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));
  if (view === "catalog")
    history.replaceState(
      { view },
      "",
      ["papich", "rejected"].includes(filter)
        ? "catalog.html?category=" + filter
        : "catalog.html",
    );
  renderCatalog();
}
function plural(n, one, few, many) {
  const m = n % 100,
    k = n % 10;
  return m >= 11 && m <= 14
    ? many
    : k === 1
      ? one
      : k >= 2 && k <= 4
        ? few
        : many;
}
function totalDuration(st) {
  const total = Math.round(st.totalMinutes || st.episodes * st.episodeMinutes),
    hours = Math.floor(total / 60),
    minutes = total % 60;
  return (
    (hours ? hours + " ч" : "") +
    (minutes ? (hours ? " " : "") + minutes + " мин" : "")
  );
}
function seriesStats(i) {
  const st = i.seriesStats;
  if (i.type !== "series" || !st) return "";
  const minutes = Math.round(st.episodeMinutes),
    episodes = Math.round(st.episodesPerSeason);
  return `<div class="series-stats" aria-label="Сезоны и серии" title="${esc(st.episodes + " обычных серий в " + st.seasons + " сезонах; без спецвыпусков. Общее время — по длительности вышедших серий TVmaze; приблизительно.")}" ><span>${st.seasons} ${plural(st.seasons, "сезон", "сезона", "сезонов")} · ${st.episodes} ${plural(st.episodes, "серия", "серии", "серий")}</span><span>≈${minutes} мин/серия</span><span>≈${episodes} ${plural(episodes, "серия", "серии", "серий")}/сезон</span><span class="total-duration">Всего ≈${totalDuration(st)}</span></div>`;
}
function tasteHint(i) {
  if (engine.data.mode !== "random") return "";
  const match = engine.tasteMatch(i);
  return match.score >= 0.1 && match.because
    ? `<div class="taste-hint" title="Связь с твоими отметками">По годноте · ${esc(match.because.ru)}</div>`
    : "";
}
function current() {
  return timeline[activeIndex]?.item || null;
}
function viewHelpers() {
  return {
    esc,
    icon,
    rating,
    papichRating,
    totalDuration,
    seriesStats,
    watchLinks,
  };
}
function catalogCard(i, index) {
  return LibraryViews.card(
    i,
    {
      view,
      index,
      decision: engine.data.decisions[i.rank],
      papich: filter === "papich",
      rejected: view === "catalog" && filter === "rejected",
    },
    viewHelpers(),
  );
}
const standardSortOptions = $("catalog-sort").innerHTML;
function configureCatalogSort(section) {
  const select = $("catalog-sort"), scope = section === "favorites" ? "watchlist" : "catalog";
  if (select.dataset.scope === scope) return;
  const previous = select.value;
  select.innerHTML = scope === "watchlist"
    ? '<option value="recent">Сначала новые добавленные</option><option value="oldest">Сначала старые добавленные</option>'
    : standardSortOptions;
  select.dataset.scope = scope;
  select.value = [...select.options].some((option) => option.value === previous)
    ? previous : scope === "watchlist" ? "recent" : "order";
}
function renderCatalog() {
  configureCatalogSort(view);
  const favorites = view === "favorites",
    good = view === "good",
    rejected = view === "catalog" && filter === "rejected",
    collection = favorites || good || rejected,
    query = $("search").value.trim().toLowerCase();
  $("page-title").textContent = good
    ? "Годнота"
    : favorites
      ? "Буду смотреть"
      : rejected
        ? "Не зашло"
        : filter === "papich"
          ? "Папич"
          : "Каталог";
  $("filters").hidden = favorites || good;
  const savedType = storage.getItem(good ? "dc-good-type" : "dc-watchlist-type"),
    watchlistType = ["film", "series"].includes(savedType) ? savedType : "all";
  $("watchlist-types").hidden = !favorites && !good;
  if (favorites || good) $("watchlist-types").innerHTML = [
    ["all", "Все"], ["film", "Фильмы"], ["series", "Сериалы"],
  ].map(([type, label]) => `<button type="button" class="chip ${type === watchlistType ? "active" : ""}" data-watchlist-type="${type}" aria-pressed="${type === watchlistType}">${label}</button>`).join("");
  $("profile-sync").hidden = !good && !favorites;
  $("catalog-sort-control").hidden = false;
  $("papich-score-control").hidden = collection || filter !== "papich";
  const min = Number($("papich-min-score").value);
  $("papich-score-value").textContent =
    min === 1 ? "Все оценки" : min + " и выше";
  $("papich-min-score").setAttribute(
    "aria-valuetext",
    min === 1 ? "Все оценки" : min + " и выше",
  );
  $("papich-category-note").hidden = collection || filter !== "papich";
  $("papich-category-note").innerHTML = papichCollection
    ? `Архив оценок <a href="${esc(papichCollection.source)}" target="_blank" rel="noopener noreferrer">EvilArthas ↗</a>`
    : "";
  const selected = filter === "personal"
    ? new Set(engine.personalSelection().map((i) => i.rank)) : null;
  let list = (
    good
      ? engine.goodItems()
      : favorites
        ? engine.watchlistItems()
      : collection
        ? items
        : filter === "papich"
          ? items
          : engine.recommendationItems()
  ).filter((i) => {
    if (rejected && !engine.isRejected(i.rank)) return false;
    if ((favorites || good) && watchlistType !== "all" && i.type !== watchlistType) return false;
    if (
      favorites &&
      (engine.data.decisions[i.rank] !== "like" || engine.isRejected(i.rank))
    )
      return false;
    if (
      query &&
      !`${i.ru} ${i.title} ${(i.tags || []).join(" ")} ${i.syn || ""}`
        .toLowerCase()
        .includes(query)
    )
      return false;
    if (!collection) {
      if (!engine.isUndecided(i)) return false;
      if (
        filter === "papich" &&
        (!Number.isFinite(i.papichScore) || i.papichScore < min)
      )
        return false;
      if (filter === "personal" && !selected.has(i.rank)) return false;
      if (
        filter !== "papich" &&
        (i.papichOnly || i.discoveryEligible === false)
      )
        return false;
      if (filter === "top" && Number(i.score) < 8) return false;
      if (filter === "adult" && !i.adult?.nudity) return false;
      if (["series", "film", "game"].includes(filter) && i.type !== filter)
        return false;
      if (filter === "new" && i.year < 2020) return false;
    }
    return true;
  });
  const sort = $("catalog-sort").value;
  if (sort === "random" || sort === "personal") {
    const profile = engine.tasteProfile();
    const seed = sort === "random" ? sessionRandomSeed : 1;
    const scores = new Map(list.map((item) => [item.rank,
      engine.tasteMatch(item, profile).score +
      (sort === "random" ? stableRandom(item.rank, seed) * 0.15 : 0),
    ]));
    list.sort((a, b) => scores.get(b.rank) - scores.get(a.rank) || a.rank - b.rank);
  } else if (sort === "recent" || sort === "oldest") {
    const dates = favorites ? engine.data.watchlistAddedAt : engine.data.feedbackAt;
    const direction = sort === "oldest" ? 1 : -1;
    list.sort((a, b) => direction * ((dates[a.rank] || 0) - (dates[b.rank] || 0) || a.rank - b.rank));
  }
  else if (sort === "order") list.sort((a, b) => a.rank - b.rank);
  else {
    const [field, direction] = sort.split("-");
    list.sort((a, b) => {
      const av = a[field],
        bv = b[field],
        missingA = av == null || !Number.isFinite(Number(av)),
        missingB = bv == null || !Number.isFinite(Number(bv));
      return missingA !== missingB
        ? missingA
          ? 1
          : -1
        : missingA
          ? a.rank - b.rank
          : (Number(av) - Number(bv)) * (direction === "asc" ? 1 : -1) ||
            a.rank - b.rank;
    });
  }
  $("catalog-count").textContent = rejected
    ? `${list.length} · больше не предлагаются`
    : good
      ? `${list.length} · смотрел и понравилось`
      : favorites
        ? `${list.length} · планирую посмотреть`
        : filter === "personal"
          ? `${list.length} новых · по твоим отметкам`
          : `${list.length} фильмов и сериалов`;
  if (!collection && filter === "all" && !query) {
    const progress = engine.catalogProgress();
    $("catalog-count").textContent =
      `Осталось ${progress.remaining} · ${progress.percent}% решено`;
  }
  $("grid").innerHTML = list.length
    ? list.map(catalogCard).join("")
    : `<div class="empty">${collection ? "Здесь пока пусто." : "Ничего не нашлось. Измени фильтр или поиск."}</div>`;
  Posters.mount($("grid"));
}
const sessionRandomSeed = Math.random();
function stableRandom(rank, seed) {
  const n = Math.sin(rank * 12.9898 + seed * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
const collectionPositions = new Map();
function navigate(v, push = true, explicitRank = null) {
  const catalog = document.querySelector(".catalog");
  if (view !== "feed" && !document.body.classList.contains("booting")) {
    collectionPositions.set(view, {
      top: catalog.scrollTop,
      query: $("search").value,
      sort: $("catalog-sort").value,
      filter,
      papichMin: $("papich-min-score").value,
    });
  }
  const savedPosition = collectionPositions.get(v);
  if (v !== "feed") {
    configureCatalogSort(v);
    $("search").value = savedPosition?.query || "";
    $("catalog-sort").value = savedPosition?.sort ||
      (v === "favorites" ? storage.getItem("dc-watchlist-sort") || "recent" : v === "catalog" ? "order" : "recent");
    filter = savedPosition?.filter || (v === "catalog" && !push ? filter : "all");
    if (savedPosition) $("papich-min-score").value = savedPosition.papichMin;
    document.querySelectorAll("[data-filter]").forEach((button) =>
      button.classList.toggle("active", button.dataset.filter === filter),
    );
  }
  closeFeedDetails();
  cancelSwipeMotion();
  commentsPanel?.close(false);
  view = v;
  document.body.classList.toggle("is-feed", v === "feed");
  document.body.classList.toggle("is-catalog", v === "catalog");
  document.body.classList.toggle("is-good", v === "good");
  document
    .querySelectorAll(".nav a")
    .forEach((a) => a.classList.toggle("active", a.dataset.view === v));
  if (push)
    history.pushState(
      { view: v },
      "",
      v === "catalog"
        ? ["papich", "rejected"].includes(filter)
          ? "catalog.html?category=" + filter
          : "catalog.html"
        : v === "feed"
          ? "feed.html"
          : v === "good"
            ? "good.html"
            : "favorites.html",
    );
  if (v === "feed") {
    measureFeed();
    if (explicitRank !== null)
      newBatch(items.find((i) => i.rank === explicitRank));
    else if (!timeline.length) newBatch();
    else {
      pruneFeed();
      alignFeed();
      showItem();
    }
    loadApi();
  } else {
    clearTimeout(waitTimer);
    pausePlayer();
    stopVideoPreload();
    renderCatalog();
    document
      .querySelector(".catalog")
      .scrollTo({ top: savedPosition?.top || 0, behavior: "instant" });
  }
}
function pageHeight() {
  return $("swipe-area").clientHeight || 1;
}
function measureFeed() {
  if (view !== "feed") return;
  $("feed-track").style.setProperty("--page-height", pageHeight() + "px");
  const shell = document.querySelector(".feed-shell");
  if (window.innerWidth < 700) {
    const height = pageHeight();
    const videoHeight = Math.min(shell.clientWidth * 9 / 16, Math.max(150, height - 270));
    const toolbarHeight = document.querySelector(".feed-top").offsetHeight;
    shell.style.setProperty("--video-height", videoHeight + "px");
    shell.style.setProperty("--top-space", toolbarHeight + "px");
  } else {
    shell.style.removeProperty("--video-height");
    shell.style.removeProperty("--top-space");
  }
  if (commentsPanel?.isOpen) commentsPanel.layout();
  if (!$("feed-detail-panel").hidden) placeReadingPanel($("feed-detail-panel"));
  positionPlayer();
}
// Keep all iframe coordinates stable while the feed scrolls; only overlays follow the active card.
function positionPlayer() {
  const host = $("video-box");
  host.style.top = "0px";
  host.style.setProperty("--active-video-offset", activeIndex * pageHeight() + "px");
  host.style.transformOrigin = `50% ${activeIndex * pageHeight() + pageHeight() / 2 - (parseFloat(getComputedStyle(host).marginTop) || 0)}px`;
  positionVideoSlots();
}
// Keep decoded neighbouring frames in their actual feed positions during the swipe.
function positionVideoSlots() {
  const available = new Set();
  for (const slot of videoSlots) {
    const index = timeline.findIndex((entry) => entry.item.rank === slot.rank);
    const preview = slot !== activeVideoSlot && slot.prepared && !slot.failed &&
      index >= 0 && Math.abs(index - activeIndex) <= 2;
    slot.host.classList.toggle("is-preview", preview);
    const active = slot === activeVideoSlot;
    slot.host.style.top = (active ? activeIndex : Math.max(0, index)) * pageHeight() + "px";
    slot.host.style.visibility = index < 0 && !active ? "hidden" : "visible";
    if (preview || slot === activeVideoSlot) available.add(slot.rank);
  }
  document.querySelectorAll(".feed-page").forEach((page, index) => {
    page.classList.toggle("has-video-preview", available.has(timeline[index]?.item.rank));
  });
}
function alignFeed() {
  $("swipe-area").scrollTo({
    top: activeIndex * pageHeight(),
    behavior: "instant",
  });
  positionPlayer();
}
function mediaLabel(i) {
  const v = i.trailer;
  return (
    {
      "series-promo": "Промо сериала",
      "fan-trailer": "Фан-трейлер",
      clip: "Фрагмент",
      "related-edition": "Трейлер киноверсии",
    }[v?.kind] || ""
  );
}
function cardHTML(entry, index) {
  const i = entry.item;
  return `<article class="feed-page" data-page="${index}" aria-label="${esc(i.ru)}"><div class="video-preview" aria-hidden="true"></div><div class="feed-bottom"><h2 class="feed-title"><button class="title-button" data-info="${i.rank}">${esc(i.ru)}${i.title && i.title !== i.ru ? ` <span class="original-title">(${esc(i.title)})</span>` : ""}</button></h2><div class="feed-sub">${esc(i.year)} · ${esc(typeName[i.type] || i.type)}${i.seriesStats ? " · " + i.seriesStats.seasons + " сез. · ≈" + Math.round(i.seriesStats.episodesPerSeason) + " сер./сез. · ≈" + Math.round(i.seriesStats.totalMinutes / 60) + " ч" : ""}${i.trailer?.language && i.trailer.language !== "en" ? " · " + (i.trailer.subtitles === "en" ? "EN субтитры" : i.trailer.language.toUpperCase()) : ""}${mediaLabel(i) ? " · " + mediaLabel(i) : ""}</div><div class="ratings">${rating(i)}${engine.data.feedType === "papich" ? papichRating(i) : ""}</div>${tasteHint(i)}<div class="watch-links feed-watch-links">${watchLinks(i)}</div><div class="watched-actions"><button class="watched-feedback negative" data-action="watched-dislike" aria-label="Смотрел — не понравилось">${icon("thumbDown")}<span>Смотрел</span></button><button class="watched-feedback positive" data-action="watched-like" aria-label="Смотрел — понравилось">${icon("thumbUp")}<span>Смотрел</span></button></div><div class="feed-tools"><button class="smallbtn comments-action" data-action="comments">${icon("comments")}<span class="comments-button-copy"><b>Отзывы</b><small class="comment-preview"></small></span></button></div></div></article>`;
}
function appendBatch() {
  const last = timeline.at(-1)?.item.rank;
  const batch = engine.nextBatch().filter((i) => i.rank !== last);
  const start = timeline.length;
  batch.forEach((item) => timeline.push({ item }));
  $("feed-cards").insertAdjacentHTML(
    "beforeend",
    timeline
      .slice(start)
      .map((e, n) => cardHTML(e, start + n))
      .join(""),
  );
  return batch.length;
}
// Remove rated cards from existing history and queued recommendations as well.
function pruneFeed(explicitRank = null, refreshTaste = false) {
  const allowed = new Set(engine.eligible().map((i) => i.rank)),
    rank = current()?.rank,
    prefix = timeline
      .slice(0, activeIndex)
      .filter(
        (e) => allowed.has(e.item.rank) || e.item.rank === explicitRank,
      ).length;
  timeline = timeline.filter(
    (e) => allowed.has(e.item.rank) || e.item.rank === explicitRank,
  );
  if (refreshTaste && engine.data.mode === "random")
    timeline = timeline.slice(0, prefix);
  const retained = timeline.findIndex((e) => e.item.rank === rank);
  $("feed-cards").innerHTML = timeline.map(cardHTML).join("");
  if (retained < 0 && prefix >= timeline.length) appendBatch();
  activeIndex =
    retained >= 0
      ? retained
      : Math.min(prefix, Math.max(0, timeline.length - 1));
  $("feed-empty").hidden = timeline.length > 0;
  $("video-box").hidden = !timeline.length;
}

function newBatch(item = null) {
  engine.restart(item?.rank || 0);
  cancelSwipeMotion();
  clearTimeout(scrollTimer);
  scrolling = false;
  pausePlayer();
  timeline = [];
  activeIndex = 0;
  loadedId = null;
  $("feed-cards").innerHTML = "";
  if (item) {
    timeline.push({ item });
    $("feed-cards").innerHTML = cardHTML(timeline[0], 0);
    engine.markShown(item.rank);
    appendBatch();
  } else appendBatch();
  $("feed-empty").hidden = timeline.length > 0;
  $("video-box").hidden = !timeline.length;
  alignFeed();
  showItem();
}
function hideVideoStatus() {
  $("player-cover").hidden = true;
  $("player-cover").classList.remove("is-loading");
}
function showVideoStatus(message, link = false) {
  $("player-cover").classList.remove("is-loading");
  $("player-cover").hidden = false;
  $("player-message").textContent = message;
  $("external-video").hidden = !link;
  const v = candidates(current() || {})[altIndex];
  if (v)
    $("external-video").href =
      v.url ||
      "https://www.youtube.com/watch?v=" + encodeURIComponent(v.videoId);
}
function showVideoLoading(message) {
  if (!message) {
    hideVideoStatus();
    return;
  }
  showVideoStatus(message);
  $("player-cover").classList.add("is-loading");
}
// Pause commands issued by the app must not become the user's manual pause preference.
function pausePlayer() {
  if (activeVideoSlot) pauseVideoSlot(activeVideoSlot);
}
function restorePlayback() {
  if (!playerReady || !current()) return;
  if (
    view !== "feed" ||
    scrolling ||
    horizontalTransition ||
    $("detail").open
  ) {
    pausePlayer();
    return;
  }
  if (manuallyPaused.has(current().rank)) {
    pausePlayer();
    hideVideoStatus();
    return;
  }
  applySound();
  if (player.getPlayerState?.() !== 1) player.playVideo();
}
function updateDecisions() {
  document.querySelectorAll(".feed-page").forEach((page, n) => {
    const id = timeline[n].item.rank;
    for (const action of ["like", "dislike"]) {
      const watched = page.querySelector(`[data-action="watched-${action}"]`);
      watched.classList.toggle("selected", engine.data.watched[id] === action);
      watched.setAttribute(
        "aria-pressed",
        String(engine.data.watched[id] === action),
      );
    }
  });
}
function videoContext(item = current(), candidate = null) {
  const v =
    candidate ||
    candidates(item || {})[item?.rank === current()?.rank ? altIndex : 0];
  return item && v
    ? {
        workId: item.rank,
        videoId: v.videoId,
        title: item.ru,
        number: item.rank,
        videoTitle: v.title || v.label,
        channel: v.channel,
      }
    : null;
}
function warmComments() {
  const context = videoContext();
  if (context) commentsPanel?.prefetch(context);
  const next = timeline[activeIndex + 1]?.item;
  if (next) commentsPanel?.prefetch(videoContext(next));
  if (commentsPanel?.isOpen) commentsPanel.open(context);
}
function showItem() {
  closeFeedDetails();
  if (view !== "feed") return;
  clearTimeout(videoSwapTimer);
  const i = current();
  if (!i) {
    clearTimeout(waitTimer);
    pausePlayer();
    const saved = engine.data.feedType === "watchlist";
    $("counter").textContent = saved ? "Нет сохранённых" : "Нет новых";
    $("feed-empty").querySelector("h2").textContent = saved ? "Список пока пуст" : "Пока всё.";
    $("feed-empty").querySelector("p").textContent = saved
      ? "Свайпай вправо в общей ленте — сохранённые фильмы и сериалы появятся здесь."
      : "Все доступные находки этого типа уже оценены. Загляни в годноту или выбери другой тип.";
    return;
  }
  engine.markShown(i.rank);
  $("video-box").style.backgroundImage = "none";
  $("video-box").classList.remove("is-replacing");
  const progress = engine.progress();
  $("counter").innerHTML = engine.data.feedType === "watchlist"
    ? `${progress.total}<small>сохранено</small>`
    : `${progress.percent}%<small>${progress.done}/${progress.total}</small>`;
  $("counter").setAttribute(
    "aria-label",
    engine.data.feedType === "watchlist" ? `Буду смотреть: ${progress.total}` : `Обработано ${progress.done} из ${progress.total} рекомендаций`,
  );
  document
    .querySelectorAll(".feed-page")
    .forEach((p, n) => p.classList.toggle("active", n === activeIndex));
  updateDecisions();
  measureFeed();
  if (loadedId !== i.rank) {
    loadedId = i.rank;
    altIndex = 0;
    playCurrent();
  } else restorePlayback();
  warmComments();
  scheduleVideoPreload();
}
function moveFeed(direction) {
  if (horizontalTransition || !current()) return;
  let target = activeIndex + direction;
  if (target < 0) return;
  if (target >= timeline.length) {
    if (!appendBatch()) {
      toast("Новых находок этого типа больше нет");
      return;
    }
  }
  $("swipe-area").scrollTo({
    top: target * pageHeight(),
    behavior: reducedMotion() ? "instant" : "smooth",
  });
}
// Grow history at the last card so both native forward and backward scroll remain available.
function settleFeed() {
  if (horizontalTransition || view !== "feed" || !timeline.length) return;
  const index = Math.max(
    0,
    Math.min(
      timeline.length - 1,
      Math.round($("swipe-area").scrollTop / pageHeight()),
    ),
  );
  if (index > activeIndex)
    for (const entry of timeline.slice(activeIndex, index))
      engine.defer(entry.item.rank);
  scrolling = false;
  activeIndex = index;
  showItem();
  if (activeIndex === timeline.length - 1) appendBatch();
}
function candidates(i) {
  return [i.trailer, ...(i.trailerAlternates || [])].filter(Boolean);
}
function applySound() {
  $("sound").innerHTML = icon(engine.data.sound ? "volume" : "mute");
  $("sound").setAttribute(
    "aria-label",
    engine.data.sound ? "Выключить звук" : "Включить звук",
  );
  $("sound").setAttribute("aria-pressed", String(engine.data.sound));
  for (const slot of videoSlots)
    if (slot.ready && slot !== activeVideoSlot) slot.api.mute();
  if (!playerReady) return;
  if (engine.data.sound && !activeVideoSlot?.autoplayMuted) {
    player.unMute();
    player.setVolume(85);
  } else player.mute();
}
function videoSpec(v) {
  return {
    videoId: v.videoId,
    startSeconds: v.start || 0,
    ...(v.end ? { endSeconds: v.end } : {}),
  };
}
function pauseVideoSlot(slot) {
  if (!slot.ready) return;
  const state = slot.api.getPlayerState?.();
  if (state === 1 || state === 3) {
    slot.expectedPause = true;
    slot.api.pauseVideo();
  }
}
function stopVideoPreload() {
  clearTimeout(preloadTimer);
  for (const slot of videoSlots)
    if (slot !== activeVideoSlot && slot.ready) {
      clearTimeout(slot.warmTimer);
      slot.warmTimer = null;
      slot.warming = false;
      slot.api.mute();
      pauseVideoSlot(slot);
    }
}
function scheduleVideoPreload() {
  clearTimeout(preloadTimer);
  if (view === "feed" && !document.hidden)
    preloadTimer = setTimeout(preloadNextVideo, 30);
}
function reserveVideoSlot(item) {
  let slot = videoSlots.find((s) => s.rank === item.rank);
  if (!slot) {
    slot =
      current()?.rank === item.rank && activeVideoSlot?.rank == null
        ? activeVideoSlot
        : videoSlots.find((s) => s !== activeVideoSlot && s.rank == null);
    if (!slot && videoSlots.length < 4) slot = createVideoSlot();
    if (!slot)
      slot = videoSlots
        .filter((s) => s !== activeVideoSlot)
        .sort((a, b) => a.usedAt - b.usedAt)[0];
    if (!slot) return null;
    clearTimeout(slot.warmTimer);
    slot.warmTimer = null;
    pauseVideoSlot(slot);
    if (slot.ready) slot.api.mute();
    slot.host.classList.remove("has-frame", "is-preview");
    slot.rank = item.rank;
    slot.videoId = null;
    slot.altIndex = 0;
    slot.prepared = false;
    slot.failed = false;
  }
  slot.usedAt = ++slotClock;
  return slot;
}
function loadVideoSlot(slot, item, index, background) {
  const v = candidates(item)[index];
  if (!slot.ready || !v) return;
  clearTimeout(slot.warmTimer);
  slot.warmTimer = null;
  slot.rank = item.rank;
  slot.altIndex = index;
  slot.videoId = v.videoId;
  slot.prepared = false;
  slot.failed = false;
  slot.host.classList.remove("has-frame", "is-preview");
  if (!background) $("video-box").classList.remove("is-replacing");
  slot.warming = background;
  slot.primeStartedAt = 0;
  slot.expectedPause = false;
  slot.autoplayMuted = false;
  slot.recoveryStep = 0;
  clearTimeout(slot.recoveryTimer);
  slot.recoveryTimer = null;
  positionVideoSlots();
  if (background) {
    slot.api.mute();
    slot.api.loadVideoById(videoSpec(v));
  } else if (manuallyPaused.has(item.rank)) {
    slot.api.cueVideoById(videoSpec(v));
  } else {
    applySound();
    slot.api.loadVideoById(videoSpec(v));
  }
}
function preloadNextVideo() {
  if (
    view !== "feed" ||
    document.hidden ||
    !playerReady ||
    !current() ||
    player.getPlayerState?.() === 3
  )
    return;
  for (const offset of [1]) {
    const next = timeline[activeIndex + offset]?.item;
    if (!next || engine.unavailable.has(next.rank) || !candidates(next).length) continue;
    const slot = reserveVideoSlot(next);
    if (!slot || slot === activeVideoSlot || slot.failed) continue;
    if (slot.ready && !slot.videoId) loadVideoSlot(slot, next, slot.altIndex, true);

  }
  positionVideoSlots();
}
function activateVideoSlot(slot) {
  if (slot === activeVideoSlot) return;
  const previous = activeVideoSlot;
  if (previous) {
    pauseVideoSlot(previous);
    if (previous.ready) previous.api.mute();
  }
  clearTimeout(slot.warmTimer);
  slot.warmTimer = null;
  activeVideoSlot = slot;
  player = slot.api;
  playerReady = slot.ready;
  slot.usedAt = ++slotClock;
  slot.warming = false;
  for (const s of videoSlots) {
    const active = s === slot;
    s.host.classList.toggle("is-active", active);
    s.host.inert = !active;
    s.host.setAttribute("aria-hidden", String(!active));
  }
  positionVideoSlots();
  if (commentsPanel?.isOpen) commentsPanel.layout();
  if (!$("feed-detail-panel").hidden) placeReadingPanel($("feed-detail-panel"));
  applySound();
}
function playCurrent() {
  if (commentsPanel && current()) {
    commentsPanel.prefetch(videoContext());
    if (commentsPanel.isOpen) commentsPanel.open(videoContext());
  }
  clearTimeout(waitTimer);
  if (activeVideoSlot) clearTimeout(activeVideoSlot.startTimer);
  if (!current() || view !== "feed") return;
  const i = current();
  if (!player) {
    showVideoLoading();
    return;
  }
  const slot = reserveVideoSlot(i);
  if (!slot) return;
  const matched = slot.videoId && slot.rank === i.rank,
    switched = slot !== activeVideoSlot;
  if (switched) {
    if (matched) altIndex = slot.altIndex;
    activateVideoSlot(slot);
  }
  if (!slot.ready) {
    showVideoLoading();
    return;
  }
  const v = candidates(i)[altIndex];
  if (!v) {
    slot.api.stopVideo?.();
    showVideoStatus("Для этой находки пока нет видео.");
    return;
  }
  const token = ++playerToken;
  hideVideoStatus();
  applySound();
  if (slot.videoId === v.videoId) {
    if (slot.failed) {
      onVideoError();
      return;
    }
    if (
      switched &&
      !manuallyPaused.has(i.rank) &&
      !scrolling &&
      !horizontalTransition &&
      !$("detail").open
    )
      player.playVideo();
    else restorePlayback();
  } else loadVideoSlot(slot, i, altIndex, false);
  applySound();
  slot.startTimer = setTimeout(() => {
    if (token !== playerToken || slot !== activeVideoSlot || view !== "feed" ||
        manuallyPaused.has(i.rank) || player.getPlayerState?.() === 1) return;
    showVideoLoading();
  }, 700);
  armPlaybackRecovery(slot);
  scheduleVideoPreload();
}


// A stalled iframe must retry or use a verified alternate instead of waiting forever.
function armPlaybackRecovery(slot) {
  if (slot.recoveryTimer) return;
  const videoId = slot.videoId;
  slot.recoveryTimer = setTimeout(() => {
    slot.recoveryTimer = null;
    if (slot !== activeVideoSlot || slot.videoId !== videoId ||
        view !== "feed" || document.hidden || manuallyPaused.has(slot.rank)) return;
    if (scrolling || horizontalTransition) { armPlaybackRecovery(slot); return; }
    const state = slot.api.getPlayerState?.();
    if (state === 1 || state === 0) return;
    const step = slot.recoveryStep || 0;
    slot.recoveryStep = step + 1;
    $("video-box").classList.remove("is-replacing");
    hideVideoStatus();
    if (step === 0) {
      // Mobile browsers may reject audible autoplay without firing the API event.
      slot.autoplayMuted = true;
      slot.api.mute();
      slot.api.playVideo();
    } else if (step === 1) {
      const video = candidates(current() || {})[slot.altIndex];
      if (video) slot.api.loadVideoById(videoSpec(video));
    } else if (step === 2 && slot.altIndex + 1 < candidates(current() || {}).length) {
      altIndex = slot.altIndex + 1;
      playCurrent();
      return;
    } else {
      // Keep native controls available if the connection still needs a manual start.
      slot.host.classList.add("has-frame");
      slot.api.playVideo();
      return;
    }
    armPlaybackRecovery(slot);
  }, slot.recoveryStep ? 4000 : 2500);
}

function onVideoError() {
  clearTimeout(waitTimer);
  const i = current();
  if (!i) return;
  const actual = player?.getVideoData?.()?.video_id,
    expected = candidates(i)[altIndex]?.videoId;
  if (actual && expected && actual !== expected) return;
  $("video-box").classList.add("is-replacing");
  if (altIndex + 1 < candidates(i).length) {
    altIndex++;
    showVideoStatus("Включаю другой фрагмент…");
    playCurrent();
    return;
  }
  engine.unavailable.add(i.rank);
  autoSkipStreak++;
  showVideoStatus(
    autoSkipStreak <= 3
      ? "Ролик недоступен — подбираю следующее."
      : "YouTube не воспроизводит видео. Попробуй обновить страницу.",
  );
  if (autoSkipStreak > 3) return;
  videoSwapTimer = setTimeout(() => {
    if (view !== "feed" || current()?.rank !== i.rank) return;
    let target = activeIndex + 1;
    while (
      target < timeline.length &&
      engine.unavailable.has(timeline[target].item.rank)
    )
      target++;
    if (target >= timeline.length) appendBatch();
    if (target < timeline.length) {
      activeIndex = target;
      alignFeed();
      showItem();
    }
  }, 450);
}
function loadApi() {
  if (window.YT?.Player) {
    createPlayer();
    return;
  }
  if (document.getElementById("yt-api")) return;
  const script = document.createElement("script");
  script.id = "yt-api";
  script.src = "https://www.youtube.com/iframe_api";
  script.onerror = () => {
    clearTimeout(apiTimer);
    showVideoStatus("Не удалось подключиться к YouTube.", true);
  };
  document.head.appendChild(script);
  clearTimeout(apiTimer);
  apiTimer = setTimeout(() => {
    if (!playerReady && view === "feed")
      showVideoStatus("YouTube пока не отвечает.", true);
  }, 10000);
}
window.onYouTubeIframeAPIReady = createPlayer;
function primeOpeningFrame(slot) {
  clearTimeout(slot.warmTimer);
  if (!slot.warming || slot === activeVideoSlot) return;
  // Decode a short opening frame once and retain the buffered iframe. Never seek on promotion.
  slot.warmTimer = setTimeout(() => {
    slot.warmTimer = null;
    if (slot === activeVideoSlot || !slot.warming) return;
    slot.warming = false;
    slot.prepared = true;
    pauseVideoSlot(slot);
    positionVideoSlots();
  }, 120);
}
function handleVideoState(slot, e) {
  const actual = slot.api.getVideoData?.()?.video_id;
  if (actual && slot.videoId && actual !== slot.videoId) return;
  if (e.data === 1) {
    const videoId = slot.videoId;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (slot.videoId === videoId) slot.host.classList.add("has-frame");
    }));
  } else if (e.data === 5) slot.host.classList.add("has-frame");
  if (slot !== activeVideoSlot) {
    if (e.data === 2) {
      slot.expectedPause = false;
      if (!slot.warming && !slot.failed) slot.prepared = true;
      positionVideoSlots();
    }
    if (e.data === 1) {
      slot.api.mute();
      if (slot.warming) {
        slot.prepared = true;
        positionVideoSlots();
        primeOpeningFrame(slot);
      } else pauseVideoSlot(slot);
    }
    return;
  }
  const i = current();
  if (e.data === 1) {
    autoSkipStreak = 0;
    $("video-box").classList.remove("is-replacing");
    slot.expectedPause = false;
    clearTimeout(waitTimer);
    clearTimeout(slot.recoveryTimer);
    slot.recoveryTimer = null;
    slot.recoveryStep = 0;
    clearTimeout(slot.startTimer);
    hideVideoStatus();
    if (
      view !== "feed" ||
      scrolling ||
      horizontalTransition ||
      $("detail").open
    ) {
      pausePlayer();
      return;
    }
    if (i) {
      playedItems.add(i.rank);
      manuallyPaused.delete(i.rank);
    }
    applySound();
    scheduleVideoPreload();
  } else if (e.data === 2) {
    clearTimeout(slot.startTimer);
    const fromApp = slot.expectedPause;
    slot.expectedPause = false;
    if (
      !fromApp &&
      i &&
      playedItems.has(i.rank) &&
      view === "feed" &&
      !scrolling &&
      !horizontalTransition &&
      !$("detail").open
    )
      manuallyPaused.add(i.rank);
    if (i && manuallyPaused.has(i.rank)) {
      clearTimeout(slot.recoveryTimer);
      slot.recoveryTimer = null;
    } else armPlaybackRecovery(slot);
    hideVideoStatus();
  } else if (e.data === 3 || e.data === -1) {
    armPlaybackRecovery(slot);
  } else if (e.data === 5 || e.data === 0) {
    clearTimeout(slot.startTimer);
    $("video-box").classList.remove("is-replacing");
    hideVideoStatus();
  }
}
function createVideoSlot() {
  const n = videoSlots.length,
    host = document.createElement("div"),
    mount = n === 0 ? $("youtube-player") : document.createElement("div");
  host.className = "video-slot";
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  if (n === 0) mount.replaceWith(host);
  else $("video-box").appendChild(host);
  mount.id = "youtube-player-" + n;
  host.appendChild(mount);
  const slot = {
    host,
    api: null,
    ready: false,
    rank: null,
    videoId: null,
    altIndex: 0,
    prepared: false,
    warming: false,
    expectedPause: false,
    failed: false,
    usedAt: ++slotClock,
  };
  videoSlots.push(slot);
  slot.api = new YT.Player(mount.id, {
    width: "100%",
    height: "100%",
    host: "https://www.youtube-nocookie.com",
    playerVars: {
      autoplay: n === 0 ? 1 : 0,
      mute: n === 0 ? 0 : 1,
      playsinline: 1,
      controls: 1,
      rel: 0,
      origin: location.origin,
    },
    events: {
      onReady: () => {
        slot.ready = true;
        if (slot === activeVideoSlot) {
          clearTimeout(apiTimer);
          playerReady = true;
          applySound();
          playCurrent();
        } else if (view === "feed" && !document.hidden) {
          const item = timeline.slice(activeIndex + 1, activeIndex + 3)
            .find((entry) => entry.item.rank === slot.rank)?.item;
          if (item && !slot.videoId)
            loadVideoSlot(slot, item, slot.altIndex, true);
        }
      },
      onStateChange: (e) => handleVideoState(slot, e),
      onError: () => {
        const actual = slot.api.getVideoData?.()?.video_id;
        if (actual && slot.videoId && actual !== slot.videoId) return;
        if (slot === activeVideoSlot) {
          onVideoError();
          return;
        }
        const item = items.find((i) => i.rank === slot.rank);
        if (item && slot.altIndex + 1 < candidates(item).length) {
          loadVideoSlot(slot, item, slot.altIndex + 1, true);
        } else {
          slot.failed = true;
          slot.warming = false;
          slot.api.mute();
          pauseVideoSlot(slot);
        }
      },
      onAutoplayBlocked: () => {
        if (slot === activeVideoSlot && !slot.autoplayMuted && !manuallyPaused.has(slot.rank)) {
          slot.autoplayMuted = true;
          slot.api.mute();
          slot.api.playVideo();
          return;
        }
        if (slot === activeVideoSlot) {
          clearTimeout(waitTimer);
          $("video-box").classList.remove("is-replacing");
          showVideoLoading("Нажми ▶ в плеере, чтобы запустить трейлер");
        } else {
          clearTimeout(slot.warmTimer);
          slot.warmTimer = null;
          slot.warming = false;
          slot.api.mute();
        }
        slot.host.classList.add("has-frame");
        positionVideoSlots();
      },
    },
  });
  return slot;
}
function createPlayer() {
  if (player || !engine) return;
  const slot = createVideoSlot();
  activateVideoSlot(slot);
}

function next(decision) {
  if (horizontalTransition) return;
  if (decision) rateAndSlide(decision);
  else moveFeed(1);
}
function swipeNodes() {
  return [document.querySelector(".feed-page.active"), $("video-box")].filter(
    Boolean,
  );
}
function clearSwipeStyles() {
  document.querySelectorAll(".feed-page,#video-box").forEach((node) => {
    node.style.removeProperty("transform");
    node.style.removeProperty("opacity");
    node.style.removeProperty("will-change");
  });
  document.querySelectorAll(".stamp").forEach((node) => {
    node.style.opacity = 0;
    node.textContent = node.classList.contains("yes") ? "В МОЁ" : "МИМО";
  });
}
function cancelSwipeMotion() {
  motionVersion++;
  swipeGesture = null;
  horizontalTransition = false;
  runningAnimations.forEach((a) => a.cancel());
  runningAnimations = [];
  clearSwipeStyles();
  document.querySelector(".feed-shell").classList.remove("is-switching");
  scrolling = false;
}
function drawSwipe(dx) {
  const width = $("swipe-area").clientWidth,
    angle = Math.max(-10, Math.min(10, (dx / width) * 10));
  for (const node of swipeNodes()) {
    node.style.willChange = "transform, opacity";
    node.style.transform = `translate3d(${dx}px,0,0) rotate(${angle}deg)`;
    node.style.opacity = String(
      Math.max(0.65, 1 - (Math.abs(dx) / width) * 0.25),
    );
  }
  const host = $("video-box");
  if (host) {
    host.querySelector(".stamp.yes").style.opacity =
      dx > 15 ? Math.min(1, dx / 100) : 0;
    host.querySelector(".stamp.no").style.opacity =
      dx < -15 ? Math.min(1, -dx / 100) : 0;
  }
}
async function animateSwipeNodes(nodes, to, duration, from = null) {
  if (reducedMotion()) {
    nodes.forEach((node) => {
      node.style.transform = to.transform;
      node.style.opacity = to.opacity;
    });
    return;
  }
  const animations = nodes.map((node) =>
    node.animate(
      [
        from || {
          transform: getComputedStyle(node).transform,
          opacity: getComputedStyle(node).opacity,
        },
        to,
      ],
      { duration, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" },
    ),
  );
  runningAnimations.push(...animations);
  await Promise.all(animations.map((a) => a.finished.catch(() => {})));
  for (const [index, animation] of animations.entries()) {
    if (animation.playState === "finished") {
      nodes[index].style.transform = to.transform;
      nodes[index].style.opacity = to.opacity;
      animation.cancel();
    }
  }
  runningAnimations = runningAnimations.filter((a) => !animations.includes(a));
}
async function springBack() {
  const token = ++motionVersion;
  horizontalTransition = true;
  document.querySelector(".feed-shell").classList.add("is-switching");
  await animateSwipeNodes(
    swipeNodes(),
    { transform: "none", opacity: "1" },
    200,
  );
  if (token !== motionVersion) return;
  clearSwipeStyles();
  horizontalTransition = false;
  document.querySelector(".feed-shell").classList.remove("is-switching");
  restorePlayback();
}
// Animate the card and the mounted players around the same point; never reparent the iframe.
async function rateAndSlide(decision, watched = false) {
  if (horizontalTransition || !current()) return;
  const i = current(),
    index = activeIndex,
    token = ++motionVersion,
    sign = decision === "like" ? 1 : -1;
  swipeGesture = null;
  horizontalTransition = true;
  clearTimeout(scrollTimer);
  clearTimeout(waitTimer);
  scrolling = true;
  pausePlayer();
  document.querySelector(".feed-shell").classList.add("is-switching");
  if (watched) {
    engine.markWatched(i.rank, decision);
    toast(
      decision === "like"
        ? "Смотрел — добавлено в годноту"
        : "Смотрел — не понравилось",
    );
  } else {
    engine.decide(i.rank, decision);
    if (decision === "like" && engine.data.feedType === "watchlist") engine.defer(i.rank);
    toast(
      decision === "like"
        ? "Добавлено в «Буду смотреть»"
        : "Больше не предложу",
    );
  }
  updateDecisions();
  const stamp = $("video-box").querySelector(
    sign > 0 ? ".stamp.yes" : ".stamp.no",
  );
  stamp.style.opacity = 1;
  if (watched) stamp.textContent = sign > 0 ? "СМОТРЕЛ ♥" : "СМОТРЕЛ ×";
  await animateSwipeNodes(
    swipeNodes(),
    {
      transform: `translate3d(${sign * $("swipe-area").clientWidth * 1.3}px,0,0) rotate(${sign * 12}deg)`,
      opacity: "0",
    },
    260,
  );
  if (token !== motionVersion || view !== "feed" || activeIndex !== index)
    return;
  pruneFeed(null, true);
  clearSwipeStyles();
  alignFeed();
  scrolling = false;
  showItem();
  if (!current()) {
    toast("Оценка сохранена. Новых находок пока нет");
    horizontalTransition = false;
    document.querySelector(".feed-shell").classList.remove("is-switching");
    return;
  }
  await animateSwipeNodes(
    swipeNodes(),
    { transform: "none", opacity: "1" },
    180,
    {
      transform: `translate3d(${-sign * 36}px,0,0) scale(.98)`,
      opacity: ".45",
    },
  );
  if (token !== motionVersion) return;
  clearSwipeStyles();
  horizontalTransition = false;
  document.querySelector(".feed-shell").classList.remove("is-switching");
  restorePlayback();
  if (activeIndex === timeline.length - 1) appendBatch();
}
function closeFeedDetails() {
  $("feed-detail-panel").hidden = true;
  document.body.classList.remove("details-open");
}
function bindDetails(container, i) {
  container.querySelectorAll("[data-detail-watched]").forEach(
    (button) =>
      (button.onclick = () => {
        const value = button.dataset.detailWatched;
        if (view === "feed") {
          closeFeedDetails();
          rateAndSlide(value, true);
        } else {
          engine.markWatched(i.rank, value);
          $("detail").close();
          renderCatalog();
          toast(
            value === "like"
              ? "Добавлено в годноту"
              : "Просмотрено — не предлагать",
          );
        }
      }),
  );
}
function info(id) {
  const i = items.find((x) => x.rank === Number(id));
  if (!i) return;
  const html = LibraryViews.details(i, engine.tasteMatch(i), {
    ...viewHelpers(),
    inFeed: view === "feed",
  });
  if (view === "feed") {
    commentsPanel?.close();
    $("feed-detail-content").innerHTML = html;
    $("feed-detail-content").scrollTop = 0;
    $("feed-detail-panel").hidden = false;
    document.body.classList.add("details-open");
    placeReadingPanel($("feed-detail-panel"));
    $("feed-detail-content").scrollTop = 0;
    bindDetails($("feed-detail-content"), i);
  } else {
    $("detail-content").innerHTML = html;
    $("detail").showModal();
    $("detail").scrollTop = 0;
    bindDetails($("detail-content"), i);
  }
}
async function init() {
  // Fetch the iframe API while the canonical library and profile are loading.
  loadApi();
  document.addEventListener("pointerdown", () => {
    if (!engine || view !== "feed" || !activeVideoSlot?.autoplayMuted) return;
    activeVideoSlot.autoplayMuted = false;
    applySound();
    if (!manuallyPaused.has(current()?.rank)) restorePlayback();
  }, { passive: true });
  // Start both requests together; do not reveal a stale local catalog before the profile merge.
  const initialProfile = fetch("/api/profile", { signal: AbortSignal.timeout(3500), credentials: "same-origin" });
  initialProfile.catch(() => {});
  const savedPapichMin = Number(storage.getItem("dc-papich-min-score"));
  $("papich-min-score").value =
    Number.isInteger(savedPapichMin) &&
    savedPapichMin >= 1 &&
    savedPapichMin <= 10
      ? savedPapichMin
      : 1;
  $("papich-min-score").oninput = () => {
    storage.setItem("dc-papich-min-score", $("papich-min-score").value);
    renderCatalog();
  };
  try {
    const dataset = await new LibraryRepository().load();
    items = dataset.items;
    tasteSeeds = dataset.seeds;
    papichCollection = dataset.papich;
  } catch {
    document.querySelector(".catalog").innerHTML =
      '<p>Не загрузился каталог. <a href="index.html">Повторить</a></p>';
    if (route() === "feed") {
      document.body.classList.add("is-feed");
      $("feed-empty").hidden = false;
      $("feed-empty").innerHTML =
        '<h2>Каталог не загрузился</h2><p>Проверь соединение и обнови страницу.</p><a class="chip" href="feed.html">Повторить</a>';
      $("video-box").hidden = true;
    }
    return;
  }
  engine = new Discovery(items, storage, Math.random, tasteSeeds);
  cloudProfile = new CloudProfile(engine, {
    onRemote: () => {
      if (view !== "feed") renderCatalog();
      else if (timeline.length) {
        pruneFeed();
        alignFeed();
        showItem();
      }
    },
  });
  window.addEventListener("online", () =>
    cloudProfile.ready ? cloudProfile.flush() : cloudProfile.start(),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cloudProfile.flush();
  });
  engine.data.sound = true;
  engine.data.mode = "random";
  engine.data.feedType = "all";
  engine.save();
  $("mode").value = engine.data.mode;
  $("feed-type").value = engine.data.feedType;
  $("sound").innerHTML = icon(engine.data.sound ? "volume" : "mute");
  commentsPanel = new ReviewsPanel({
    repository: new ReviewRepository(),
    getContext: () => videoContext(),
    onLayout: () => measureFeed(),
    onData: (context, provider, data) => {
      if (!data.comments.length) return;
      if (
        provider === "youtube" &&
        commentsPanel.repository.peek(context, "hdrezka")?.comments.length
      )
        return;
      document.querySelectorAll(".feed-page").forEach((page, index) => {
        if (timeline[index]?.item.rank !== context.workId) return;
        const preview = page.querySelector(".comment-preview");
        const label = page.querySelector(".comments-button-copy b");
        if (preview) preview.textContent = data.comments[0].text;
        if (label)
          label.textContent =
            (provider === "hdrezka" ? "Отзывы · " : "YouTube · ") +
            Math.min(10, data.comments.length);
      });
    },
  });
  if (items.some((i) => i.type === "game"))
    $("feed-type").insertAdjacentHTML(
      "beforeend",
      '<option value="game">Только игры</option>',
    );
  $("feed-type").value = engine.data.feedType;
  document.querySelectorAll(".nav a").forEach((a) => {
    let v = a.dataset.view;
    a.innerHTML =
      icon(
        v === "catalog"
          ? "grid"
          : v === "feed"
            ? "play"
            : v === "good"
              ? "thumbUp"
              : "heart",
      ) +
      {
        catalog: "Каталог",
        feed: "Лента",
        favorites: "Буду смотреть",
        good: "Годнота",
      }[v];
    a.onclick = (e) => {
      e.preventDefault();
      navigate(v);
    };
  });
  let filters = [
    ["all", "Не решил"],
    ["rejected", "Не зашло"],
    ...(items.some((i) => i.candidatePool && i.discoveryEligible !== false && engine.isUndecided(i))
      ? [["personal", "По твоему вкусу"]] : []),
    ["papich", "Папич"],
    ["top", "IMDb 8+"],
    ["series", "Сериалы"],
    ["film", "Фильмы"],
    ["new", "С 2020 года"],
    ...(items.some((i) => i.type === "game") ? [["game", "Игры"]] : []),
  ];
  $("filters").innerHTML = filters
    .map(
      ([id, label]) =>
        `<button class="chip ${id === filter ? "active" : ""}" data-filter="${id}">${label}</button>`,
    )
    .join("");
  $("filters").onclick = (e) => {
    const b = e.target.closest("[data-filter]");
    if (b) setCatalogFilter(b.dataset.filter);
  };
  $("watchlist-types").onclick = (event) => {
    const button = event.target.closest("[data-watchlist-type]");
    if (!button) return;
    storage.setItem(view === "good" ? "dc-good-type" : "dc-watchlist-type", button.dataset.watchlistType);
    renderCatalog();
  };
  $("search").oninput = renderCatalog;
  $("catalog-sort").value =
    view === "favorites" || view === "good" || filter === "rejected"
      ? "recent"
      : filter === "papich"
        ? "papichScore-desc"
        : "order";
  $("catalog-sort").onchange = () => {
    storage.setItem(
      view === "favorites" ? "dc-watchlist-sort" : filter === "papich" ? "dc-papich-sort" : "dc-catalog-sort",
      $("catalog-sort").value,
    );
    renderCatalog();
  };
  $("grid").onclick = (e) => {
    let b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.info) info(b.dataset.info);
    if (b.dataset.trailer) {
      if (view === "catalog" && filter === "papich") {
        engine.data.feedType = "papich";
        engine.save();
        $("feed-type").value = "papich";
      }
      navigate("feed", true, +b.dataset.trailer);
    }
    if (b.dataset.save) {
      let id = +b.dataset.save;
      engine.decide(id, engine.data.decisions[id] === "like" ? null : "like");
      renderCatalog();
    }
    if (b.dataset.good) {
      if (b.dataset.good.startsWith("seed-")) engine.setGood(b.dataset.good, false);
      else engine.decide(+b.dataset.good, "dislike");
      renderCatalog();
    }
    if (b.dataset.restore) {
      engine.restoreRejected(+b.dataset.restore);
      renderCatalog();
      toast("Возвращено в каталог");
    }
    if (b.dataset.no) {
      engine.decide(+b.dataset.no, "dislike");
      renderCatalog();
      toast("Больше не предложу");
    }
  };
  $("feed-cards").onclick = (e) => {
    const b = e.target.closest("button");
    if (
      horizontalTransition ||
      !b ||
      Number(b.closest("[data-page]").dataset.page) !== activeIndex
    )
      return;
    if (b.dataset.info) {
      if (performance.now() >= suppressTitleClickUntil) info(b.dataset.info);
      return;
    }
    const action = b.dataset.action;
    if (action === "fullscreen") {
      $("video-box").requestFullscreen?.();
      return;
    } else if (action === "comments") {
      closeFeedDetails();
      if (!commentsPanel.open())
        toast("Для этого видео комментарии недоступны");
    } else if (action?.startsWith("watched-"))
      rateAndSlide(action.slice(8), true);
  };

  $("empty-catalog").onclick = () => navigate("catalog");
  $("mode").onchange = () => {
    engine.data.mode = $("mode").value;
    engine.save();
    newBatch();
  };
  $("feed-type").onchange = () => {
    engine.data.feedType = $("feed-type").value;
    engine.save();
    newBatch();
  };
  $("sound").onclick = () => {
    engine.data.sound = !engine.data.sound;
    engine.save();
    applySound();
    toast(engine.data.sound ? "Звук включён" : "Звук выключен");
  };
  $("feed-detail-panel").querySelector(".reading-close").onclick =
    closeFeedDetails;
  $("detail").querySelector(".close").onclick = () => $("detail").close();
  $("detail").onclick = (e) => {
    if (e.target === $("detail")) $("detail").close();
  };
  $("detail").addEventListener("close", () => {
    const previous = detailPlayback;
    detailPlayback = null;
    if (
      previous?.resume &&
      view === "feed" &&
      current()?.rank === previous.rank
    )
      restorePlayback();
  });
  const scroller = $("swipe-area");
  scroller.addEventListener(
    "scroll",
    () => {
      if (view !== "feed" || horizontalTransition)
        return;
      clearTimeout(scrollTimer);
      // Switch at the dominant card, without pausing/restarting at every scroll event.
      const visibleIndex = Math.max(0, Math.min(timeline.length - 1,
        Math.round(scroller.scrollTop / pageHeight())));
      if (visibleIndex !== activeIndex) settleFeed();
      scrollTimer = setTimeout(settleFeed, 70);
    },
    { passive: true },
  );
  scroller.addEventListener("scrollend", () => {
    clearTimeout(scrollTimer);
    settleFeed();
  });
  scroller.addEventListener("pointerdown", (e) => {
    if (
      horizontalTransition ||
      scrolling ||
      e.button !== 0 ||
      !e.isPrimary ||
      e.target.closest(
        "button:not(.title-button),a,select,iframe,.video-box",
      ) ||
      !e.target.closest(".feed-page.active")
    )
      return;
    swipeGesture = {
      x: e.clientX,
      y: e.clientY,
      index: activeIndex,
      id: e.pointerId,
      locked: false,
    };
  });
  scroller.addEventListener("pointermove", (e) => {
    const g = swipeGesture;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (!g.locked) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        swipeGesture = null;
        return;
      }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      g.locked = true;
      scroller.setPointerCapture?.(e.pointerId);
    }
    drawSwipe(dx);
  });
  scroller.addEventListener("pointerup", (e) => {
    const g = swipeGesture;
    if (!g || e.pointerId !== g.id) return;
    swipeGesture = null;
    if (scroller.hasPointerCapture?.(e.pointerId))
      scroller.releasePointerCapture(e.pointerId);
    if (!g.locked) return;
    suppressTitleClickUntil = performance.now() + 450;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (
      g.index === activeIndex &&
      Math.abs(dx) > Math.max(65, Math.min(100, scroller.clientWidth * 0.22)) &&
      Math.abs(dx) > Math.abs(dy) * 1.2
    )
      rateAndSlide(dx > 0 ? "like" : "dislike");
    else springBack();
  });
  scroller.addEventListener("pointercancel", () => {
    const locked = swipeGesture?.locked;
    swipeGesture = null;
    if (locked) suppressTitleClickUntil = performance.now() + 450;
    if (locked && !horizontalTransition) springBack();
  });
  window.onkeydown = (e) => {
    if (
      view !== "feed" ||
        $("detail").open ||
      commentsPanel?.isOpen ||
      /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(e.target.tagName)
    )
      return;
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "ArrowRight") next("like");
      if (e.key === "ArrowLeft") next("dislike");
      if (e.key === "ArrowDown") moveFeed(1);
      if (e.key === "ArrowUp") moveFeed(-1);
    }
  };
  new ResizeObserver(() => {
    if (view === "feed") {
      cancelSwipeMotion();
      measureFeed();
      alignFeed();
    }
  }).observe(scroller);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pausePlayer();
      stopVideoPreload();
    } else if (view === "feed") {
      restorePlayback();
      scheduleVideoPreload();
    }
  });
  window.onpopstate = () => {
    if (route() === "catalog") {
      filter = ["papich", "rejected"].includes(
        new URLSearchParams(location.search).get("category"),
      )
        ? new URLSearchParams(location.search).get("category")
        : "all";
      $("catalog-sort").value =
        filter === "papich"
          ? "papichScore-desc"
          : filter === "rejected"
            ? "recent"
            : "order";
      document
        .querySelectorAll("[data-filter]")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.filter === filter),
        );
    }
    navigate(route(), false);
  };
  await cloudProfile.start(initialProfile);
  engine.freezeRecommendations();
  applySound();
  navigate(route(), false);
  history.replaceState({ view }, "", location.href);
}
function route() {
  return location.pathname.includes("good")
    ? "good"
    : location.pathname.includes("favorites")
      ? "favorites"
      : location.pathname.includes("catalog")
        ? "catalog"
        : "feed";
}
init().catch(() => {
  document.querySelector(".catalog").innerHTML = '<p>Не удалось открыть сайт. <a href="">Повторить</a></p>';
}).finally(() => {
  document.body.classList.remove("booting");
  document.getElementById("app-loading")?.remove();
});
