#!/usr/bin/env python3
"""Save up to ten public YouTube comments per catalog video for this static site.
No cookies, API keys, account data, or access-restricted videos are used.
"""
import argparse, concurrent.futures, datetime, json, pathlib, re, threading, urllib.error, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
PROVIDERS=['https://invidious.tiekoetter.com','https://inv.nadeko.net']
LOCK=threading.Lock()
def sync(video_id):
 if not re.fullmatch(r"[A-Za-z0-9_-]{11}",video_id):return {"videoId":video_id,"status":"unavailable","errors":["invalid video id"]}
 errors=[]
 for provider in PROVIDERS:
  url=f'{provider}/api/v1/comments/{video_id}?sort_by=top&hl=ru'
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'DarkComedyGuide/1.0 public-comments-reader','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=9) as response:
    raw=response.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError('oversized response')
    data=json.loads(raw)
   error=str(data.get('error',''))
   if error:
    if 'disabled' in error.lower():data={'comments':[],'disabled':True}
    else:raise ValueError(error[:120])
   if not isinstance(data.get('comments'),list):raise ValueError('invalid comments response')
   if data.get('videoId') and data['videoId']!=video_id:raise ValueError('video mismatch')
   comments=[]
   for row in data['comments']:
    if not isinstance(row,dict) or not isinstance(row.get('content'),str):continue
    comments.append({'id':str(row.get('commentId','')),'author':str(row.get('author','Автор')),'text':row['content'],'likes':max(0,int(row.get('likeCount') or 0)),'published':row.get('published'),'publishedText':str(row.get('publishedText','')),'pinned':bool(row.get('isPinned')),'owner':bool(row.get('authorIsChannelOwner'))})
    if len(comments)==10:break
   result={'videoId':video_id,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'source':provider,'order':'top','status':'disabled' if data.get('disabled') else 'ok','total':data.get('commentCount'),'comments':comments}
   dest=ROOT/'dist/comments'/f'{video_id}.json';dest.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
   return {'videoId':video_id,'status':result['status'],'count':len(comments),'source':provider}
  except Exception as e:errors.append(type(e).__name__+': '+str(e)[:100])
 return {'videoId':video_id,'status':'unavailable','errors':errors}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=0);args=parser.parse_args()
 items=json.loads((ROOT/'dist/catalog.json').read_text());ids=list(dict.fromkeys(v['videoId'] for item in items for v in [item.get('trailer'),*(item.get('trailerAlternates') or [])] if v and v.get('videoId')))
 if args.limit:ids=ids[:args.limit]
 (ROOT/'dist/comments').mkdir(exist_ok=True);results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for result in pool.map(sync,ids):
   results.append(result)
   with LOCK:print(json.dumps(result,ensure_ascii=False),flush=True)
 (ROOT/'comments-sync-report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'videos':len(results),'saved':sum(r['status']!='unavailable' for r in results),'comments':sum(r.get('count',0) for r in results)}),flush=True)
if __name__=='__main__':main()
