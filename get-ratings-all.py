import urllib.request as U,gzip,csv,io,json,pathlib
p=pathlib.Path('/workspace/sites/dark-comedy-guide');files=['dist/catalog.json','expand-series-a.json','expand-series-b.json','expand-films-a.json','expand-films-b.json'];a={}
for f in files:
 for d in json.load(open(p/f)):a[d['rank']]=d
ids={d['imdb']:str(d['rank'])for d in a.values()if d.get('imdb')};out={};url='https://datasets.imdbws.com/title.ratings.tsv.gz';data=U.urlopen(url,timeout=40).read();(p/'imdb-title-ratings.tsv.gz').write_bytes(data)
for row in csv.DictReader(io.StringIO(gzip.decompress(data).decode()),delimiter='\t'):
 if row['tconst']in ids:out[ids[row['tconst']]]={'score':float(row['averageRating']),'scoreSource':url,'votes':int(row['numVotes']),'imdb':row['tconst']}
(p/'ratings-all.json').write_text(json.dumps(out,indent=2));print('Have',len(out),'of',len(a),'Missing',[(r,d['title'],d.get('imdb'))for r,d in a.items()if str(r)not in out])
