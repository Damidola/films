(function (root) {
  "use strict";
  const revision = "38";
  const url = (path, retry = false) => {
    const u = new URL(path, location.href);
    u.searchParams.set("poster", revision);
    if (retry) u.searchParams.set("retry", "1");
    return u.origin === location.origin ? u.pathname + u.search : u.href;
  };
  function mount(container) {
    for (const img of container.querySelectorAll("img.poster")) {
      const source = img.dataset.posterSource;
      img.addEventListener("error", () => {
        if (img.dataset.retried) return;
        img.dataset.retried = "1";
        img.loading = "eager";
        img.src = url(source, true);
      });
      // Start the first rows immediately, including when the catalog has just replaced the feed.
      img.src = url(source);
    }
  }
  root.Posters = { url, mount };
})(window);
