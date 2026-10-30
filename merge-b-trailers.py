import json,urllib.request as U,urllib.parse as P,pathlib
p=pathlib.Path('/workspace/sites/dark-comedy-guide');a=json.load(open(p/'expand-series-b.json'));cs=json.load(open(p/'trailers-b-candidates.json'));choices={51:1,52:0,53:0,54:4,55:0,56:1,58:0,59:0,60:4,61:0,62:2,63:0,64:0,65:3,66:0,67:3,68:0,69:0,70:1}
for d in a:
 i=d['rank']
 if i in choices:d['trailer']=cs[str(i)][choices[i]]
 if i==57:
  url='https://www.youtube.com/watch?v=qFHLfmoLchI';o=json.load(U.urlopen('https://www.youtube.com/oembed?format=json&url='+P.quote(url,safe=''),timeout=20));d['trailer']={'videoId':'qFHLfmoLchI','url':url,'label':'Фрагмент первого выпуска','channel':o['author_name'],'title':o['title'],'vertical':False};(p/'dist'/d['image']).write_bytes(U.urlopen(o['thumbnail_url'],timeout=20).read());d.update(year=2012,imdb='tt3204810',source='https://www.imdb.com/title/tt3204810/',score=9.2,scoreSource='https://kinobaza.com.ua/titles/on-cinema')
 if i==51:d.update(score=8.1,scoreSource='https://www.justwatch.com/uk/tv-series/strangers-with-candy')
 if i==52:d.update(score=7.8,year=2008,scoreSource='https://www.justwatch.com/ca/tv-show/childrens-hospital')
 if i==58:d.update(score=7.3,scoreSource='https://kinobaza.com.ua/titles/eagleheart')
 if i in [55,56,69,70]:d['rezka']=None
 d.pop('rezkaCandidates',None)
 d.pop('metadataError',None)
(p/'expand-series-b.json').write_text(json.dumps(a,ensure_ascii=False,indent=2));print('done',len(a))
