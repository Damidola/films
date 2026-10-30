(function (root) {
  "use strict";
  class ReviewRepository {
    constructor({
      fetchFn = (...args) => root.fetch(...args),
      now = Date.now,
      limit = 60,
    } = {}) {
      this.fetchFn = fetchFn;
      this.now = now;
      this.limit = limit;
      this.cache = new Map();
      this.pending = new Map();
      this.listeners = new Set();
      this.revisions = new Map();
    }
    key(context, provider) {
      return [
        context.workId,
        provider,
        provider === "youtube" ? context.videoId : "",
      ].join(":");
    }
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    peek(context, provider) {
      return this.cache.get(this.key(context, provider))?.data;
    }
    valid(data, context, provider) {
      return (
        data?.schemaVersion === 1 &&
        data.workId === context.workId &&
        data.provider === provider &&
        ["ok", "empty", "disabled", "unavailable"].includes(data.status) &&
        Array.isArray(data.comments)
      );
    }
    async request(url, timeout) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), timeout);
      try {
        const r = await this.fetchFn(url, { signal: controller.signal });
        if (!r.ok) throw Error("reviews-network");
        return await r.json();
      } finally {
        clearTimeout(timer);
      }
    }
    legacySnapshot(data, context) {
      return {
        ...data,
        schemaVersion: 1,
        workId: context.workId,
        provider: "youtube",
        status:
          data.status === "disabled"
            ? "disabled"
            : data.comments?.length
              ? "ok"
              : "empty",
        source: {
          name: "YouTube",
          host: "youtube.com",
          url: "https://www.youtube.com/watch?v=" + context.videoId,
        },
        live: false,
        stale: true,
      };
    }
    load(context, provider = "hdrezka", { force = false } = {}) {
      if (
        !Number.isInteger(context?.workId) ||
        !["hdrezka", "youtube"].includes(provider)
      )
        return Promise.resolve();
      const key = this.key(context, provider),
        old = this.cache.get(key);
      if (!force && this.pending.has(key)) return this.pending.get(key);
      if (
        !force &&
        old &&
        this.now() - old.time <
          (old.data.status === "unavailable" ? 30000 : 300000)
      )
        return Promise.resolve(old.data);
      const revision = (this.revisions.get(key) || 0) + 1;
      this.revisions.set(key, revision);
      const accept = (data) => {
        if (!this.valid(data, context, provider)) throw Error("reviews-schema");
        if (this.revisions.get(key) !== revision) return;
        const prior = this.cache.get(key);
        if (data.stale && prior?.data.live) return;
        if (this.cache.size >= this.limit && !this.cache.has(key))
          this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { data, time: this.now() });
        for (const fn of this.listeners) fn(context, provider, data);
      };
      const query = new URLSearchParams({
        workId: String(context.workId),
        source: provider,
      });
      if (provider === "youtube") query.set("videoId", context.videoId);
      if (force) query.set("refresh", "1");
      const tasks = [];
      if (!old) {
        const path =
          provider === "hdrezka"
            ? `reviews/hdrezka/${context.workId}.json?v=74`
            : `comments/${context.videoId}.json?v=41`;
        tasks.push(
          this.request(path, 2500).then((data) =>
            accept(
              provider === "youtube"
                ? this.legacySnapshot(data, context)
                : { ...data, live: false, stale: true },
            ),
          ),
        );
      }
      tasks.push(this.request("/api/reviews?threads=1&" + query, 8000).then(accept));
      const pending = Promise.allSettled(tasks)
        .then(() => {
          if (this.revisions.get(key) === revision && !this.cache.has(key))
            accept({
              schemaVersion: 1,
              workId: context.workId,
              provider,
              status: "unavailable",
              reason: "network",
              comments: [],
              source: null,
              live: false,
              stale: false,
            });
          return this.peek(context, provider);
        })
        .finally(() => {
          if (this.pending.get(key) === pending) this.pending.delete(key);
        });
      this.pending.set(key, pending);
      return pending;
    }
    async prefetch(context) {
      return this.load(context, "hdrezka");
    }
  }
  root.ReviewRepository = ReviewRepository;
})(window);
