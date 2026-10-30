import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {
  parseHdrezkaReviews,
  readHdrezkaReviews,
} from "../worker/reviews/hdrezka.mjs";
import { ReviewCache } from "../worker/reviews/cache.mjs";
import { ReviewService, reviewsResponse } from "../worker/reviews/service.mjs";
import { compileLibrary, reviewRegistry } from "../scripts/library-data.mjs";
const html = await fs.readFile(
    new URL("./fixtures/hdrezka-barry.html", import.meta.url),
    "utf8",
  ),
  work = {
    rank: 236,
    kpId: "972587",
    videoIds: ["12345678901"],
    reviewSource: { url: "https://hd-rezka.tv/347-barri-2018.html" },
  };
const parsed = parseHdrezkaReviews(html, work, work.reviewSource);
test("real public HTML yields original authors, dates, texts and IDs, without nested duplicates", () => {
  assert.equal(parsed.comments.length, 4);
  assert.deepEqual(
    parsed.comments.map((c) => c.id),
    ["330", "320", "318", "313"],
  );
  assert.equal(parsed.comments[0].author, "Скажи банка");
  assert.match(parsed.comments[0].text, /сайт/);
  assert.equal(
    parsed.comments[0].url,
    "https://hd-rezka.tv/347-barri-2018.html#comment-id-330",
  );
  assert.equal(parsed.source.host, "hd-rezka.tv");
  assert.ok(parsed.comments.every((c) => c.publishedText));
});
test("wrong work, blocked source and absent review section are distinct failures; real empty page is not a failure", () => {
  assert.throws(
    () => parseHdrezkaReviews(html, { ...work, kpId: "1" }, work.reviewSource),
    /identity/,
  );
  assert.throws(
    () =>
      parseHdrezkaReviews(
        "<title>Проверяем, что вы не бот!</title>",
        work,
        work.reviewSource,
      ),
    /blocked/,
  );
  assert.throws(
    () =>
      parseHdrezkaReviews(
        '<div data-kinopoisk_id="972587"></div>',
        work,
        work.reviewSource,
      ),
    /section/,
  );
  const empty = parseHdrezkaReviews(
    '<div data-kinopoisk_id="972587"></div><div id="dle-comments-list"></div>',
    work,
    work.reviewSource,
  );
  assert.equal(empty.status, "empty");
  assert.deepEqual(empty.comments, []);
});
test("public page adapter rejects redirects and does not fetch arbitrary caller URLs", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      readHdrezkaReviews(work, work.reviewSource, async (u, options) => {
        calls++;
        assert.equal(u, work.reviewSource.url);
        assert.equal(options.redirect, "error");
        return new Response("", { status: 403 });
      }),
    /blocked/,
  );
  assert.equal(calls, 1);
});
test("service coalesces concurrent reads, caches failures briefly, and isolates work/source/video keys", async () => {
  let calls = 0,
    now = 0;
  const works = new Map([
    [236, work],
    [237, { ...work, rank: 237, kpId: "999" }],
  ]);
  const service = new ReviewService({
    works,
    cache: new ReviewCache({ now: () => now }),
    fetchFn: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return new Response(html);
    },
  });
  const requests = Array.from({ length: 8 }, () =>
    service.get({ workId: 236 }),
  );
  const result = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.ok(result.every((d) => d.status === "ok"));
  assert.equal((await service.get({ workId: 237 })).status, "unavailable");
  assert.equal(calls, 2);
  await service.get({ workId: 237 });
  assert.equal(calls, 2);
  now = 31000;
  await service.get({ workId: 237 });
  assert.equal(calls, 3);
  await assert.rejects(
    () =>
      service.get({ workId: 236, provider: "youtube", videoId: "WRONGWRONG1" }),
    /wrong-video/,
  );
});
test("saved genuine reviews return immediately during source outage and remain correctly identified", async () => {
  let update;
  const service = new ReviewService({
    works: new Map([[236, work]]),
    loadSnapshot: async () => parsed,
    fetchFn: async () => {
      throw Error("offline");
    },
  });
  const data = await service.get(
    { workId: 236 },
    { waitUntil: (p) => (update = p) },
  );
  assert.equal(data.stale, true);
  assert.equal(data.live, false);
  assert.equal(data.source.host, "hd-rezka.tv");
  assert.deepEqual(data.comments, parsed.comments);
  await update;
  const refreshed = await service.get({ workId: 236, refresh: true });
  assert.deepEqual(refreshed.comments, parsed.comments);
});
test("API rejects missing work and unknown provider rather than accepting a URL to fetch", async () => {
  const service = new ReviewService({ works: new Map([[236, work]]) });
  for (const query of [
    "workId=0",
    "workId=236&source=evil",
    "workId=236&source=youtube&videoId=WRONGWRONG1",
    "url=https://127.0.0.1/",
  ]) {
    const r = await reviewsResponse(
      new Request("https://test/api/reviews?" + query),
      {},
      service,
    );
    assert.equal(r.status, 400);
  }
});
test("one compiled canonical library supplies unique stable IDs and the exact same review registry", async () => {
  const library = await compileLibrary(new URL("..", import.meta.url).pathname);
  assert.equal(
    library.items.length,
    new Set(library.items.map((i) => i.rank)).size,
  );
  const registry = reviewRegistry(library);
  assert.equal(registry.size, library.items.length);
  assert.equal(registry.get(236).reviewSource.url, library.items.find(i => i.rank === 236).reviewSource.url);
  assert.equal(registry.get(236).reviewSource.kpId, work.kpId);
  assert.ok(
    library.seeds.every(
      (s) => !s.canonicalRank || registry.has(s.canonicalRank),
    ),
  );
});
test("browser repository deduplicates per work/source and never lets a stale snapshot replace live data", async () => {
  const ctx = {
    window: {},
    fetch: () => {},
    Date,
    Map,
    Set,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(
    await fs.readFile(
      new URL("../dist/repositories/reviews.js", import.meta.url),
      "utf8",
    ),
    ctx,
  );
  let requests = 0;
  const repository = new ctx.window.ReviewRepository({
    fetchFn: async (url) => {
      requests++;
      if (url.startsWith("reviews/")) {
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            ...parsed,
            comments: parsed.comments.slice(0, 1),
            stale: true,
          }),
        );
      }
      return new Response(
        JSON.stringify({ ...parsed, live: true, stale: false }),
      );
    },
  });
  const context = { workId: 236, videoId: "12345678901" };
  await Promise.all([repository.load(context), repository.load(context)]);
  assert.equal(requests, 2);
  assert.equal(repository.peek(context, "hdrezka").comments.length, 4);
  assert.equal(repository.peek(context, "hdrezka").live, true);
});

