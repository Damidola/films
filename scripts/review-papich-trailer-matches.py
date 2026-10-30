"""Inspect ambiguous archive titles before applying trailer choices."""
import concurrent.futures,json,pathlib,re
R=pathlib.Path(__file__).resolve().parents[1];scope={'__file__':str(R/'scripts/refine-english-trailers.py')};exec((R/'scripts/refine-english-trailers.py').read_text().split('pool=json.load')[0],scope);post=scope['post'];nodes=scope['nodes'];txt=scope['txt'];metadata=scope['metadata'];queries={164:'Planet Earth BBC 2006 official trailer',136:'Hitler The Rise of Evil 2003 Robert Carlyle trailer',154:'Зона тюремный роман 2006 НТВ анонс трейлер',129:'Антикиллер 2 Антитеррор 2003 Куценко трейлер',127:'Идиот 2003 Миронов Бортко анонс трейлер',196:'New Girl FOX Zooey Deschanel season 1 trailer',158:'Monster anime 2004 Naoki Urasawa English dub trailer',260:'Clickbait Netflix 2021 Adrian Grenier official trailer',182:'1 Litre of Tears 2005 Japanese drama trailer english sub',156:'Berserk 1997 English dub official trailer',150:'Das Boot 1981 original trailer English subtitles',201:'Hunted 2012 Melissa George BBC trailer',139:'Крот 2001 НТВ анонс сериала',167:'Парни из стали 2004 анонс сериал',138:'Моя прекрасная няня 2004 анонс СТС',246:'Money Heist Netflix official trailer English',277:'Copenhagen Cowboy Netflix official trailer English'}
def f(pair):
 rank,q=pair;found=[]
 try:
  raw=post('search',{'query':q})
  for v in nodes(raw,'videoRenderer'):
   title=txt(v.get('title',{}));parts=txt(v.get('lengthText',{})).split(':');seconds=sum(int(x)*60**n for n,x in enumerate(reversed(parts)))if all(x.isdigit()for x in parts)else 0
   if not 15<=seconds<=330 or not re.search('trailer|promo|трейлер|промо|анонс',title,re.I):continue
   if re.search('reaction|recap|review|обзор|fan.?made|concept|AI Trailer|trailer.style|ремейк',title,re.I):continue
   found.append({'videoId':v['videoId'],'searchTitle':title})
   if len(found)>=10:break
  for v in found:
   try:v['metadata']=metadata(v['videoId'])
   except Exception as e:v['error']=str(e)[:60]
 except Exception as e:found=[{'error':str(e)}]
 return str(rank),found
results=dict(concurrent.futures.ThreadPoolExecutor(max_workers=5).map(f,queries.items()));(R/'research/papich-trailer-identity-review.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');scope['P'].write_text(json.dumps(scope['data'],ensure_ascii=False,indent=2)+'\n')
for rank,rows in results.items():
 print(rank,queries[int(rank)])
 for row in rows:
  m=row.get('metadata',{})
  if m.get('embed')and m.get('uaAllowed')and m.get('status')=='OK':print(row['videoId'],m.get('title'),m.get('channel'),m.get('maxHeight'),m.get('asrLanguages'),m.get('captionLanguages'))
