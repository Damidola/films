"""Build source-backed candidate records and enrich all canonical taste examples."""
import concurrent.futures,datetime,gzip,html,io,json,pathlib,re,threading,urllib.parse,urllib.request
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];raw=json.load(open(ROOT/'research/personal-candidates.json'));base=json.load(open(ROOT/'dist/catalog.json'));papich=json.load(open(ROOT/'dist/papich-series.json'));seeds=json.load(open(ROOT/'dist/taste-seeds.json'));old=json.load(open(ROOT/'dist/personal-candidates.json'))if(ROOT/'dist/personal-candidates.json').exists()else[];lock=threading.Lock();now=datetime.datetime.now(datetime.timezone.utc).isoformat();today=now[:10]
rankByKp={i['kpurl'].split('/')[-2]:i['rank']for i in [*base,*papich['items'],*old]if i.get('kpurl')};nextRank=max([i['rank']for i in [*base,*papich['items'],*old]])+1
imdbIds={v['imdb']for v in raw.values()if v.get('work')};ratings={}
with urllib.request.urlopen('https://datasets.imdbws.com/title.ratings.tsv.gz',timeout=25)as r,gzip.GzipFile(fileobj=r)as f:
 for line in f:
  a=line.decode().strip().split('\t')
  if a[0]in imdbIds:ratings[a[0]]={'score':float(a[1]),'votes':int(a[2])}
(ROOT/'research/personal-imdb.json').write_text(json.dumps({'checkedAt':now,'source':'https://datasets.imdbws.com/title.ratings.tsv.gz','items':ratings},indent=2)+'\n')
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=20)as r:return r.read()
def norm(s):return re.sub(r'[^a-zа-я0-9]','',s.lower().replace('ё','е'))
groups={'crime':['Криминал','Чёрный юмор','Диалоги','Цинизм'],'awkward':['Неловкость','Дискомфорт','Сатира','Как у Nathan'],'dry':['Сухой юмор','Диалоги','Цинизм','Чёрный юмор'],'weird':['Абсурд','Мета','Эксперимент','Повороты'],'horror':['Хоррор','Кровавый фарс','Грубый юмор','Чёрный юмор'],'satire':['Сатира','Провокация','Абсурд','Цинизм'],'animated':['Мульт','Абсурд','Чёрный юмор','Цинизм'],'seed':[]}
reasons={'crime':'Криминальная история с чёрным юмором и персонажами, которые сами загоняют себя в неприятности.','awkward':'Неловкие ситуации и сатира на повседневную жизнь — в духе Nathan for You и Review.','dry':'Едкие диалоги и неидеальные герои: выбор по любви к Loudermilk и сухому юмору.','weird':'Необычная форма и абсурдная логика событий, которые меняют привычный взгляд на происходящее.','horror':'Сочетание хоррора и фарса: ставка на комедийные ситуации и жанровую игру, как в «Убойных каникулах».','satire':'Провокационная сатира с неудобными героями и последствиями их решений.','animated':'Анимация с собственным характером: абсурд, чёрный юмор или необычный взгляд на повседневность.'}
records=[];evidence={}
for key,r in raw.items():
 if not r.get('work')or not r.get('kinogo'):continue
 score=ratings.get(r['imdb'],{}).get('score');seed=next((s for s in seeds if norm(s['title'])==norm(r['title'])and s['year']==r['year']),None)
 if not seed and (r['year']<2000 or score is None or score<6):continue
 kp=r['kpId'];rank=rankByKp.get(kp)
 if rank is None:rank=nextRank;nextRank+=1;rankByKp[kp]=rank
 w=r['work'];syn=html.unescape(re.sub('<[^>]+>','',w.get('description')or'')).strip();syn=syn.split('...')[0].rstrip();sentences=re.split(r'(?<=[.!?])\s+',syn);syn=' '.join(sentences[:2])
 record={'rank':rank,'title':r['title'],'ru':r['ru'],'type':r['type'],'year':r['year'],'kpurl':'https://www.kinopoisk.ru/'+('series'if r['type']=='series'else'film')+'/'+kp+'/','imdb':r['imdb'],'score':score,'scoreSource':'https://datasets.imdbws.com/title.ratings.tsv.gz','kp':float(w.get('aggregateRating',{}).get('ratingValue')or 0)or None,'kpVotes':w.get('aggregateRating',{}).get('ratingCount'),'rezka':r['rezka'],'kinogo':r['kinogo'],'source':r['rezka'],'syn':syn,'synLanguage':'ru','tags':list(dict.fromkeys(groups[r['group']]+w.get('genre',[]))), 'kind':'Анимационный '+('сериал'if r['type']=='series'else'фильм')if r['group']=='animated'else'Игровой сериал'if r['type']=='series'else'Фильм','editorialWhy':reasons.get(r['group'],''),'candidatePool':not bool(seed),'providerVerification':{'rezka':{'basis':'exact-kinopoisk-id','url':r['rezka'],'checkedAt':r['checkedAt']},'kinogo':{'basis':'exact-kinopoisk-id','url':r['kinogo'],'checkedAt':r['checkedAt']}}}
 if seed:record.update(knownLiked=True,status='Уже смотрел',seedId=seed['id']);seed.update(rank=rank,imdb=r['imdb'])
 if rank in {i['rank']for i in base}:record['candidatePool']=False
 record['_imageSource']=w.get('image',[])[-1]if isinstance(w.get('image'),list)else w.get('image');record['_runtime']=w.get('duration');records.append(record)

