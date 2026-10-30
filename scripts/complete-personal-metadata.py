import concurrent.futures,datetime,gzip,json,pathlib,re,urllib.parse,urllib.request
R=pathlib.Path(__file__).resolve().parents[1];base=json.load(open(R/'dist/catalog.json'));pool=json.load(open(R/'dist/personal-candidates.json'));now=datetime.datetime.now(datetime.timezone.utc).isoformat();proof={}
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=15)as r:return r.read()
def f(i):
 if i['type']!='series'or i.get('seriesStats'):return
 try:
  k=i['kpurl'].split('/')[-2];sid={'734884':3136,'693935':1443,'276360':1518}.get(k)
  if not sid:
   found=json.loads(get('https://api.tvmaze.com/search/shows?q='+urllib.parse.quote(i['title'])));exact=[s['show']for s in found if re.sub('[^a-z0-9]','',s['show']['name'].lower())==re.sub('[^a-z0-9]','',i['title'].lower())]
   if len(exact)!=1:return
   sid=exact[0]['id']
  s=json.loads(get('https://api.tvmaze.com/shows/'+str(sid)+'?embed=episodes'));i['imdb']=i.get('imdb')or s['externals'].get('imdb');eps=[e for e in s['_embedded']['episodes']if e.get('number')and e.get('season',0)>0 and(e.get('airdate')or'9999')<=now[:10]];counts={}
  for e in eps:counts[e['season']]=counts.get(e['season'],0)+1
  values=[e['runtime']for e in eps if e.get('runtime')];minutes=sum(values)/len(values)if values else s.get('averageRuntime')or s.get('runtime')
  if counts and minutes:i['seriesStats']={'seasons':len(counts),'episodes':len(eps),'episodesPerSeason':round(len(eps)/len(counts),2),'episodeMinutes':round(minutes,1),'seasonEpisodes':[{'season':k,'episodes':v}for k,v in sorted(counts.items())],'ongoing':s.get('status')!='Ended','totalMinutes':round(sum(e.get('runtime')or minutes for e in eps)),'source':s['url'],'checkedAt':now}
  proof[str(i['rank'])]={'show':s['url'],'episodeIds':[e['id']for e in eps]}
 except Exception as e:proof[str(i['rank'])]={'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as ex:list(ex.map(f,base+pool))
missing={i['imdb']for i in base+pool if i.get('imdb')and i.get('score')is None};ratings={}
if missing:
 with urllib.request.urlopen('https://datasets.imdbws.com/title.ratings.tsv.gz',timeout=25)as r,gzip.GzipFile(fileobj=r)as f:
  for line in f:
   a=line.decode().strip().split('\t')
   if a[0]in missing:ratings[a[0]]={'score':float(a[1]),'votes':int(a[2])}
for i in base+pool:
 if i.get('score')is None and i.get('imdb')in ratings:i['score']=ratings[i['imdb']]['score'];i['scoreSource']='https://datasets.imdbws.com/title.ratings.tsv.gz'
 if i.get('kp')is None:
  try:
   u='https://rating.kinopoisk.ru/'+i['kpurl'].split('/')[-2]+'.xml';xml=get(u).decode();m=re.search(r'<kp_rating[^>]*num_vote="(\d+)"[^>]*>([\d.]+)',xml)
   if m:i.update(kp=round(float(m[2]),1),kpVotes=int(m[1]),kpSource=u,kpVerifiedAt=now)
  except Exception:pass
(R/'dist/catalog.json').write_text(json.dumps(base,ensure_ascii=False,indent=2)+'\n');(R/'dist/personal-candidates.json').write_text(json.dumps(pool,ensure_ascii=False,separators=(',',':'))+'\n');(R/'research/personal-metadata-completion.json').write_text(json.dumps({'checkedAt':now,'tvmaze':proof,'imdb':ratings},ensure_ascii=False,indent=2)+'\n')
print('missing stats:',[i['title']for i in base+pool if i['type']=='series'and not i.get('seriesStats')], 'missing scores:',[i['title']for i in base if i.get('score')is None])
