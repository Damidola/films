# Public YouTube comments verification

Confirmed on 2026-10-16 using two ordinary unauthenticated POST requests to the official `https://www.youtube-nocookie.com/youtubei/v1/next` endpoint. No API key, cookies, login, restricted-content flags, location overrides, video proxying or streams are used.

1. POST WEB client context and `videoId`.
2. Find `itemSectionRenderer` whose `sectionIdentifier` is `comment-item-section` or `targetId` is `comments-section`.
3. POST that section's returned `continuationCommand.token`.
4. Preserve top-level `commentThreadRenderer` order. Join `commentViewModel.commentViewModel.commentId` to `frameworkUpdates.entityBatchUpdate.mutations[].payload.commentEntityPayload.properties.commentId`. Read text, author, exact accessible likes and relative published time from that entity.

`youtube-comments-reader.mjs` is a dependency-free Worker-compatible implementation. `fetch_youtube_comments.py` is the runnable reference implementation. `comments-direct.json` contains direct responses normalized to 10 comments each for:

- W93PtrgGM0M — Corporate final-season trailer, Comedy Central.
- w7aSybHRa6s — How To with John Wilson season-one trailer, HBO.

The two original raw JSON fixture files (`comments-next-initial.json` and `comments-next-continuation.json`) preserve one complete successful Corporate response sequence outside public assets. The first comment is `UgxeraD140gAb-R_Ae14AaABAg`, @AsbestosMuffins, “This is the show 2020 deserves, not strictly the one it needs.”, six likes, “6 years ago”. Its original deep link is https://www.youtube.com/watch?v=W93PtrgGM0M&lc=UgxeraD140gAb-R_Ae14AaABAg . That id/author/text/count exactly matches the site's previous Invidious-derived snapshot, independently confirming authenticity.

YouTube's selected Top order varies between anonymous requests. Therefore fresh top-ten snapshots can overlap by fewer than ten IDs and still be authentic. Likes can also change. `snapshotVerification` records the actual overlap for each saved direct request. Dates are relative strings returned by YouTube; the reader does not invent exact publication timestamps. The endpoint is undocumented and can change, so production callers should cache short term, handle network/schema errors, and fall back to genuine dated snapshots with a visible saved-at label.
