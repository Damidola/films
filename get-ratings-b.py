import urllib.request as U,gzip,csv,io,json,pathlib
p=pathlib.Path('/workspace/sites/dark-comedy-guide');a=json.load(open(p/'expand-series-b.json'));ids={d['imdb']:str(d['rank'])for d in a};out={};url='https://datasets.imdbws.com/title.ratings.tsv.gz'
try:
 data=U.urlopen(url,timeout=40).read();print('download',len(data),flush=True)
 for row in csv.DictReader(io.StringIO(gzip.decompress(data).decode()),delimiter='\t'):
  if row['tconst']in ids:out[ids[row['tconst']]]={'score':float(row['averageRating']),'scoreSource':url,'votes':int(row['numVotes']),'imdb':row['tconst']}
except Exception as e:print(e)
(p/'ratings-series-b.json').write_text(json.dumps(out,indent=2));print(out)
