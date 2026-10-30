"use strict";
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [320, 360, 390, 430]) {
      const height = width === 320 ? 568 : 720;
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
      });
      await context.route("https://www.youtube.com/iframe_api", (r) =>
        r.abort(),
      );
      const p = await context.newPage(),
        errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.addInitScript(() =>
        localStorage.setItem(
          "dc-state-v2",
          JSON.stringify({
            collectionsVersion: 2,
            decisions: Object.fromEntries(
              Array.from({ length: 51 }, (_, n) => [n + 1, "like"]),
            ),
            watched: { 55: "like" },
          }),
        ),
      );
      await p.goto("http://localhost:8000/catalog.html");
      await p.waitForFunction(() => typeof engine !== "undefined" && engine);
      for (const view of ["catalog", "favorites", "good"]) {
        if (view !== "catalog")
          await p.locator(`[data-view="${view}"]`).click();
        const layout = await p.evaluate(() => {
          const main = document.querySelector(".catalog"),
            nav = document.querySelector(".nav"),
            sort = document.querySelector("#catalog-sort"),
            card = document.querySelector(".library-card"),
            poster = card.querySelector(".poster");
          return {
            viewport: innerWidth,
            doc: document.documentElement.scrollWidth,
            main: main.getBoundingClientRect().toJSON(),
            nav: nav.getBoundingClientRect().toJSON(),
            sort: sort.getBoundingClientRect().toJSON(),
            grid: document
              .querySelector("#grid")
              .getBoundingClientRect()
              .toJSON(),
            poster: poster.getBoundingClientRect().toJSON(),
            overflow: main.scrollWidth - main.clientWidth,
            navPosition: getComputedStyle(nav).position,
          };
        });
        assert.ok(layout.doc <= width, `${width}/${view}: body overflow`);
        assert.ok(layout.overflow <= 1, `${width}/${view}: content overflow`);
        assert.ok(
          layout.sort.right <= width - 10,
          `${width}/${view}: sort offscreen`,
        );
        assert.ok(
          layout.main.bottom <= layout.nav.top + 1,
          `${width}/${view}: navigation overlays main`,
        );
        assert.ok(
          layout.grid.top <= (view === "catalog" ? 220 : 165),
          `${width}/${view}: too much top chrome ${layout.grid.top}`,
        );
        assert.ok(layout.poster.width >= 120, `${width}/${view}: small poster`);
        assert.equal(layout.navPosition, "relative");
        await p
          .locator(".catalog")
          .evaluate((e) => (e.scrollTop = e.scrollHeight));
        const last = await p.locator(".library-card").last().boundingBox();
        assert.ok(
          last.y + last.height <= layout.nav.top - 10,
          `${width}/${view}: final card hidden by navigation`,
        );
        await p.locator(".catalog").evaluate((e) => (e.scrollTop = 0));
        if (width === 360)
          await p.screenshot({ path: `/workspace/mobile-${view}-v43.png` });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: catalog/favorites/good at 320/360/390/430px; compact top, bounded native sort, large posters, scrollable cards and reserved navigation row",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
