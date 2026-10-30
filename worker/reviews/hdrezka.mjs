import { parseHtml, elements, hasClass, cleanText } from "./html.mjs";
export function parseHdrezkaReviews(html, work, source) {
  const tree = parseHtml(html),
    nodes = [...elements(tree)];
  const pageIds = new Set(
    nodes
      .flatMap((n) => [
        n.attrs["data-kinopoisk_id"],
        n.attrs["data-kinopoisk-id"],
        n.attrs["data-soon-id"],
        n.attrs["data-kp-id"],
      ])
      .filter(Boolean),
  );
  // The public HDrezka rating links use a base64-encoded redirect URL.
  // Decode only ordinary links to Kinopoisk; never execute page scripts.
  for (const node of nodes) {
    const encoded = (node.attrs.href || "").match(/\/help\/([^/]+)\/?$/)?.[1];
    if (!encoded) continue;
    try {
      const url = new URL(decodeURIComponent(atob(encoded)));
      if (!/^(?:www\.)?kinopoisk\.ru$/.test(url.hostname)) continue;
      const id = url.pathname.match(/^\/(?:film|series)\/(\d+)\/?$/)?.[1];
      if (id) pageIds.add(id);
    } catch {}
  }
  if (
    /проверяем.{0,30}не бот|checking your browser|just a moment|challenge-platform/i.test(
      html.slice(0, 12000),
    )
  )
    throw Error("source-blocked");
  if (pageIds.size !== 1 || !pageIds.has(String(work.kpId)))
    throw Error("work-identity-mismatch");
  return parseCommentNodes(nodes, work, source);
}
function parseCommentNodes(nodes, work, source) {
  const comments = [],
    seen = new Set(),
    treeItems = new Map(nodes.filter((node) => hasClass(node, "comments-tree-item"))
      .map((node) => [node.attrs["data-id"] || node.attrs.id?.replace("comments-tree-item-", ""), node])),
    ancestors = [];
  for (const root of nodes.filter((n) => hasClass(n, "b-comment"))) {
    const local = [...elements(root)];
    const body =
      local.find((n) => /^comm-id-\d+$/.test(n.attrs.id || "")) ||
      local.find((n) => hasClass(n, "b-comment__text"));
    const author = local.find(
      (n) => hasClass(n, "name") || hasClass(n, "b-comment__user"),
    );
    if (!body || !author) continue;
    const bodies = [...elements(body)].filter((n) =>
      /^comm-id-\d+$/.test(n.attrs.id || ""),
    );
    const original = bodies.at(-1) || body;
    const id =
      original.attrs.id?.replace("comm-id-", "") || root.attrs["data-id"];
    const text = cleanText(original),
      name = cleanText(author);
    if (!id || !text || !name || seen.has(id)) continue;
    seen.add(id);
    const date = local.find(
      (n) => hasClass(n, "date") || hasClass(n, "b-comment__date"),
    );
    const likes = local.find(
      (n) =>
        n.attrs.id === "comments-likes-id-" + id ||
        n.attrs.id === "comments-ratig-layer-" + id ||
        hasClass(n, "b-comment__likes_count"),
    );
    const count = likes
      ? Number(cleanText(likes).replace(/[^\d-]/g, ""))
      : null;
    const treeItem = treeItems.get(id);
    const sourceDepth = Number(treeItem?.attrs["data-indent"] || 0);
    const depth = Number.isFinite(sourceDepth) ? Math.max(0, Math.min(20, sourceDepth)) : 0;
    const parent = depth > 0 ? ancestors[depth - 1] : null;
    ancestors[depth] = { id, author: name };
    ancestors.length = depth + 1;
    comments.push({
      id,
      depth,
      parentId: parent?.id || null,
      replyTo: parent?.author || null,
      author: name,
      text,
      publishedText: date ? cleanText(date).replace(/^оставлен\s*/, "") : "",
      likes: Number.isFinite(count) ? count : null,
      spoiler: local.some(
        (n) => hasClass(n, "title_spoiler") || hasClass(n, "text_spoiler"),
      ),
      url: source.url + "#comment-id-" + id,
    });
    if (comments.length === 20) break;
  }
  const section = nodes.some((n) =>
    ["hd-comments-list", "dle-comments-list", "comments-list"].includes(
      n.attrs.id,
    ),
  );
  if (!comments.length && !section) throw Error("review-section-unavailable");
  const countNode = nodes.find(
    (n) => n.tag === "meta" && n.attrs.property === "ya:ovs:comments",
  );
  const countButton = nodes.find((n) => n.attrs.id === "comments-list-button");
  const total = countNode
    ? Number(countNode.attrs.content)
    : countButton
      ? Number(cleanText(countButton).replace(/[^\d]/g, ""))
      : null;
  return {
    schemaVersion: 1,
    workId: work.rank,
    provider: "hdrezka",
    status: comments.length ? "ok" : "empty",
    comments,
    total: Number.isFinite(total) ? Math.max(total, comments.length) : null,
    order: "page",
    fetchedAt: new Date().toISOString(),
    source: {
      name: "HDrezka",
      host: new URL(source.url).hostname,
      url: source.url,
    },
  };
}
function registeredSource(work, source) {
  const url = new URL(source.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "hdrezka.me" ||
    url.username ||
    url.password
  )
    return false;
  if (
    !/^\/(?:series|films|cartoons|animation)\/[^/]+\/\d+-[^/]+\.html$/.test(
      url.pathname,
    )
  )
    return false;
  if (String(source.kpId) !== String(work.kpId)) return false;
  return (
    source.basis === "exact-kinopoisk-id" ||
    ([
      "exact-original-title-year",
      "reviewed-original-title-year-variant",
    ].includes(source.basis) &&
      (source.basis !== "reviewed-original-title-year-variant" ||
        Math.abs(Number(source.sourceYear) - Number(work.year)) === 1) &&
      source.matchedTitle === work.title &&
      Number(source.matchedYear) === Number(work.year))
  );
}
export async function readRegisteredHdrezkaReviews(
  work,
  source,
  fetchFn = fetch,
  signal,
) {
  if (!registeredSource(work, source)) throw Error("work-identity-mismatch");
  const url = new URL(source.url);
  const postId = url.pathname.match(/\/(\d+)-[^/]+\.html$/)[1];
  const endpoint = new URL("/ajax/get_comments/", url);
  endpoint.search = new URLSearchParams({
    news_id: postId,
    cstart: "1",
    type: "0",
    comment_id: "0",
    skin: "hdrezka",
    t: String(Date.now()),
  }).toString();
  let fragment = "";
  let parsed;
  for (let page = 1; page <= 3; page++) {
    endpoint.searchParams.set("cstart", String(page));
    const response = await fetchFn(endpoint.href, {
      redirect: "error",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw Error(
        [403, 429].includes(response.status)
          ? "source-blocked"
          : "source-http-error",
      );
    const data = await response.json();
    if (typeof data.comments !== "string" || data.comments.length > 3_000_000)
      throw Error("review-section-unavailable");
    fragment += data.comments;
    parsed = parseCommentNodes(
      [
        ...elements(
          parseHtml('<div id="hd-comments-list">' + fragment + "</div>"),
        ),
      ],
      work,
      source,
    );
    const morePages = Boolean(data.navigation?.trim());
    if (parsed.comments.length >= 20 || !morePages)
      return {
        ...parsed,
        allAvailable: parsed.comments.length < 20 && !morePages,
      };
  }
  return { ...parsed, allAvailable: false };
}
export async function readHdrezkaReviews(
  work,
  source,
  fetchFn = fetch,
  signal,
) {
  if (registeredSource(work, source))
    return readRegisteredHdrezkaReviews(work, source, fetchFn, signal);
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("invalid-source");
  const response = await fetchFn(url.href, {
    redirect: "error",
    signal,
    headers: { Accept: "text/html" },
  });
  if (!response.ok)
    throw Error(
      response.status === 403 ? "source-blocked" : "source-http-error",
    );
  if (response.url && new URL(response.url).hostname !== url.hostname)
    throw Error("source-redirected");
  if (Number(response.headers.get("content-length") || 0) > 3_000_000)
    throw Error("document-too-large");
  const html = await response.text();
  const parsed = parseHdrezkaReviews(html, work, source);
  if (parsed.comments.length || parsed.total === 0) return parsed;
  const postId = html.match(/sof\.comments\.loadComments\(\s*(\d+)\s*,/)?.[1];
  if (!postId) return parsed;
  const endpoint = new URL("/ajax/get_comments/", url);
  endpoint.search = new URLSearchParams({
    news_id: postId,
    cstart: "1",
    type: "0",
    comment_id: "0",
    skin: "hdrezka",
    t: String(Date.now()),
  }).toString();
  const commentsResponse = await fetchFn(endpoint.href, {
    redirect: "error",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!commentsResponse.ok) throw Error("review-section-unavailable");
  const data = await commentsResponse.json();
  if (typeof data.comments !== "string" || data.comments.length > 3_000_000)
    throw Error("review-section-unavailable");
  return parseHdrezkaReviews(html + data.comments, work, source);
}
