exec(open('/workspace/sites/dark-comedy-guide/expand-b.py').read().split('with C.ThreadPoolExecutor')[0])
a=json.load(open(root/'expand-series-b.json'))
# Search results can include unrelated titles; only retain matched Russian names.
for d in a:
 if d['rank']in[55,56,69,70]:d['rezka']=None
 if d['rank']==52:d['year']=2008
 if d['rank']==56:d['year']=2013
 if d['rank']==57:d.update(year=2012,imdb='tt2348502',source='https://www.imdb.com/title/tt2348502/')
 if d['rank']==65:
  sh=next(x['show'] for x in json.loads(get('https://api.tvmaze.com/search/shows?q=Death%20Valley'))if str(x['show'].get('premiered','')).startswith('2011'))
  d.update(year=2011,imdb=sh['externals']['imdb'],source=sh['url']);(root/'dist'/d['image']).write_bytes(get(sh['image']['original']))
 if not d['rezka']:
  try:
   s=get('https://hdrezka.me/search/?do=search&subaction=search&q='+P.quote(d['ru'])).decode();cs=[]
   for ch in re.split(r'<div class="b-content__inline_item"',s)[1:]:
    u=re.search(r'data-url="([^"]+)"',ch);t=re.search(r'<div class="b-content__inline_item-link">\s*<a[^>]+>(.*?)</a>\s*<div>(.*?)</div>',ch,re.S)
    if u and t and d['ru'].lower()in html.unescape(t[1]).lower():cs.append(html.unescape(u[1]))
   if len(cs)==1:d['rezka']=cs[0]
  except:pass
 if d['rezka']:
  try:
   s=get(d['rezka']).decode();(root/f'new-page-{d["rank"]}.html').write_text(s)
   for key,pat in [('score',r'IMDb:.*?<span class="bold">([0-9.]+)'),('kp',r'Кинопоиск:.*?<span class="bold">([0-9.]+)')]:
    m=re.search(pat,s,re.S)
    if m:d[key]=float(m[1])
   m=re.search(r'https?://www.kinopoisk.ru/(?:film|series)/\d+/?',s)
   if m:d['kpurl']=m[0]
  except:pass
 d.pop('rezkaCandidates',None)
(root/'expand-series-b.json').write_text(json.dumps(a,ensure_ascii=False,indent=2));print([(d['rank'],d['rezka'],d['score'],d['kp'])for d in a])
