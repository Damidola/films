"""Source-backed metadata and English embeddable trailer research for the requested 50 additions."""
import concurrent.futures,datetime,gzip,html,json,pathlib,re,threading,urllib.request,urllib.parse
R=pathlib.Path(__file__).resolve().parents[1];P=R/'research/dark-refresh-50-research.json';tasks=json.load(open(R/'research/dark-refresh-50-targets.json'));data=json.load(open(P))if P.exists()else{};lock=threading.Lock();now=datetime.datetime.now(datetime.timezone.utc).isoformat()
UA={'User-Agent':'Mozilla/5.0','Accept-Encoding':'gzip'}
def get(u,body=None,headers=None):
 req=urllib.request.Request(u,data=body,headers={**UA,**(headers or{})})
 with urllib.request.urlopen(req,timeout=12)as r:
  b=r.read();b=gzip.decompress(b)if b[:2]==b'\x1f\x8b'else b
  return b.decode('utf8','replace'),r.geturl()
def norm(s):return re.sub('[^a-zа-я0-9]','',html.unescape(s).lower().replace('ё','е'))
def nodes(v,key):
 if isinstance(v,dict):
  if key in v:yield v[key]
  for x in v.values():yield from nodes(x,key)
 elif isinstance(v,list):
  for x in v:yield from nodes(x,key)
def txt(x):return x.get('simpleText')or''.join(v.get('text','')for v in x.get('runs',[]))
def yt(route,payload,android=False):
 c={'clientName':'ANDROID','clientVersion':'20.10.38','androidSdkVersion':30,'hl':'en'}if android else{'clientName':'WEB','clientVersion':'2.20261014.00.00','hl':'en'}
 s,_=get('https://www.youtube-nocookie.com/youtubei/v1/'+route,json.dumps({'context':{'client':c},**payload}).encode(),{'Content-Type':'application/json','User-Agent':'com.google.android.youtube/20.10.38 (Linux; U; Android 11)'if android else'Mozilla/5.0'})
 return json.loads(s)
def trailers(t):
 out=[];query=f"{t['title']} {t['year']} {'series' if t['type']=='series' else 'movie'} official trailer English";raw=yt('search',{'query':query});tokens=set(re.findall('[a-z0-9]+',t['title'].lower()))-{'the','and','of','a','an','for','to','in','with','s'};found=[]
 for v in nodes(raw,'videoRenderer'):
  title=txt(v.get('title',{}));ch=txt(v.get('ownerText',{}));words=set(re.findall('[a-z0-9]+',title.lower()))
  if not re.search('trailer|promo',title,re.I)or re.search('deutsch|german|русск|трейлер|dublado|espa[nñ]ol|italiano|bande.annonce|reaction|recap|honest trailer|fan.?made|concept|opening|explained|reviewed|trailer review',title+' '+ch,re.I):continue
  if tokens and len(tokens&words)/len(tokens)<.70:continue
  if any(y!=str(t['year']) for y in re.findall(r'\b(19\d\d|20\d\d)\b',title))and t['title']in['The Job','The Cleaner','Players','Ted','The Baker']:continue
  vid=v['videoId']
  if vid not in found:found.append(vid)
  if len(found)>=7:break
 for vid in found:
  try:
   w=yt('player',{'videoId':vid});a=yt('player',{'videoId':vid},True);m=w.get('microformat',{}).get('playerMicroformatRenderer',{});d=w.get('videoDetails',{});ps=a.get('playabilityStatus',{});fmt=a.get('streamingData',{}).get('adaptiveFormats',[]);caps=a.get('captions',{}).get('playerCaptionsTracklistRenderer',{}).get('captionTracks',[]);asr=[x['languageCode']for x in caps if x.get('kind')=='asr'];duration=int(d.get('lengthSeconds')or 0);height=max([f.get('height',0)for f in fmt]+[0]);channel=d.get('author','');en=any(x.startswith('en')for x in asr);basis='English automatic speech transcript'if en else None
   if not asr and(any(x.get('languageCode','').startswith('en')for x in caps)or re.search('HBO|Netflix|Prime Video|Apple TV|Paramount|FX|A24|Sony|Universal|Comedy Central|Lionsgate|Warner|Rotten Tomatoes|Adult Swim|BBC|Channel 4|E4|IFC|NEON|Shout|TV Promos|Peacock|Crackle|Freeform|Amazon|Channel 5',channel,re.I)):
    en=True;basis='English captions or original-language publisher trailer'
   if ps.get('status')!='OK'or not ps.get('playableInEmbed')or 'UA'not in m.get('availableCountries',[])or not en or height<720 or not 30<=duration<=360:continue
   out.append({'videoId':vid,'url':'https://www.youtube.com/watch?v='+vid,'title':d['title'],'channel':channel,'kind':'trailer','duration':duration,'language':'en','languageBasis':basis,'maxHeight':height,'verifiedAt':now,'availability':{'embed':True,'regions':['UA']+(['RU']if'RU'in m.get('availableCountries',[])else[]),'checkedAt':now,'source':'YouTube public player metadata'}})
   if len(out)>=2:break
  except Exception:pass
 return out

