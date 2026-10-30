"""Refresh aired regular-season statistics from the catalog's public TVmaze IDs."""
import concurrent.futures,datetime,json,pathlib,re,time,urllib.request,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'dist/catalog.json').read_text());today=datetime.datetime.now(datetime.timezone.utc).date().isoformat();checked=datetime.datetime.now(datetime.timezone.utc).isoformat();evidence={}
def get(url):
 for attempt in range(5):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'DarkComedyGuide/1.0 (public TVmaze metadata)'}),timeout=35) as r:return json.load(r)
  except urllib.error.HTTPError as e:
   if e.code!=429 or attempt==4:raise
   time.sleep(min(10,2**(attempt+1)))
  except (OSError,TimeoutError):
   if attempt==4:raise
   time.sleep(2)
def fetch(item):
 match=re.search(r'tvmaze.com/shows/(\d+)',item.get('source',''))
 if match:show_id=match[1]
 else:
  show=get('https://api.tvmaze.com/lookup/shows?imdb='+item['imdb']);show_id=show['id']
 url=f'https://api.tvmaze.com/shows/{show_id}?embed[]=seasons&embed[]=episodes';show=get(url)
 episodes=[e for e in show.get('_embedded',{}).get('episodes',[]) if e.get('number') and e.get('season',0)>0 and e.get('airdate') and e['airdate']<=today]
 counts={}
 for e in episodes:counts[e['season']]=counts.get(e['season'],0)+1
 runtimes=[e['runtime'] for e in episodes if isinstance(e.get('runtime'),(int,float)) and e['runtime']>0]
 if not counts:raise ValueError('No confirmed aired regular episodes for '+item['title'])
 minutes=round(sum(runtimes)/len(runtimes),1) if runtimes else show.get('averageRuntime') or show.get('runtime')
 if not minutes:raise ValueError('No runtime for '+item['title'])
 stats={'seasons':len(counts),'episodes':len(episodes),'episodesPerSeason':round(len(episodes)/len(counts),2),'episodeMinutes':minutes,'seasonEpisodes':[{'season':k,'episodes':v} for k,v in sorted(counts.items())],'ongoing':show.get('status')!='Ended','checkedAt':checked,'source':show['url'],'apiSource':url,'basis':'aired-regular-episodes','runtimeBasis':'mean-of-aired-episodes' if runtimes else 'show-average','runtimeSamples':len(runtimes),'totalMinutes':round(sum(runtimes)+(len(episodes)-len(runtimes))*minutes),'totalRuntimeEstimated':len(runtimes)!=len(episodes),'totalRuntimeBasis':'aired-regular-episode-runtimes-with-average-for-missing'}
 return item['rank'],stats,{'showId':show['id'],'name':show['name'],'url':show['url'],'status':show.get('status'),'stats':stats,'episodes':[{'id':e['id'],'season':e['season'],'number':e['number'],'airdate':e['airdate'],'runtime':e.get('runtime')} for e in episodes]}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 futures={pool.submit(fetch,i):i for i in catalog if i['type']=='series'}
 for future in concurrent.futures.as_completed(futures):
  item=futures[future]
  try:
   rank,stats,proof=future.result();item['seriesStats']=stats;evidence[str(rank)]=proof;print(f"OK {rank}: {stats['seasons']} seasons, {stats['episodes']} episodes, {stats['episodeMinutes']} min",flush=True)
  except Exception as e:print(f"ERROR {item['rank']} {item['title']}: {e}",flush=True)
(ROOT/'research/series-stats.json').write_text(json.dumps({'checkedAt':checked,'definition':'Aired regular numbered episodes; specials and future episodes excluded. Average episode count includes the aired part of an ongoing season.','items':evidence},ensure_ascii=False,indent=2)+'\n')
(ROOT/'dist/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print('TOTAL',len(evidence),'of',sum(i['type']=='series' for i in catalog),flush=True)
