import urllib.request,urllib.parse,json,pathlib,concurrent.futures
p=pathlib.Path('/workspace/sites/dark-comedy-guide');ds=json.load(open(p/'expand-series-a.json'))
def get(x):
 try:
  d=json.load(urllib.request.urlopen('https://api.tvmaze.com/singlesearch/shows?q='+urllib.parse.quote(x['title']),timeout=25))
  if not str(d.get('premiered') or '').startswith(str(x['year'])):raise ValueError('wrong year '+str(d.get('premiered')))
  out={'rank':x['rank'],'imdb':d['externals']['imdb'],'source':d['url']};im=d.get('image')or{};url=im.get('original')or im.get('medium')
  if url:(p/'dist'/x['image']).write_bytes(urllib.request.urlopen(url,timeout=20).read())
  (p/f'meta-a-{x["rank"]}.json').write_text(json.dumps(out));print(out,flush=True)
 except Exception as e:print(x['rank'],str(e),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=7)as ex:list(ex.map(get,ds))