def enrich(i):
 key=str(i['rank']);proof={};dest=ROOT/f'dist/assets/library-{i["rank"]}.webp'
 try:
  if not dest.exists():
   rawimg=get(i['_imageSource']);im=Image.open(io.BytesIO(rawimg)).convert('RGB');im.thumbnail((320,480),Image.Resampling.LANCZOS);im.save(dest,'WEBP',quality=66,method=6)
  i['image']='assets/'+dest.name;proof['poster']=i['_imageSource']
  if i['type']=='film':
   runtime=re.search(r'PT(?:(\d+)H)?(?:(\d+)M)?',str(i.get('_runtime')));i['runtime']=int(runtime[1]or 0)*60+int(runtime[2]or 0)if runtime else None
  else:
   seed=next((s for s in seeds if s.get('rank')==i['rank']),None);existing=next((x for x in [*base,*papich['items']]if x['rank']==i['rank']and x.get('seriesStats')),None)
   if existing:i['seriesStats']=existing['seriesStats']
   else:
    show=None
    if seed and seed.get('tvmazeId'):show=json.loads(get('https://api.tvmaze.com/shows/'+str(seed['tvmazeId'])+'?embed=episodes'))
    else:
     found=json.loads(get('https://api.tvmaze.com/search/shows?q='+urllib.parse.quote(i['title'])));exact=[x['show']for x in found if norm(x['show']['name'])==norm(i['title'])and(x['show'].get('premiered')or'')[:4]==str(i['year'])]
     if len(exact)==1:show=json.loads(get('https://api.tvmaze.com/shows/'+str(exact[0]['id'])+'?embed=episodes'))
    if show:
     eps=[e for e in show.get('_embedded',{}).get('episodes',[])if e.get('number')and e.get('season',0)>0 and(e.get('airdate')or'9999')<=today];counts={}
     for e in eps:counts[e['season']]=counts.get(e['season'],0)+1
     values=[e['runtime']for e in eps if isinstance(e.get('runtime'),(int,float))and e['runtime']>0];minutes=sum(values)/len(values)if values else show.get('averageRuntime')or show.get('runtime')
     if counts and minutes:i['seriesStats']={'seasons':len(counts),'episodes':len(eps),'episodesPerSeason':round(len(eps)/len(counts),2),'episodeMinutes':round(minutes,1),'seasonEpisodes':[{'season':k,'episodes':v}for k,v in sorted(counts.items())],'ongoing':show.get('status')!='Ended','totalMinutes':round(sum(e.get('runtime')or minutes for e in eps)),'source':show['url'],'checkedAt':now}
     proof['episodes']=[{k:e.get(k)for k in ['id','season','number','airdate','runtime']}for e in eps];proof['tvmaze']=show['url']
  kp=i['kpurl'].split('/')[-2]
  try:
   xml=get('https://rating.kinopoisk.ru/'+kp+'.xml').decode();rating=re.search(r'<kp_rating[^>]*num_vote="(\d+)"[^>]*>([\d.]+)',xml)
   if rating:i['kp']=round(float(rating[2]),1);i['kpVotes']=int(rating[1]);i['kpSource']='https://rating.kinopoisk.ru/'+kp+'.xml';i['kpVerifiedAt']=now
  except Exception:pass
 except Exception as e:proof['error']=str(e)[:140]
 i.pop('_imageSource',None);i.pop('_runtime',None)
 with lock:evidence[key]=proof
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:list(pool.map(enrich,records))
existing={i['rank']:i for i in base};pool=[]
for i in records:
 if i['rank']in existing:
  olditem=existing[i['rank']];olditem.update({k:v for k,v in i.items()if k not in ['tags','candidatePool','syn','title','ru']or i.get('knownLiked')});olditem['tags']=list(dict.fromkeys(olditem.get('tags',[])+i.get('tags',[])))
 elif i.get('knownLiked'):base.append(i);existing[i['rank']]=i
 else:pool.append(i)
for i in records:
 if i.get('knownLiked'):
  seed=next(s for s in seeds if s['id']==i['seedId']);seed.update(image=i.get('image'),rank=i['rank'],imdb=i['imdb'])
(ROOT/'dist/catalog.json').write_text(json.dumps(sorted(base,key=lambda i:i['rank']),ensure_ascii=False,indent=2)+'\n');(ROOT/'dist/taste-seeds.json').write_text(json.dumps(seeds,ensure_ascii=False,indent=2)+'\n');(ROOT/'dist/personal-candidates.json').write_text(json.dumps(pool,ensure_ascii=False,separators=(',',':'))+'\n');(ROOT/'research/personal-library-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
print('Candidate pool:',len(pool),'canonical liked examples:',sum(i.get('knownLiked',False)for i in base),'without posters:',[(i['title'])for i in records if not i.get('image')],'series missing stats:',[i['title']for i in records if i['type']=='series'and not i.get('seriesStats')]);print('Unresolved seeds:',[s['title']for s in seeds if not s.get('rank')])
