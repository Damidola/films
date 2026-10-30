import concurrent.futures,datetime,html,io,json,pathlib,re,threading,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];out=ROOT/'research/personal-candidates.json';data=json.loads(out.read_text())if out.exists()else{};lock=threading.Lock();today=datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=15)as r:return r.read().decode('utf-8','replace'),r.geturl()
def norm(s):return re.sub(r'[^a-zа-я0-9]','',s.lower().replace('ё','е'))
def f(line):
 title,year,kind,ru,group=line.strip().split('|');key=title+'|'+year
 if data.get(key,{}).get('work'):return
 row={'title':title,'year':int(year),'type':kind,'ru':ru,'group':group};host='https://hdrezka.asia'
 try:
  seen=set()
  for query in [title,ru]:
   search,_=get(host+'/search/?q='+urllib.parse.quote(query))
   for href,label in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>',search,re.S):
    if not re.fullmatch(r'/(?:serialy|multserialy|anime-serialy|filmy|multfilmy|anime)/[^/#?]+',href)or href in seen:continue
    label=html.unescape(re.sub('<[^>]+>',' ',label)).strip()
    if not label or year not in href:continue
    seen.add(href);page,url=get(host+href)
    for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',page,re.S):
     try:w=json.loads(raw)
     except ValueError:continue
     if w.get('@type')not in ['Movie','TVSeries']:continue
     if str(w.get('datePublished'))!=year:continue
     names=[norm(w.get('alternateName','')),norm(re.sub(r'\s*\([^)]*\)$','',w.get('name','')))]
     if norm(title)not in names and norm(ru)not in names:continue
     ids={x.get('propertyID'):x.get('value')for x in w.get('identifier',[])}
     if not ids.get('КиноПоиск')or not ids.get('IMDb'):continue
     row.update(work=w,rezka=url,kpId=str(ids['КиноПоиск']),imdb=str(ids['IMDb']),checkedAt=today)
     other,url=get('https://kinogo.lifestyle'+href)
     for raw2 in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',other,re.S):
      try:ww=json.loads(raw2)
      except ValueError:continue
      if any(str(v.get('value'))==row['kpId']and v.get('propertyID')=='КиноПоиск'for v in ww.get('identifier',[])):row['kinogo']=url
     break
    if row.get('work'):break
   if row.get('work'):break
 except Exception as e:row['error']=str(e)[:130]
 with lock:data[key]=row;out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
lines=[s for s in (ROOT/'research/personal-candidates.txt').read_text().splitlines()if s.strip()]
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:list(pool.map(f,lines))
print('Provider metadata:',sum(bool(v.get('work'))for v in data.values()),'of',len(lines));print('Unresolved:',[(v['title'],v.get('error'))for v in data.values()if not v.get('work')])
