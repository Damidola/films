"""Resolve each provider's own canonical page by original/local title, year and player presence."""
import concurrent.futures,datetime,gzip,html,json,pathlib,re,subprocess,threading,time,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'research/uakinogo-pages.json';BASE='https://uakinogo.io';lock=threading.Lock();cache={};done=0
task_source="""import fs from 'node:fs';import {compileLibrary}from './scripts/library-data.mjs';const l=await compileLibrary(process.cwd());const raw=[...JSON.parse(fs.readFileSync('dist/catalog.json')),...JSON.parse(fs.readFileSync('dist/personal-candidates.json')),...JSON.parse(fs.readFileSync('dist/papich-series.json')).items];const by=new Map(raw.map(i=>[i.rank,i]));process.stdout.write(JSON.stringify(l.items.map(i=>({...i,originalKinogo:by.get(i.rank)?.kinogo}))));"""
items=json.loads(subprocess.check_output(['node','--input-type=module','-e',task_source],cwd=ROOT));data=json.loads(OUT.read_text())if OUT.exists()else{'provider':BASE,'items':{}}
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
ALIASES={225:['Twin Peaks'],270:['Y: 1883'],427:['Drawn Together Complete Series'],440:['LTD Perpetual Grace'],16:['Achtsam Morden'],24:['Duckman: Private Dick/Family Man'],86:['Relatos salvajes'],87:['Retfærdighedens ryttere'],88:['Adams æbler'],89:['De grønne slagtere'],90:['Mænd & høns'],93:['Død snø 2'],99:['Kamera o tomeru na!'],91:['I onde dager'],142:["Stephen King's It"],182:['Ichi rittoru no namida','1 Litre of Tears'],221:['From Dusk Till Dawn'],223:['Gomorra'],258:['Squid Game'],596:['Vikingane'],67:['China Illinois'],422:['Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan']}
def get(u):
 for attempt in range(2):
  try:
   req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0','Accept-Encoding':'gzip'})
   with urllib.request.urlopen(req,timeout=10)as r:
    b=r.read();return (gzip.decompress(b)if b[:2]==b'\x1f\x8b'else b).decode('utf8','replace'),r.geturl()
  except Exception:
   if attempt:raise

def norm(s):
 s=html.unescape(str(s)).lower().replace('ё','е').replace('&','and');s=re.sub(r'\s*\([^)]*\)','',s);s=re.sub(r'^the\s+','',s)
 return re.sub('[^а-яa-z0-9]','',s)
def validate(i,u):
 page,url=get(u)
 if urllib.parse.urlparse(url).hostname!='uakinogo.io':return None
 for raw in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',page,re.S):
  try:w=json.loads(raw)
  except ValueError:continue
  if w.get('@type')not in['Movie','TVSeries','TVEpisode']:continue
  year=str(w.get('dateCreated')or w.get('datePublished')or'')[:4]
  if not year.isdigit() or abs(int(year)-int(i['year']))>1:continue
  originals=[part.strip() for value in [w.get('alternateName'),w.get('alternativeHeadline')] if value for part in value.split('/')];local=[part.strip() for value in [w.get('name'),w.get('headline')] if value for part in value.split('/')]
  names=[i['title'],*ALIASES.get(i['rank'],[])]
  en=any(norm(t)in[norm(x)for x in originals if x]for t in names);ru=norm(i['ru'])in[norm(x)for x in local if x]
  slug=re.sub(r'^\d+-','',urllib.parse.urlparse(url).path.rsplit('/',1)[-1].replace('.html',''))
  if not any(originals) and norm(slug)in[norm(t)for t in names]:en=True
  if year!=str(i['year']) and not en:continue
  has_original=any(x and re.search('[a-zA-Z]',x) for x in originals)
  if re.search('[a-zA-Z]',i['title']) and has_original and not en:continue
  if not(en or ru):continue
  if i['type']=='film' and w.get('@type')!='Movie':continue
  if i['type']=='series' and w.get('@type')not in ['TVSeries','TVEpisode'] and not (en and i['rank'] in [142,425]):continue
  has_player=bool(w.get('video',{}).get('embedUrl'))or bool(re.search(r'<iframe[^>]+(?:data-src|src)=["\']https?://',page))
  if not has_player:continue
  canonical=re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"',page)
  url=html.unescape(canonical[1])if canonical else url
  if not re.match(r'^https://uakinogo\.io/[^?#]+\.html$',url):continue
  return {'url':url,'matchedOriginalTitle':w.get('alternateName'),'matchedTitle':w.get('name'),'matchedYear':year,'basis':'original-title-year-player'if en else'local-title-year-player','pageHasPlayer':True,'schemaType':w.get('@type'),'checkedAt':now}
 return None

def resolve(i):
 global done
 key=str(i['rank']);prior=data['items'].get(key)
 if prior and prior.get('verified') and prior.get('schemaType'):return
 record={'rank':i['rank'],'title':i['title'],'ru':i['ru'],'year':i['year'],'verified':False,'checkedAt':now};seen=set()
 try:
  existing=(prior or {}).get('url')or i.get('originalKinogo')or''
  if existing.startswith(BASE+'/')and existing.endswith('.html'):
   seen.add(existing);v=validate(i,existing)
   if v:record.update(v,verified=True)
  if not record['verified']:
   for query in dict.fromkeys([i['title'],i['ru'],*ALIASES.get(i['rank'],[]),f"{i['title']} {i['year']}",f"{i['ru']} {i['year']}"]):
    page,_=get(BASE+'/index.php?do=search&subaction=search&story='+urllib.parse.quote(query))
    found=[]
    for href,label in re.findall(r'<h2\b[^>]*>\s*<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',page,re.S):
     u=urllib.parse.urljoin(BASE,html.unescape(href));label=html.unescape(re.sub('<[^>]+>',' ',label))
     if u in seen or not u.startswith(BASE+'/')or not u.endswith('.html')or (i['type']=='film'and not any(str(y)in label for y in range(i['year']-1,i['year']+2))):continue
     found.append((u, 0 if norm(label) in [norm(i["ru"]),norm(i["title"])] else 1))
    for u,_ in sorted(found,key=lambda x:x[1])[:8]:
     seen.add(u)
     v=validate(i,u)
     if v:record.update(v,verified=True);break
    if record['verified']:break
  if not record['verified']:record['result']='exact-page-not-found'
 except Exception as e:record['error']=str(e)[:180]
 with lock:
  data['items'][key]=record;done+=1
  OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
  if done%25==0:print('Checked',done,'verified',sum(r.get('verified',False)for r in data['items'].values()),'of',len(items),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as ex:list(ex.map(resolve,items))
print('FINAL',sum(r.get('verified',False)for r in data['items'].values()),'/',len(items),flush=True)

verified={k:{name:v[name] for name in ['url','basis','matchedOriginalTitle','matchedTitle','matchedYear','schemaType','pageHasPlayer','checkedAt']} for k,v in data['items'].items() if v.get('verified')}
(ROOT/'dist/provider-links.json').write_text(json.dumps({'kinogo':verified},ensure_ascii=False,separators=(',',':'))+'\n')