test("a snapshot for another work is rejected even during a network outage", async () => {
  const another = { ...work, rank: 237 };
  const service = new ReviewService({
    works: new Map([[237, another]]),
    loadSnapshot: async () => parsed,
    fetchFn: async () => {
      throw Error("offline");
    },
  });
  const data = await service.get({ workId: 237 });
  assert.equal(data.workId, 237);
  assert.equal(data.status, "unavailable");
  assert.deepEqual(data.comments, []);
});

test("every Papich archive card has a correctly scoped playable preview and canonical merge retains it", async () => {
  const archive = JSON.parse(
    await fs.readFile(
      new URL("../dist/papich-series.json", import.meta.url),
      "utf8",
    ),
  );
  const library = await compileLibrary(new URL("..", import.meta.url).pathname);
  for (const record of archive.items) {
    const i = library.items.find((i) => i.rank === record.rank);
    if (record.productionCountries?.some(code => ["RU", "SU"].includes(code))) {
      assert.equal(i, undefined, record.title + " excluded by origin policy");
      continue;
    }
    assert.ok(i.trailer?.videoId, record.title);
    assert.match(i.trailer.videoId, /^[\w-]{11}$/);
    assert.ok(i.trailer.availability.embed);
    assert.ok(i.trailer.availability.regions.includes("UA"));
    if (["clip", "fan-trailer", "related-edition"].includes(i.trailer.kind))
      assert.equal(i.discoveryEligible, false);
  }
  assert.equal(archive.items.length, 166);
});

test("public HDrezka AJAX comments retain verified work identity and original text", async () => {
  const source = {url:"https://hdrezka.me/series/comedy/123-example-2025.html"};
  const encoded = btoa(encodeURIComponent("https://www.kinopoisk.ru/series/972587/"));
  const page = `<a href="/help/${encoded}/">Кинопоиск</a><button id="comments-list-button">Отзывы (<em>42</em>)</button><div id="hd-comments-list"></div><script>sof.comments.loadComments(123,1,true,0,0)</script>`;
  const calls=[];
  const fetchFn=async(url)=>{calls.push(url);return url===source.url?new Response(page):Response.json({comments:'<div class="b-comment"><span class="name">Public reader</span><span class="date">вчера</span><div id="comm-id-456">Original public comment</div></div>'});};
  const result=await readHdrezkaReviews(work,source,fetchFn);
  assert.equal(result.comments.length,1);
  assert.equal(result.comments[0].author,"Public reader");
  assert.equal(result.comments[0].text,"Original public comment");
  assert.equal(result.total,42);
  assert.equal(new URL(calls[1]).pathname,"/ajax/get_comments/");
  assert.equal(new URL(calls[1]).searchParams.get("news_id"),"123");
  calls.length=0;
  await assert.rejects(readHdrezkaReviews({...work,kpId:"999"},source,fetchFn),/identity/);
  assert.equal(calls.length,1);
});

test("verified HDrezka sources use the public comments endpoint directly and retain the first twenty", async () => {
  const { readRegisteredHdrezkaReviews } = await import("../worker/reviews/hdrezka.mjs");
  const source = {url:"https://hdrezka.me/series/comedy/123-example-2025.html",kpId:work.kpId,basis:"exact-kinopoisk-id"};
  const comments = Array.from({length:25},(_,n)=>`<div class="b-comment"><span class="name">Reader ${n}</span><div id="comm-id-${n+1}">Public text ${n}</div></div>`).join("");
  let calls=0;
  const fetchFn=async(url)=>{calls++;assert.equal(new URL(url).pathname,"/ajax/get_comments/");assert.equal(new URL(url).searchParams.get("news_id"),"123");return Response.json({comments});};
  const data=await readHdrezkaReviews(work,source,fetchFn);
  assert.equal(calls,1);
  assert.equal(data.comments.length,20);
  assert.equal(data.comments[19].text,"Public text 19");
  await assert.rejects(readRegisteredHdrezkaReviews(work,{...source,kpId:"999"},fetchFn),/identity/);
  const named={...source,basis:"exact-original-title-year",matchedTitle:"Example",matchedYear:2025};
  await assert.rejects(readRegisteredHdrezkaReviews({...work,title:"Different",year:2025},named,fetchFn),/identity/);
  assert.equal(calls,1);
});
