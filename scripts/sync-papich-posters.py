"""Keep verified official posters local; no third-party image dependency at render time."""
import concurrent.futures,datetime,io,json,pathlib,re,threading,time,urllib.request
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
rows=json.loads((ROOT/'dist/papich-series.json').read_text())['items'];base={re.search(r'/(?:film|series)/(\d+)',i['kpurl']).group(1):i for i in json.loads((ROOT/'dist/catalog.json').read_text()) if i.get('kpurl')}
path=ROOT/'research/papich-posters.json';manifest=json.loads(path.read_text()) if path.exists() else {};lock=threading.Lock();checked=datetime.datetime.now(datetime.timezone.utc).isoformat()
def fetch(item):
 key=item['papich']['kinopoiskId'];existing=manifest.get(key)
 if existing and (ROOT/'dist'/existing['path']).exists():return 'CACHED',key
 if key in base:
  entry={'path':base[key]['image'],'source':base[key].get('source'),'checkedAt':checked,'basis':'existing-verified-catalog-poster'}
 else:
  urls=[f'https://st.kp.yandex.net/images/film_iphone/iphone360_{key}.jpg']
  try:
   meta=json.loads((ROOT/'research/papich-series-metadata.json').read_text())['items'].get(key,{})
   if meta.get('tvmazeImage'):urls.append(meta['tvmazeImage'])
  except (OSError,ValueError):pass
  error=None
  for url in urls:
   try:
    for attempt in range(3):
     try:
      with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25) as r:raw=r.read()
      break
     except OSError:
      if attempt==2:raise
      time.sleep(1+attempt)
    im=Image.open(io.BytesIO(raw)).convert('RGB');assert min(im.size)>=80,im.size;im.thumbnail((360,540),Image.Resampling.LANCZOS);local=f'assets/papich-{key}.jpg';im.save(ROOT/'dist'/local,'JPEG',quality=78,optimize=True,progressive=True)
    entry={'path':local,'source':url,'width':im.width,'height':im.height,'bytes':(ROOT/'dist'/local).stat().st_size,'checkedAt':checked};break
   except Exception as e:error=e
  else:return 'ERROR',key,item['ru'],str(error)
 with lock:manifest[key]=entry;path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 return 'OK',key,item['ru']
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 for r in pool.map(fetch,rows):print(*r,flush=True)
print('TOTAL',len(manifest),'of',len(rows),flush=True)
