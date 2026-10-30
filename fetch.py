import urllib.request,urllib.parse,json,concurrent.futures,pathlib,time
root=pathlib.Path('/workspace/sites/dark-comedy-guide')
names=['How To with John Wilson','Review','Jury Duty','The Curse','Such Brave Girls','I Think You Should Leave with Tim Robinson','The Chair Company','Patriot','The Life & Times of Tim','Bookie','Stan Against Evil','Monkey Dust','Murder Mindfully','Kevin Can F**k Himself','Search Party','Ten Year Old Tom','Common Side Effects','Smiling Friends','The Comeback','American Vandal']
def get(name):
 try:
  u='https://api.tvmaze.com/singlesearch/shows?q='+urllib.parse.quote(name)
  d=json.load(urllib.request.urlopen(u,timeout=30))
  if name=='Review' and d['premiered'][:4]!='2014':
   ds=json.load(urllib.request.urlopen('https://api.tvmaze.com/search/shows?q=Review',timeout=30));d=next(x['show'] for x in ds if x['show'].get('premiered','')=='2014-03-06')
  img=d.get('image') or {};p=root/'dist/assets'/f"{names.index(name)}.jpg"
  urllib.request.urlretrieve(img.get('original') or img['medium'],p)
  return name,{'name':d['name'],'premiered':d['premiered'],'ended':d['ended'],'imdb':d['externals']['imdb'],'image':f'assets/{names.index(name)}.jpg','source':d['url'],'runtime':d['averageRuntime']}
 except Exception as e:return name,{'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
 out=dict(ex.map(get,names))
(root/'metadata.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps(out,ensure_ascii=False))
