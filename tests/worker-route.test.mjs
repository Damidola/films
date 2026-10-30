import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import worker from "../.site-build/dist/server/index.js";
const get = (path, options) =>
  worker.fetch(new Request("https://site.test" + path, options), {}, {});
test("one HTML shell serves all routes; canonical library, images, HEAD, ETag and errors work", async () => {
  const root = await get("/");
  assert.equal(root.status, 200);
  assert.match(await root.text(), /app\.js\?v=\d+/);
  for (const route of [
    "/catalog.html",
    "/feed.html",
    "/favorites.html",
    "/good.html",
  ])
    assert.equal((await get(route)).status, 200);
  const response = await get("/library.json"),
    library = await response.json();
  assert.equal(library.schemaVersion, 1);
  assert.ok(library.items.length >= 537);
  assert.equal(new Set(library.items.map((item) => item.rank)).size, library.items.length);
  assert.ok(!library.items.some(i => i.productionCountries?.some(code => ["RU", "SU"].includes(code))));
  assert.ok(library.seeds.some((i) => i.title === "Nathan for You"));
  assert.equal(
    (
      await get("/library.json", {
        headers: { "If-None-Match": response.headers.get("etag") },
      })
    ).status,
    304,
  );
  const image = await get("/assets/0.webp");
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.deepEqual(
    Buffer.from(await image.arrayBuffer()),
    await fs.readFile(new URL("../dist/assets/0.webp", import.meta.url)),
  );
  assert.equal((await get("/index.html", { method: "HEAD" })).status, 200);
  assert.equal((await get("/unknown")).status, 404);
  assert.equal((await get("/api/comments?videoId=bad")).status, 400);
  assert.equal((await get("/api/reviews?workId=0")).status, 400);
});
test("built review API serves genuine HDrezka snapshot under canonical work identity", async () => {
  const response = await get("/api/reviews?workId=236&source=hdrezka");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.workId, 236);
  assert.equal(data.provider, "hdrezka");
  const snapshot = JSON.parse(await fs.readFile(new URL("../dist/reviews/hdrezka/236.json", import.meta.url), "utf8"));
  assert.equal(data.source.host, "hdrezka.me");
  assert.equal(data.comments.length, 20);
  assert.deepEqual(data.comments, snapshot.comments);
  assert.equal(data.stale, true);
});
