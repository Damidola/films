import { ReviewCache } from "./cache.mjs";
import { readHdrezkaReviews } from "./hdrezka.mjs";
import { readTrailerReviews } from "./youtube.mjs";
const unavailable = (work, provider, reason) => ({
  schemaVersion: 1,
  workId: work.rank,
  provider,
  status: "unavailable",
  reason,
  comments: [],
  fetchedAt: new Date().toISOString(),
  source:
    provider === "hdrezka" && work.reviewSource
      ? {
          name: "HDrezka",
          host: new URL(work.reviewSource.url).hostname,
          url: work.reviewSource.url,
        }
      : null,
});
export class ReviewService {
  constructor({
    works,
    loadSnapshot = async () => null,
    fetchFn = fetch,
    cache = new ReviewCache(),
    timeout = 6500,
  } = {}) {
    this.works = works;
    this.loadSnapshot = loadSnapshot;
    this.fetchFn = fetchFn;
    this.cache = cache;
    this.timeout = timeout;
  }
  validSnapshot(data, work, provider, videoId) {
    return (
      data?.schemaVersion === 1 &&
      data.workId === work.rank &&
      data.provider === provider &&
      Array.isArray(data.comments) &&
      (provider !== "youtube" || data.videoId === videoId) &&
      (provider !== "hdrezka" || data.source?.url === work.reviewSource?.url)
    );
  }
  async get({ workId, provider = "hdrezka", videoId, refresh = false }, ctx) {
    const work = this.works.get(Number(workId));
    if (!work) throw Error("unknown-work");
    if (!["hdrezka", "youtube"].includes(provider))
      throw Error("unknown-provider");
    if (
      provider === "youtube" &&
      (!/^[\w-]{11}$/.test(videoId || "") || !work.videoIds.includes(videoId))
    )
      throw Error("wrong-video");
    const key = [
      work.rank,
      provider,
      provider === "youtube" ? videoId : "",
    ].join(":");
    const update = () =>
      this.cache.coalesce(key, async () => {
        if (provider === "hdrezka" && !work.reviewSource) {
          const data = unavailable(work, provider, "page-not-found");
          this.cache.put(key, data);
          return data;
        }
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), this.timeout);
        try {
          const data =
            provider === "hdrezka"
              ? await readHdrezkaReviews(
                  work,
                  work.reviewSource,
                  this.fetchFn,
                  controller.signal,
                )
              : await readTrailerReviews(
                  work,
                  videoId,
                  this.fetchFn,
                  controller.signal,
                );
          const value = { ...data, live: true, stale: false };
          this.cache.put(key, value);
          return value;
        } catch (e) {
          const saved = await this.loadSnapshot({ work, provider, videoId });
          const value = this.validSnapshot(saved, work, provider, videoId)
            ? { ...saved, live: false, stale: true }
            : {
                ...unavailable(
                  work,
                  provider,
                  [
                    "source-blocked",
                    "work-identity-mismatch",
                    "review-section-unavailable",
                  ].includes(e.message)
                    ? e.message
                    : "source-unavailable",
                ),
                live: false,
                stale: false,
              };
          this.cache.put(key, value);
          return value;
        } finally {
          clearTimeout(timer);
        }
      });
    if (!refresh) {
      const hit = this.cache.get(key);
      if (hit) return hit;
      const saved = await this.loadSnapshot({ work, provider, videoId });
      if (this.validSnapshot(saved, work, provider, videoId)) {
        const data = { ...saved, live: false, stale: true };
        this.cache.put(key, data);
        if (ctx?.waitUntil) ctx.waitUntil(update().catch(() => {}));
        return data;
      }
    }
    return update();
  }
}
export async function reviewsResponse(request, ctx, service) {
  if (request.method !== "GET")
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  const p = new URL(request.url).searchParams;
  try {
    const data = await service.get(
      {
        workId: Number(p.get("workId")),
        provider: p.get("source") || "hdrezka",
        videoId: p.get("videoId"),
        refresh: p.get("refresh") === "1",
      },
      ctx,
    );
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control":
          data.status === "unavailable"
            ? "public,max-age=30"
            : "public,max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "invalid-review-request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
