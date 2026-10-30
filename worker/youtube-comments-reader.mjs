/** Public logged-out YouTube comment reader for Workers (no Node dependencies).
 * Uses the official YouTube domain; no API key, cookies, account, region override,
 * or restricted-content flags. Undocumented response schema may change.
 * Call this server-side; browser cross-origin requests are not dependable.
 */
const ENDPOINT = 'https://www.youtube-nocookie.com/youtubei/v1/next';
const CONTEXT = {client: {clientName: 'WEB', clientVersion: '2.20261014.00.00', hl: 'en'}};
function* nodes(value, key) {
  if (Array.isArray(value)) {
    for (const child of value) yield* nodes(child, key);
  } else if (value && typeof value === 'object') {
    if (Object.hasOwn(value, key)) yield value[key];
    for (const child of Object.values(value)) yield* nodes(child, key);
  }
}
const richText = value => value?.simpleText ?? (value?.runs ?? []).map(run => run.text ?? '').join('');
function integer(value) {
  const digits = String(value ?? '').match(/\d[\d,]*/);
  return digits ? Number(digits[0].replaceAll(',', '')) : null;
}
async function post(payload, fetchFn, signal) {
  const response = await fetchFn(ENDPOINT, {
    method: 'POST', signal,
    headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'},
    body: JSON.stringify({context: CONTEXT, ...payload}),
  });
  if (!response.ok) throw new Error(`YouTube comments HTTP ${response.status}`);
  const raw = await response.text();
  if (raw.length > 5_000_000) throw new Error('YouTube response too large');
  const result = JSON.parse(raw);
  if (result.error) throw new Error(`YouTube comments: ${result.error.message ?? 'request failed'}`);
  return result;
}
export function parseYouTubeComments(data, videoId, limit = 10) {
  const entities = new Map([...nodes(data, 'commentEntityPayload')].map(p => [p.properties?.commentId, p]));
  const comments = [];
  for (const thread of nodes(data.onResponseReceivedEndpoints ?? [], 'commentThreadRenderer')) {
    const model = thread.commentViewModel?.commentViewModel;
    const payload = entities.get(model?.commentId);
    let row;
    if (payload) {
      const properties = payload.properties ?? {};
      const author = payload.author ?? {};
      const toolbar = payload.toolbar ?? {};
      row = {
        id: properties.commentId,
        author: author.displayName ?? '',
        authorChannelId: author.channelId ?? '',
        authorAvatar: author.avatarThumbnailUrl ?? '',
        text: properties.content?.content ?? '',
        // A11y contains exact count; short display text can be abbreviated (1.2K).
        likes: integer(toolbar.likeCountA11y),
        publishedText: properties.publishedTime ?? '',
        owner: Boolean(author.isCreator),
        pinned: Boolean(thread.pinnedCommentBadge),
      };
    } else {
      const old = thread.comment?.commentRenderer;
      if (old) row = {
        id: old.commentId,
        author: richText(old.authorText),
        authorChannelId: old.authorEndpoint?.browseEndpoint?.browseId ?? '',
        authorAvatar: old.authorThumbnail?.thumbnails?.at(-1)?.url ?? '',
        text: richText(old.contentText),
        likes: integer(old.voteCount?.accessibility?.accessibilityData?.label ?? richText(old.voteCount)),
        publishedText: richText(old.publishedTimeText),
        owner: Boolean(old.authorIsChannelOwner),
        pinned: Boolean(old.pinnedCommentBadge),
      };
    }
    if (row?.id && row.text && !comments.some(c => c.id === row.id)) {
      row.url = `https://www.youtube.com/watch?v=${videoId}&lc=${encodeURIComponent(row.id)}`;
      comments.push(row);
    }
    if (comments.length >= limit) break;
  }
  const header = [...nodes(data, 'commentsHeaderRenderer')][0];
  const total = integer(richText(header?.countText));
  const selectedOrder = header?.sortMenu?.sortFilterSubMenuRenderer?.subMenuItems?.find(item => item.selected)?.title;
  return {comments, total, order: selectedOrder === 'Newest' ? 'newest' : 'top'};
}
export async function readYouTubeComments(videoId, fetchFn = fetch, signal) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  const initial = await post({videoId}, fetchFn, signal);
  const primary = [...nodes(initial, 'videoPrimaryInfoRenderer')][0];
  const owner = [...nodes(initial, 'videoOwnerRenderer')][0];
  const videoTitle = richText(primary?.title);
  const videoChannel = richText(owner?.title);
  const section = [...nodes(initial, 'itemSectionRenderer')].find(s =>
    s.sectionIdentifier === 'comment-item-section' || s.targetId === 'comments-section');
  if (!section) throw new Error('Public comments section unavailable');
  const token = [...nodes(section.contents ?? [], 'continuationCommand')].find(c => c.token)?.token;
  if (!token) throw new Error('Public comments continuation unavailable');
  const continuation = await post({continuation: token}, fetchFn, signal);
  const parsed = parseYouTubeComments(continuation, videoId);
  if (!parsed.comments.length && parsed.total !== 0) throw new Error('No readable public comments returned');
  return {
    videoId, videoTitle, videoChannel,
    fetchedAt: new Date().toISOString(),
    source: ENDPOINT, sourceType: 'youtube-direct',
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    status: 'ok', ...parsed,
    // Relative date text is supplied by YouTube. No exact timestamp is invented.
  };
}
