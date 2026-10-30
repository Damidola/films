import json,re,urllib.request,urllib.parse,gzip,concurrent.futures,pathlib
p=pathlib.Path('/workspace/sites/dark-comedy-guide');ds=json.load(open(p/'expand-series-a.json'))
def req(u):
 b=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=12).read();return gzip.decompress(b) if b[:2]==b'\x1f\x8b'else b
for x in ds:
 if x['rank'] in [36,37,40,42,44,50]:x['trailer']=None
 if x.get('rezka'):x['source']=x['rezka']
for x in ds:
 if x['rank']==50:x['kind']='Псевдодокументальная комедия'
def repair(x):
 if x['rezka']:
  try:
   s=req(x['rezka']).decode('utf8','replace');(p/f'rezka-a-{x["rank"]}.html').write_text(s)
   im=re.search(r'imdb.com/title/(tt\d+)',s)
   if im:x['imdb']=im[1]
   for key,mark in [('score','imdb'),('kp','kp')]:
    m=re.search(r'class="'+mark+r'".*?class="bold">([\d.]+)',s,re.S)
    if m:x[key]=float(m[1])
   im=re.search(r'<meta property="og:image" content="([^"]+)"',s)
   if im and not (p/'dist'/x['image']).exists():(p/'dist'/x['image']).write_bytes(req(im[1]))
  except Exception as e:x['repairerror']=str(e)
 if not x['trailer']:
  try:
   query=x['title']+' '+str(x['year'])+' series trailer';s=req('https://www.youtube.com/results?search_query='+urllib.parse.quote(query)).decode('utf8');v=re.search(r'var ytInitialData = (.*?);</script>',s);yt=json.loads(v[1]);vs=[]
   def walk(o):
    if isinstance(o,dict):
     if 'videoRenderer'in o:vs.append(o['videoRenderer'])
     for a in o.values():walk(a)
    elif isinstance(o,list):
     for a in o:walk(a)
   walk(yt);cands=[]
   for v in vs[:10]:
    title=''.join(a.get('text','')for a in v.get('title',{}).get('runs',[]));cands.append({'videoId':v['videoId'],'label':title,'channel':''.join(a.get('text','')for a in v.get('ownerText',{}).get('runs',[]))})
   x['trailer_candidates']=cands
  except:pass
 (p/f'expand-a-progress-{x["rank"]}.json').write_text(json.dumps(x,ensure_ascii=False,indent=2));print(x['rank'],x['imdb'],x['score'],x['kp'],bool((p/'dist'/x['image']).exists()),x.get('trailer_candidates'),flush=True)
 return x
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:ds=list(ex.map(repair,ds))
(p/'expand-series-a.json').write_text(json.dumps(ds,ensure_ascii=False,indent=2))