def research(t):
 key=t['title']+'|'+str(t['year'])+'|'+t['type']
 if data.get(key,{}).get('complete'):return
 row={**t,'checkedAt':now}
 try:
  search,_=get('https://hdrezka.asia/search/?q='+urllib.parse.quote(t['title']));links=list(dict.fromkeys(re.findall(r'href="(/(?:serialy|multserialy|filmy|multfilmy)/[^"?#]+)"',search)))
  for href in links:
   if str(t['year'])not in href:continue
   if t['type']=='film'and'serialy'in href:continue
   page,url=get('https://hdrezka.asia'+href)
   for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',page,re.S):
    try:w=json.loads(raw)
    except Exception:continue
    if w.get('@type')not in['Movie','TVSeries']or str(w.get('datePublished'))!=str(t['year']):continue
    if norm(t['title'])not in[norm(w.get('alternateName','')),norm(re.sub(r'\s*\([^)]*\)$','',w.get('name','')))]:continue
    ids={i.get('propertyID'):str(i.get('value'))for i in w.get('identifier',[])}
    if not ids.get('КиноПоиск')or not ids.get('IMDb'):continue
    row.update(work=w,rezka=url,kpId=ids['КиноПоиск'],imdb=ids['IMDb']);break
   if row.get('work'):break
  if not row.get('work'):raise Exception('exact-provider-work-not-found')
  xml,_=get('https://rating.kinopoisk.ru/'+row['kpId']+'.xml')
  for tag,field in [('kp_rating','kp'),('imdb_rating','score')]:
   m=re.search('<'+tag+'[^>]*num_vote="(\d+)"[^>]*>([\d.]+)',xml)
   if m:row[field]=float(m[2]);row[field+'Votes']=int(m[1])
  if row.get('score',0)<6:raise Exception('IMDb-below-six-or-unavailable')
  other,_=get('https://kinogo.lifestyle'+urllib.parse.urlparse(row['rezka']).path)
  if not re.search(r'(?:propertyID"\s*:\s*"КиноПоиск"\s*,\s*"value"\s*:\s*"?'+row['kpId']+r'\b)',other):
   if row['kpId']not in other:raise Exception('direct-kinogo-identity-not-found')
  row['kinogo']='https://kinogo.lifestyle'+urllib.parse.urlparse(row['rezka']).path
  if t['type']=='series':
   results=json.loads(get('https://api.tvmaze.com/search/shows?q='+urllib.parse.quote(t['title']))[0]);matches=[v['show']for v in results if norm(v['show']['name'])==norm(t['title'])and(v['show']['premiered']or'').startswith(str(t['year']))]
   if not matches:raise Exception('exact-tvmaze-series-not-found')
   show=json.loads(get('https://api.tvmaze.com/shows/'+str(matches[0]['id'])+'?embed=episodes')[0]);eps=[e for e in show['_embedded']['episodes']if e.get('number')and e.get('season',0)>0 and(e.get('airdate')or'9999')<=now[:10]];counts={}
   for e in eps:counts[e['season']]=counts.get(e['season'],0)+1
   mins=[e['runtime']for e in eps if e.get('runtime')];minute=sum(mins)/len(mins)if mins else show.get('averageRuntime')or show.get('runtime')
   if not counts or not minute:raise Exception('series-statistics-unavailable')
   row['seriesStats']={'seasons':len(counts),'episodes':len(eps),'episodesPerSeason':round(len(eps)/len(counts),1),'episodeMinutes':round(minute,1),'totalMinutes':round(sum(e.get('runtime')or minute for e in eps)),'ongoing':show.get('status')!='Ended','source':show['url'],'checkedAt':now,'seasonEpisodes':[{'season':k,'episodes':v}for k,v in sorted(counts.items())]}
  row['trailers']=trailers(t)
  if not row['trailers']:raise Exception('English-HD-embeddable-trailer-not-verified')
  row['complete']=True
 except Exception as e:row['error']=str(e)[:140]
 with lock:
  data[key]=row;P.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(('OK'if row.get('complete')else'MISS')+' '+key+' '+row.get('error',''),flush=True)
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=6)as ex:list(ex.map(research,tasks))
 print('COMPLETE',sum(bool(v.get('complete'))for v in data.values()),'SERIES',sum(bool(v.get('complete'))and v['type']=='series'for v in data.values()),flush=True)
