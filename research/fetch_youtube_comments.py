#!/usr/bin/env python3
"""Read public top-level comments directly from YouTube's logged-out WEB response.

Uses no account, cookies, API key, region overrides or restricted-content flags.
This is an undocumented public endpoint: callers must handle schema/network failure.
Usage: python research/fetch_youtube_comments.py VIDEO_ID [VIDEO_ID ...]
"""
import datetime
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

ENDPOINT = 'https://www.youtube-nocookie.com/youtubei/v1/next'
CONTEXT = {'client': {'clientName': 'WEB', 'clientVersion': '2.20261014.00.00', 'hl': 'en'}}


def nodes(value, key):
    if isinstance(value, dict):
        if key in value:
            yield value[key]
        for child in value.values():
            yield from nodes(child, key)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child, key)


def post(payload):
    request = urllib.request.Request(ENDPOINT, data=json.dumps({'context': CONTEXT, **payload}).encode(),
        headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read(5_000_001)
        if len(raw) > 5_000_000:
            raise ValueError('Response exceeds 5 MB')
        data = json.loads(raw)
        if data.get('error'):
            raise ValueError(str(data['error'])[:240])
        return data, hashlib.sha256(raw).hexdigest()


def fetch_comments(video_id, limit=10):
    if not re.fullmatch(r'[\w-]{11}', video_id, flags=re.ASCII):
        raise ValueError('Invalid YouTube video ID')
    initial, initial_hash = post({'videoId': video_id})
    # Select the comments section semantically, never the related-videos continuation.
    title_renderer = next(nodes(initial, 'videoPrimaryInfoRenderer'), {})
    owner_renderer = next(nodes(initial, 'videoOwnerRenderer'), {})
    def rich_text(value):
        return value.get('simpleText') or ''.join(run.get('text', '') for run in value.get('runs', []))
    section = next((s for s in nodes(initial, 'itemSectionRenderer')
        if s.get('sectionIdentifier') == 'comment-item-section' or s.get('targetId') == 'comments-section'), None)
    if section is None:
        raise ValueError('Public comments section unavailable')
    token = next((c.get('token') for c in nodes(section.get('contents', []), 'continuationCommand') if c.get('token')), None)
    if not token:
        raise ValueError('Public comments continuation unavailable')
    data, continuation_hash = post({'continuation': token})
    # Current WEB UI stores text/author in entity mutations; the renderer defines top order.
    entities = {p.get('properties', {}).get('commentId'): p for p in nodes(data, 'commentEntityPayload')}
    comments = []
    for thread in nodes(data.get('onResponseReceivedEndpoints', []), 'commentThreadRenderer'):
        model = thread.get('commentViewModel', {}).get('commentViewModel', {})
        cid = model.get('commentId')
        payload = entities.get(cid)
        if payload:
            properties = payload.get('properties', {})
            author = payload.get('author', {})
            toolbar = payload.get('toolbar', {})
            # A11y contains exact count; display likeCountNotliked can be abbreviated.
            count = re.search(r'[\d,]+', toolbar.get('likeCountA11y', ''))
            likes = int(count.group().replace(',', '')) if count else 0
            comments.append({'id': cid, 'author': author.get('displayName', ''),
                'authorChannelId': author.get('channelId', ''), 'authorAvatar': author.get('avatarThumbnailUrl', ''),
                'text': properties.get('content', {}).get('content', ''), 'likes': likes,
                'publishedText': properties.get('publishedTime', ''),
                'owner': bool(author.get('isCreator')), 'pinned': bool(thread.get('pinnedCommentBadge')),
                'url': f'https://www.youtube.com/watch?v={video_id}&lc={cid}'})
        else:
            # Old WEB responses may contain a classic inline commentRenderer instead.
            old = thread.get('comment', {}).get('commentRenderer')
            if old:
                def text(v):
                    return v.get('simpleText') or ''.join(r.get('text', '') for r in v.get('runs', []))
                cid = old['commentId']
                likes = text(old.get('voteCount', {}))
                comments.append({'id': cid, 'author': text(old.get('authorText', {})),
                    'text': text(old.get('contentText', {})), 'likes': int(likes.replace(',', '')) if likes.isdigit() else None,
                    'publishedText': text(old.get('publishedTimeText', {})),
                    'owner': bool(old.get('authorIsChannelOwner')), 'pinned': bool(old.get('pinnedCommentBadge')),
                    'url': f'https://www.youtube.com/watch?v={video_id}&lc={cid}'})
        if len(comments) >= limit:
            break
    headers = list(nodes(data, 'commentsHeaderRenderer'))
    total_text = ''.join(run.get('text', '') for h in headers for run in h.get('countText', {}).get('runs', []))
    total_match = re.search(r'[\d,]+', total_text)
    return {'videoId': video_id, 'videoTitle': rich_text(title_renderer.get('title', {})),
        'videoChannel': rich_text(owner_renderer.get('title', {})), 'videoUrl': f'https://www.youtube.com/watch?v={video_id}', 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'source': ENDPOINT, 'sourceType': 'youtube-direct', 'order': 'top', 'status': 'ok',
        'total': int(total_match.group().replace(',', '')) if total_match else None,
        'comments': comments, 'evidence': {'initialSha256': initial_hash, 'continuationSha256': continuation_hash,
            'requests': 2, 'cookies': False, 'authentication': False,
            'datePrecision': 'YouTube returns relative publishedTime; no exact timestamp is invented.'}}


if __name__ == '__main__':
    result = []
    for vid in sys.argv[1:] or ['W93PtrgGM0M', 'w7aSybHRa6s']:
        try:
            item = fetch_comments(vid)
            snapshot_path = pathlib.Path(__file__).resolve().parents[1] / 'dist' / 'comments' / f'{vid}.json'
            if snapshot_path.exists():
                previous = json.loads(snapshot_path.read_text())
                by_id = {c['id']: c for c in previous.get('comments', [])}
                item['snapshotVerification'] = {'snapshotSource': previous.get('source'), 'snapshotFetchedAt': previous.get('fetchedAt'),
                    'matchedIds': sum(c['id'] in by_id for c in item['comments']),
                    'matchedExactAuthorTextLikes': sum(c['id'] in by_id and all(c.get(k) == by_id[c['id']].get(k) for k in ['author','text','likes']) for c in item['comments'])}
            result.append(item)
        except Exception as error:
            result.append({'videoId': vid, 'status': 'unavailable', 'error': str(error)})
    dest = pathlib.Path(__file__).with_name('comments-direct.json')
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps([{'videoId': r['videoId'], 'status': r['status'], 'count': len(r.get('comments', [])), 'snapshotVerification': r.get('snapshotVerification'), 'error': r.get('error')} for r in result]))
