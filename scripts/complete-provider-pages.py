"""Resolve existing titles to public provider pages by exact work identifiers."""
import concurrent.futures,json,pathlib
R=pathlib.Path(__file__).resolve().parents[1];scope={'__file__':str(R/'scripts/discover-personal-candidates.py')};exec((R/'scripts/discover-personal-candidates.py').read_text().split('lines=[s for s')[0],scope)
base=json.load(open(R/'dist/catalog.json'));missing=[i for i in base if not i.get('rezka')or not i.get('kinogo')]
with concurrent.futures.ThreadPoolExecutor(max_workers=5)as ex:list(ex.map(scope['f'],[f"{i['title']}|{i['year']}|{i['type']}|{i['ru']}|seed"for i in missing]))
bykp={r.get('kpId'):r for r in scope['data'].values()if r.get('work')}
for i in base:
 r=bykp.get((i.get('kpurl')or'').rstrip('/').split('/')[-1])
 if not r:continue
 for field in ['rezka','kinogo']:
  if r.get(field):i[field]=r[field];i.setdefault('providerVerification',{})[field]={'url':r[field],'basis':'exact-kinopoisk-id','checkedAt':r['checkedAt']}
(R/'dist/catalog.json').write_text(json.dumps(base,ensure_ascii=False,indent=2)+'\n')
print('Missing direct HDrezka:',[(i['rank'],i['title'])for i in base if not i.get('rezka')])
