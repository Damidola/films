"""Targeted searches and public metadata for ambiguous title matches."""
import concurrent.futures,json,pathlib
R=pathlib.Path(__file__).resolve().parents[1];scope={'__file__':str(R/'scripts/refine-english-trailers.py')};exec((R/'scripts/refine-english-trailers.py').read_text().split('pool=json.load')[0],scope);data=scope['data'];P=scope['P'];post=scope['post'];nodes=scope['nodes'];txt=scope['txt'];metadata=scope['metadata']
queries={'734884':'Nathan For You official trailer Comedy Central','693935':'Review with Forrest MacNeil Andy Daly trailer Comedy Central','276360':'Drawn Together Season 3 DVD trailer Comedy Central','5030035':'The Rehearsal Nathan Fielder season 1 trailer','1202423':'The Great North FOX animated official trailer','602694':'The Double Jesse Eisenberg Richard Ayoade 2013 trailer','1358372':'Vengeance BJ Novak 2022 official trailer','489695':'Boy Taika Waititi 2010 trailer','281897':'The Venture Bros Adult Swim season 1 trailer','652700':'The Final Girls 2015 official trailer English'}
def f(pair):
 k,q=pair;found=[]
 try:
  r=post('search',{'query':q})
  for v in nodes(r,'videoRenderer'):
   title=txt(v.get('title',{}));length=txt(v.get('lengthText',{}));parts=length.split(':');duration=sum(int(x)*60**n for n,x in enumerate(reversed(parts)))if all(x.isdigit()for x in parts)else 0
   if not 35<=duration<=300:continue
   if not any(s in title.lower()for s in ['trailer','promo','preview']):continue
   found.append({'videoId':v['videoId'],'searchTitle':title,'channel':txt(v.get('ownerText',{}))})
   if len(found)>=9:break
  for v in found:
   try:v['metadata']=metadata(v['videoId'])
   except Exception as e:v['error']=str(e)[:70]
 except Exception as e:found=[{'error':str(e)}]
 return k,found
results=dict(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(f,queries.items()));P.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');(R/'research/trailer-identity-review.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
for k,rows in results.items():
 print(k,data['items'][k]['title'])
 for v in rows:
  m=v.get('metadata',{})
  if m.get('status')=='OK'and m.get('uaAllowed')and m.get('embed'):print(v['videoId'],m.get('title'),m.get('channel'),m.get('maxHeight'),m.get('asrLanguages'),m.get('captionLanguages'))
