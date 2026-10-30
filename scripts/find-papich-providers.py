"""Resolve direct provider pages by exact Kinopoisk IDs, not guessed slugs."""
import concurrent.futures,datetime,gzip,html,json,pathlib,re,threading,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];PATH=ROOT/'research/papich-feed-providers.json';data=json.loads(PATH.read_text()) if PATH.exists() else {'items':{},'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};lock=threading.Lock()
items=[i for i in json.loads((ROOT/'dist/papich-series.json').read_text())['items'] if i['papichScore']>=6]
def get(u):
 req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=15) as r:
  raw=r.read();return (gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw).decode('utf-8','replace'),r.geturl()
def norm(s):return re.sub(r'[^а-яa-z0-9]','',s.lower().replace('ё','е'))
def resolve(i):
 key=str(i['rank'])
 if data['items'].get(key,{}).get('complete'):return
 result=data['items'].get(key,{'rank':i['rank'],'ru':i['ru'],'candidates':[],'verified':{}});source='https://hdrezka.asia';seen=set()
 try:
  for query in list(dict.fromkeys([i['title'],i['ru']])):
   markup,_=get(source+'/search/?q='+urllib.parse.quote(query));candidates=[]
   for href,text in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>',markup,re.S):
    if not re.fullmatch(r'/(?:serialy|multserialy|anime-serialy|filmy)/[^/#?]+',href):continue
    label=html.unescape(re.sub('<[^>]+>',' ',text)).strip()
    if not label or href in seen:continue
    if str(i['year']) not in href and norm(i['ru']) not in norm(label) and norm(i['title']) not in norm(label):continue
    seen.add(href);candidates.append((href,label))
   for href,label in candidates[:8]:
    page,url=get(source+href);schemas=[]
    for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',page,re.S):
     try:schemas.append(json.loads(raw))
     except ValueError:pass
    work=next((x for x in schemas if x.get('@type') in ['TVSeries','Movie']),None)
    if not work:continue
    kp=[str(x.get('value')) for x in work.get('identifier',[]) if 'кинопоиск'in str(x.get('propertyID','')).lower()];record={'url':url,'name':work.get('name'),'alternateName':work.get('alternateName'),'year':work.get('datePublished'),'kinopoiskIds':kp}
    result['candidates'].append(record)
    if str(i['papich']['kinopoiskId']) not in kp:continue
    result['verified']['rezka']={**record,'basis':'exact-kinopoisk-id','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    # Each branded site has its own canonical page; verify identity independently.
    other,otherurl=get('https://kinogo.lifestyle'+href)
    for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',other,re.S):
     try:w=json.loads(raw)
     except ValueError:continue
     if w.get('@type') in ['TVSeries','Movie'] and any(str(x.get('value'))==str(i['papich']['kinopoiskId']) and 'кинопоиск'in str(x.get('propertyID','')).lower() for x in w.get('identifier',[])):
      result['verified']['kinogo']={**record,'url':otherurl,'basis':'exact-kinopoisk-id','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    result['description']=work.get('description');result['complete']=len(result['verified'])==2
    if result['complete']:break
   if result.get('complete'):break
 except Exception as e:result['error']=type(e).__name__+': '+str(e)[:140]
 with lock:data['items'][key]=result;PATH.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as p:list(p.map(resolve,items))
print('Both providers:',sum(i.get('complete',False) for i in data['items'].values()),'of',len(items))
for i in items:
 r=data['items'].get(str(i['rank']),{})
 if not r.get('complete'):print(i['rank'],i['ru'],r.get('error',''),[(v['name'],v['year'],v['kinopoiskIds']) for v in r.get('candidates',[])])
