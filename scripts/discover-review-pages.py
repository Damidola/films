"""Discover public HDrezka-branded review pages and verify exact Kinopoisk IDs."""
import concurrent.futures,datetime,json,pathlib,re,threading,urllib.parse,urllib.request,html
R=pathlib.Path(__file__).resolve().parents[1];P=R/'research/hdrezka-review-discovery.json';data=json.load(open(P))if P.exists()else{};lock=threading.Lock();rows={i['rank']:i for n in ['catalog.json','personal-candidates.json','papich-series.json']for d in [json.load(open(R/'dist'/n))]for i in(d['items']if isinstance(d,dict)else d)};targets=[i for i in rows.values()if i.get('year',0)>=2000 and(i.get('score')or 0)>=6];now=datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=12)as r:return r.read().decode('utf8','replace'),r.geturl()
def norm(s):return re.sub('[^a-zа-я0-9]','',s.lower().replace('ё','е'))
def f(i):
 key=str(i['rank']);kp=(i.get('kpurl')or'').rstrip('/').split('/')[-1]
 if key in data:return
 row={'workId':i['rank'],'title':i['title'],'kpId':kp,'checkedAt':now,'status':'not-found'}
 try:
  page,_=get('https://hd-rezka.tv/?do=search&subaction=search&q='+urllib.parse.quote(i['title']));links=[]
  for href,label in re.findall(r'<a\b[^>]*href=[\"\x27]([^\"\x27]+)[\"\x27][^>]*>(.*?)</a>',page,re.S):
   u=urllib.parse.urljoin('https://hd-rezka.tv/',html.unescape(href));text=html.unescape(re.sub('<[^>]+>',' ',label)).strip()
   if urllib.parse.urlparse(u).netloc!='hd-rezka.tv'or not re.search(r'/\d+-[^/?]+\.html$',u)or u in links:continue
   if str(i['year'])not in u:continue
   # Search matches full text too; a URL is never accepted until the work ID is exact.
   links.append(u)
  for u in links[:5]:
   p,url=get(u);ids=set(re.findall(r'data-(?:kinopoisk_id|soon-id|kinopoisk-id|kp-id)=[\"\x27](\d+)',p))
   if kp not in ids:continue
   if len(ids)>1:continue
   row.update(status='verified',url=url,basis='exact-kinopoisk-id',sourceHost='hd-rezka.tv');dest=R/'research/review-pages'/f'{key}.html';dest.parent.mkdir(exist_ok=True);dest.write_text(p);row['capturedFile']=str(dest.relative_to(R));break
 except Exception as e:row['status']='unavailable';row['error']=str(e)[:100]
 with lock:data[key]=row;P.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as ex:list(ex.map(f,targets))
verified={k:{f:v for f,v in row.items()if f not in ['capturedFile','error','status']}for k,row in data.items()if row['status']=='verified'};(R/'dist/review-sources.json').write_text(json.dumps({'schemaVersion':1,'checkedAt':now,'sources':verified},ensure_ascii=False,indent=2)+'\n');print('checked',len(data),'verified exact pages',len(verified),flush=True)
