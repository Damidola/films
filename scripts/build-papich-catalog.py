"""Build a separate critic collection from the captured public EvilArthas votes."""
import datetime,json,pathlib,re,unicodedata
root=pathlib.Path(__file__).resolve().parents[1]
source=json.loads((root/'research/papich-series-source.json').read_text())
catalog=json.loads((root/'dist/catalog.json').read_text())
seeds=json.loads((root/'dist/taste-seeds.json').read_text())
def kpid(url):return re.search(r'/(?:film|series)/(\d+)',url).group(1)
def norm(value):return re.sub(r'[^a-zа-яё0-9]','',unicodedata.normalize('NFKD',value).lower())
known={kpid(i['kpurl']):i for i in catalog if i.get('kpurl')}
old=json.loads((root/'dist/papich-series.json').read_text()) if (root/'dist/papich-series.json').exists() else {'items':[]}
ids={kpid(i['kpurl']):i['rank'] for i in old['items']}
next_rank=max([i['rank'] for i in catalog]+list(ids.values()))+1
metadata=json.loads((root/'research/papich-series-metadata.json').read_text())['items']
posters=json.loads((root/'research/papich-posters.json').read_text())
result=[]
for row in sorted(source['items'],key=lambda r:int(kpid(r['kpurl']))):
 key=kpid(row['kpurl']);assert isinstance(row['papichScore'],int) and 1<=row['papichScore']<=10
 m=re.match(r'^(.*?)\s*\((?:мини-)?сериал,\s*(\d{4})(.*?)\)$',row['name']);assert m,row['name']
 ru,year=m[1].strip(),int(m[2]);title=row['title'] or ru
 if key in known:rank=known[key]['rank']
 elif key in ids:rank=ids[key]
 else:rank=next_rank;next_rank+=1
 votes=re.search(r'\(([\d\s\xa0]+)\)',row['ratingText'])
 runtime=re.search(r'(\d+)\s*мин',row['ratingText'])
 item={'rank':rank,'title':title,'ru':ru,'type':'series','year':year,'kpurl':row['kpurl'],'kp':round(row['kp'],1),'kpVotes':int(re.sub(r'\D','',votes[1])) if votes else None,'image':f'https://st.kp.yandex.net/images/film_iphone/iphone360_{key}.jpg','source':row['kpurl'],'runtime':int(runtime[1]) if runtime else None,'tags':[],'papichOnly':key not in known,'papichScore':row['papichScore'],'papich':{'score':row['papichScore'],'ratedAt':row['ratedAt'],'checkedAt':source['checkedAt'],'source':source['capturedFrom'],'profile':'EvilArthas','kinopoiskId':key}}
 if any(seed['type']=='series' and seed.get('year')==year and norm(seed['title'])==norm(title) for seed in seeds):item['status']='Уже смотрел'
 details=metadata[key];item['seriesStats']=details['seriesStats'];item['image']=posters[key]['path'];item['tags']=details.get('tags',[]);item['imdb']=details.get('imdb')
 result.append(item)
assert len(result)==len(set(kpid(i['kpurl']) for i in result))==source['count']
result.sort(key=lambda i:(-i['papichScore'],i['ru'].casefold()))
# Keep shared provenance at collection level and derive official poster URLs in the client.
for item in result:
 for field in ['source']:item.pop(field,None)
 for field in ['source','checkedAt','profile']:item['papich'].pop(field,None)
output={'profile':source['profile'],'source':source['capturedFrom'],'checkedAt':source['checkedAt'],'count':len(result),'definition':'Public whole-title votes from EvilArthas on Kinopoisk; integers 1–10, not season averages or inferred sentiment. Separate collection; unrated trailers are not fabricated.','items':result}
(root/'dist/papich-series.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'count':len(result),'matched':sum(not i['papichOnly'] for i in result),'knownWatched':[i['ru'] for i in result if i.get('status')]},ensure_ascii=False))
