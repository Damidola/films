"""Resolve public TVmaze metadata, retaining ambiguous matches for review."""
import concurrent.futures,datetime,json,pathlib,re,threading,time,unicodedata,urllib.request,urllib.parse,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
items=json.loads((ROOT/'dist/papich-series.json').read_text())['items']
cachefile=ROOT/'research/papich-tvmaze-search.json';cache=json.loads(cachefile.read_text()) if cachefile.exists() else {}
metafile=ROOT/'research/papich-series-metadata.json';metadata=json.loads(metafile.read_text()) if metafile.exists() else {'items':{}}
lock=threading.Lock();today=datetime.datetime.now(datetime.timezone.utc).date().isoformat();checked=datetime.datetime.now(datetime.timezone.utc).isoformat()
def norm(s):return re.sub(r'[^a-zа-яё0-9]','',unicodedata.normalize('NFKD',s).lower())
def get(url):
 for n in range(7):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'DarkComedyGuide/1.0 (public series metadata)'}),timeout=30) as r:return json.load(r)
  except urllib.error.HTTPError as e:
   if e.code!=429 or n==6:raise
   time.sleep(min(12,2**n))
  except (OSError,TimeoutError):
   if n==6:raise
   time.sleep(1+n)
def write():
 cachefile.write_text(json.dumps(cache,ensure_ascii=False,indent=2)+'\n');metafile.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
def statistics(show,scope=None):
 episodes=[e for e in show.get('_embedded',{}).get('episodes',[]) if e.get('number') and e.get('season',0)>0 and ((e.get('airdate') and e['airdate']<=today) or (not e.get('airdate') and show.get('status')=='Ended'))]
 if scope:episodes=[e for e in episodes if e['season'] in scope]
 counts={}
 for e in episodes:counts[e['season']]=counts.get(e['season'],0)+1
 runtimes=[e['runtime'] for e in episodes if isinstance(e.get('runtime'),(int,float)) and e['runtime']>0]
 minutes=round(sum(runtimes)/len(runtimes),1) if runtimes else show.get('averageRuntime') or show.get('runtime')
 if not counts or not minutes:raise ValueError('No confirmed episode counts/runtime')
 stats={'seasons':len(counts),'episodes':len(episodes),'episodesPerSeason':round(len(episodes)/len(counts),2),'episodeMinutes':minutes,'seasonEpisodes':[{'season':k,'episodes':v} for k,v in sorted(counts.items())],'ongoing':show.get('status')!='Ended','checkedAt':checked,'source':show['url'],'basis':'aired-or-completed-regular-episodes','runtimeSamples':len(runtimes),'totalMinutes':round(sum(runtimes)+(len(episodes)-len(runtimes))*minutes),'totalRuntimeEstimated':len(runtimes)!=len(episodes)}
 return stats,[{k:e.get(k) for k in ['id','season','number','airdate','runtime']} for e in episodes]
base=json.loads((ROOT/'dist/catalog.json').read_text());byrank={i['rank']:i for i in base}
# Explicit show IDs are added only after manual identity verification, never by fuzzy first-result matching.
overrides=ROOT/'research/papich-tvmaze-overrides.json';manual=json.loads(overrides.read_text()) if overrides.exists() else {}
def fetch(item):
 key=item['papich']['kinopoiskId']
 if metadata['items'].get(key,{}).get('seriesStats'):return 'CACHED',item['ru']
 if item['rank'] in byrank:
  old=byrank[item['rank']];entry={'seriesStats':old['seriesStats'],'image':old['image'],'tags':old.get('tags',[]),'metadataSource':old['source'],'match':'existing-exact-kinopoisk-id'}
  with lock:metadata['items'][key]=entry;write()
  return 'REUSED',item['ru']
 results=cache.get(key)
 if results is None:
  results=get('https://api.tvmaze.com/search/shows?q='+urllib.parse.quote(item['title']))
  with lock:cache[key]=results;write()
 exact=[r['show'] for r in results if norm(r['show']['name']) in {norm(item['title']),norm(item['ru'])} and (r['show'].get('premiered') or '')[:4]==str(item['year'])]
 show_id=manual.get(key,{}).get('showId')
 if not show_id and len(exact)==1:show_id=exact[0]['id']
 if not show_id:return 'REVIEW',item['ru']
 show=get(f'https://api.tvmaze.com/shows/{show_id}?embed[]=episodes');stats,episodes=statistics(show,manual.get(key,{}).get('seasons'))
 if manual.get(key,{}).get('seasons'):stats['scopeNote']=manual[key]['reason'];stats['seasonEpisodes']=[{'season':n+1,'episodes':v['episodes']} for n,v in enumerate(stats['seasonEpisodes'])]
 entry={'showId':show['id'],'name':show['name'],'premiered':show.get('premiered'),'metadataSource':show['url'],'match':'manually-verified' if key in manual else 'exact-name-and-premiere-year','seriesStats':stats,'tags':show.get('genres',[]),'tvmazeImage':(show.get('image') or {}).get('medium'),'imdb':(show.get('externals') or {}).get('imdb'),'episodes':episodes}
 with lock:metadata['items'][key]=entry;write()
 return 'OK',item['ru'],stats['seasons'],stats['episodes'],stats['totalMinutes']
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 fs={pool.submit(fetch,i):i for i in items}
 for future in concurrent.futures.as_completed(fs):
  try:print(*future.result(),flush=True)
  except Exception as e:print('ERROR',fs[future]['ru'],str(e),flush=True)
print('TOTAL',len(metadata['items']),'of',len(items),flush=True)
