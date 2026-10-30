const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const rating = (v) => v === null || v === "like" || v === "dislike";
export async function profileResponse(request, env, works) {
  // Owner-requested single shared profile: no accounts, email, or sign-in.
  const user = "single-user";
  if (!env.DB) return json({ error: "profile-storage-unavailable" }, 503);
  try {
    if (request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT work_id, title, decision, watched, good, updated_at, bookmarked_at FROM taste_feedback WHERE user_id = ? ORDER BY work_id",
      )
        .bind(user)
        .all();
      return json({
        mode: "single-user",
        records: rows.results.map((r) => ({
          workId: r.work_id,
          title: r.title,
          decision: r.decision,
          watched: r.watched,
          good: Boolean(r.good),
          updatedAt: r.updated_at,
          addedAt: r.decision === "like" ? r.bookmarked_at || r.updated_at : null,
        })),
      });
    }
    if (request.method !== "PUT")
      return json({ error: "method-not-allowed" }, 405);
    const url = new URL(request.url),
      origin = request.headers.get("origin");
    if (
      (origin && origin !== url.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return json({ error: "wrong-origin" }, 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return json({ error: "expected-json" }, 415);
    const text = await request.text();
    if (text.length > 150000) return json({ error: "profile-too-large" }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid-json" }, 400);
    }
    if (!Array.isArray(body.records) || body.records.length > 1000)
      return json({ error: "invalid-records" }, 400);
    const seen = new Set(),
      now = Date.now(),
      records = [];
    for (const r of body.records) {
      if (
        !Number.isInteger(r.workId) ||
        !works.has(r.workId) ||
        seen.has(r.workId) ||
        !rating(r.decision) ||
        !rating(r.watched) ||
        typeof r.good !== "boolean" ||
        !Number.isSafeInteger(r.updatedAt) ||
        r.updatedAt < 0 ||
        r.updatedAt > now + 300000 ||
        (r.addedAt != null && (!Number.isSafeInteger(r.addedAt) || r.addedAt < 0 || r.addedAt > now + 300000))
      )
        return json({ error: "invalid-record" }, 400);
      seen.add(r.workId);
      records.push({
        ...r,
        title: works.get(r.workId).ru || works.get(r.workId).title,
        updatedAt: Math.min(now, r.updatedAt),
        addedAt: r.decision === "like" ? Math.min(now, r.addedAt || r.updatedAt) : null,
      });
    }
    // Each record is independent: other devices cannot erase absent works.
    const sql =
      "INSERT INTO taste_feedback (user_id, work_id, title, decision, watched, good, updated_at, bookmarked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, work_id) DO UPDATE SET title=excluded.title, decision=excluded.decision, watched=excluded.watched, good=excluded.good, updated_at=excluded.updated_at, bookmarked_at=CASE WHEN excluded.decision='like' THEN CASE WHEN taste_feedback.decision='like' THEN COALESCE(taste_feedback.bookmarked_at, excluded.bookmarked_at) ELSE excluded.bookmarked_at END ELSE NULL END WHERE excluded.updated_at > taste_feedback.updated_at";
    for (let n = 0; n < records.length; n += 80)
      await env.DB.batch(
        records
          .slice(n, n + 80)
          .map((r) =>
            env.DB.prepare(sql).bind(
              user,
              r.workId,
              r.title,
              r.decision,
              r.watched,
              r.good ? 1 : 0,
              r.updatedAt,
              r.addedAt,
            ),
          ),
      );
    return json({ savedAt: now, count: records.length });
  } catch {
    return json({ error: "profile-storage-unavailable" }, 503);
  }
}
