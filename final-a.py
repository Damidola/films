import json,pathlib,concurrent.futures,urllib.request
p=pathlib.Path('/workspace/sites/dark-comedy-guide');ds=json.load(open(p/'expand-series-a.json'));choice={32:'Bo9NzNcbKPA',36:'dOHY2qsA_tM',37:'YOtpgz4L5d8',40:'3gy3C7cMNeg',42:'uUO-kzwEMgs',43:'mLXY6Hbwh-o',47:'Hm6AOHq9OL4',48:'06j7wf2nNg0',49:'Uk9NGiph9L8',50:'sP5ElraFHHE'}
def get(x):
 if x['rank']in choice:
  vid=choice[x['rank']]
  try:
   o=json.load(urllib.request.urlopen('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v='+vid+'&format=json',timeout=15));x['trailer']={'videoId':vid,'url':'https://www.youtube.com/watch?v='+vid,'label':o['title'],'channel':o['author_name'],'vertical':False}
  except Exception as e:x['trailer']=None
 return x
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as ex:ds=list(ex.map(get,ds))
for x in ds:
 f=p/f'meta-a-{x["rank"]}.json'
 if f.exists():x.update(json.load(open(f)))
 for k in ['metadata_error','rezka_error','repairerror','rating_raw','trailer_error','trailer_candidates']:x.pop(k,None)
(p/'expand-series-a.json').write_text(json.dumps(ds,ensure_ascii=False,indent=2));print('entries',len(ds),'trailers',sum(bool(x['trailer'])for x in ds),'posters',sum((p/'dist'/x['image']).exists()for x in ds));print([(x['rank'],x['title'])for x in ds if not x['trailer']])
