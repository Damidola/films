/** Compatibility adapter for the old video-only API; all reading/caching lives in ReviewService. */
import { ReviewService } from "./reviews/service.mjs";
import { ReviewCache } from "./reviews/cache.mjs";
const legacyReviewCache = new ReviewCache();
export async function commentsResponse(
  request,
  ctx,
  { allowedVideos, fallback, fetchFn = fetch } = {},
) {
  const p = new URL(request.url).searchParams,
    id = p.get("videoId");
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public,max-age=300",
      },
    });
  if (request.method !== "GET")
    return reply({ error: "method-not-allowed" }, 405);
  if (!/^[\w-]{11}$/.test(id || "") || !allowedVideos?.has(id))
    return reply({ error: "unknown-video" }, 400);
  const work = { rank: 1, videoIds: [id] };
  const service = new ReviewService({
    works: new Map([[1, work]]),
    fetchFn,
    cache: legacyReviewCache,
    loadSnapshot: async () => {
      const data = await fallback?.(id);
      return data
        ? {
            ...data,
            schemaVersion: 1,
            workId: 1,
            provider: "youtube",
            status: data.comments.length ? "ok" : "empty",
          }
        : null;
    },
  });
  const data = await service.get(
    {
      workId: 1,
      provider: "youtube",
      videoId: id,
      refresh: p.get("refresh") === "1",
    },
    ctx,
  );
  return data.status === "unavailable"
    ? reply({ error: "comments-unavailable", videoId: id }, 503)
    : reply(data);
}
