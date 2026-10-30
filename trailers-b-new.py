import urllib.request as U,urllib.parse as P,json,re,concurrent.futures as C,pathlib
root=pathlib.Path('/workspace/sites/dark-comedy-guide');a=json.load(open(root/'expand-series-b.json'))
def get(u):return U.urlopen(U.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=20).read()
def walk(o):
 if isinstance(o,dict):
  if 'videoRenderer'in o:yield o['videoRenderer']
  for v in o.values():yield from walk(v)
 elif isinstance(o,list):
  for v in o:yield from walk(v)
def text(o):return ''.join(x.get('text','')for x in o.get('runs',[]))or o.get('simpleText','')
def work(d):
 try:
  s=get('https://www.youtube.com/results?search_query='+P.quote(d['title']+' trailer official')).decode();m=re.search(r'var ytInitialData = (.*?);</script>',s);data=json.loads(m[1]);vs=list(walk(data));out=[]
  for v in vs[:5]:
   vid=v['videoId'];title=text(v['title']);channel=text(v.get('ownerText',{}));url='https://www.youtube.com/watch?v='+vid
   try:
    od=json.loads(get('https://www.youtube.com/oembed?format=json&url='+P.quote(url,safe='')));out.append(dict(videoId=vid,url=url,label='Трейлер'if 'trailer'in title.lower()else 'Промо / фрагмент',channel=od['author_name'],title=od['title'],vertical=False))
   except:continue
  return d['rank'],out
 except Exception as e:return d['rank'],[{'error':str(e)}]
with C.ThreadPoolExecutor(max_workers=10)as ex:out=dict(ex.map(work,a))
(root/'trailers-b-candidates.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False))
