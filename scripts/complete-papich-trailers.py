"""Attach verified public trailers to the full Papich archive, preserving work identity."""
import concurrent.futures,datetime,json,pathlib,re,threading,urllib.request
R=pathlib.Path(__file__).resolve().parents[1];scope={'__file__':str(R/'scripts/refine-english-trailers.py')};exec((R/'scripts/refine-english-trailers.py').read_text().split('pool=json.load')[0],scope);post=scope['post'];nodes=scope['nodes'];txt=scope['txt'];metadata=scope['metadata'];D=scope['data'];P=R/'research/papich-trailers.json';audit=json.load(open(P))if P.exists()else{};lock=threading.Lock();doc=json.load(open(R/'dist/papich-series.json'))
aliases={'1 rittoru no namida':'1 Litre of Tears','Jigeum uri hakgyoneun':'All of Us Are Dead Netflix','Kenpu denki baruseruku':'Berserk 1997 anime','Ojingeo geim':'Squid Game Netflix','Shin Seiki Evangelion':'Neon Genesis Evangelion anime','Shingeki no kyojin':'Attack on Titan anime','Arcane: League of Legends':'Arcane Netflix','House, M.D.':'House MD Hugh Laurie','Monster':'Monster Naoki Urasawa anime','It':'IT Tim Curry miniseries','From':'From MGM Harold Perrineau','The Mist':'The Mist Spike TV 2017','The Office':'The Office Steve Carell','Hunted':'Hunted Melissa George','Merlin':'Merlin BBC Colin Morgan','The Day of the Jackal':'The Day of the Jackal Eddie Redmayne','Godless':'Godless Netflix','Foundation':'Foundation Apple TV','Fallout':'Fallout Prime Video','The Sandman':'The Sandman Netflix','Watchmen':'Watchmen HBO','Oz':'Oz HBO','The Langoliers':'The Langoliers Stephen King','Alien: Earth':'Alien Earth FX','Spartacus: House of Ashur':'Spartacus House of Ashur STARZ'}
def clean(s):return s.replace('\\xa0',' ').replace('\xa0',' ')
def tokens(s):return set(re.findall(r'[a-zа-яё0-9]+',s.lower()))-{'the','and','of','a','for','to','in','with','series','сериал','md','m','d'}
def f(i):
 if i.get('trailer'):return
 rank=str(i['rank'])
 if audit.get(rank,{}).get('finished'):return
 title=clean(i['title']);ru=clean(i['ru']);native=bool(re.search('[а-яА-Я]',title));query=aliases.get(title,title)+' '+str(i['year'])+(' трейлер сериал'if native else' series official trailer');row={'workId':i['rank'],'title':title,'year':i['year'],'query':query,'search':[],'accepted':[],'finished':True};expected=tokens(title)
 if title in aliases:expected=tokens(aliases[title].split(' Netflix')[0].split(' Prime')[0].split(' Apple')[0].split(' MGM')[0].split(' Hugh')[0].split(' Tim')[0].split(' Eddie')[0].split(' Naoki')[0].split(' Stephen')[0].split(' BBC')[0].split(' HBO')[0].split(' STARZ')[0].split(' FX')[0].split(' Spike')[0].split(' anime')[0])
 try:
  raw=post('search',{'query':query});seen=set()
  for v in nodes(raw,'videoRenderer'):
   t=txt(v.get('title',{}));channel=txt(v.get('ownerText',{}));parts=txt(v.get('lengthText',{})).split(':');seconds=sum(int(x)*60**n for n,x in enumerate(reversed(parts)))if all(x.isdigit()for x in parts)else 0
   if not 30<=seconds<=330 or not re.search('trailer|promo|трейлер|промо|анонс',t,re.I):continue
   if re.search('reaction|recap|review|обзор|fan.?made|concept|пароди|deutsch|german|dublado|espa[nñ]ol|italiano|bande.annonce|explained|\bремейк\b',t+' '+channel,re.I):continue
   if expected and len(expected&tokens(t))/len(expected)<.6:continue
   # Avoid obvious remake/film years for old shows, and unrelated franchise works.
   years=set(re.findall(r'\b(?:19|20)\d{2}\b',t))
   if years and all(abs(int(y)-i['year'])>2 for y in years):continue
   if title=='It'and re.search('2017|chapter two|welcome to derry',t,re.I):continue
   if title=='Monster'and not re.search('monster',t,re.I):continue
   vid=v['videoId']
   if vid in seen:continue
   seen.add(vid);row['search'].append({'videoId':vid,'title':t,'channel':channel})
   if len(row['search'])>=9:break
  for v in row['search']:
   try:
    m=metadata(v['videoId'])
    if m.get('status')!='OK'or not m.get('embed')or not m.get('uaAllowed')or m.get('maxHeight',0)<240:continue
    actual=m.get('title')or''
    if expected and len(expected&tokens(actual))/len(expected)<.6:continue
    if re.search('deutsch|german|dublado|espa[nñ]ol|italiano|bande.annonce|fan.?made|concept|parody',actual,re.I):continue
    asr=m.get('asrLanguages',[]);en=any((x or'').startswith('en')for x in asr);russian=native and any((x or'').startswith('ru')for x in asr);basis='English automatic speech transcript'if en else'Original Russian speech transcript'if russian else None
    if not asr and re.search('HBO|Netflix|Prime Video|Apple TV|Paramount|FX Networks|BBC|Channel 4|Sony|Warner|STARZ|Adult Swim|Crunchyroll|VIZ|Funimation|AMC|SHOWTIME|Peacock|MGM|НТВ|СТС|ТНТ|КиноТВ|KION|START|Premier|Мосфильм|Ленфильм',m.get('channel')or'',re.I):
     en=not native;russian=native;basis='Original-language publisher trailer'
    if not(en or russian):continue
    row['accepted'].append({**m,'language':'ru'if russian else'en','languageBasis':basis})
    if m['maxHeight']>=720:break
   except Exception as e:row.setdefault('errors',[]).append(str(e)[:60])
  row['accepted'].sort(key=lambda m:(m['language']=='en',m['maxHeight']>=720,m['maxHeight']),reverse=True)
 except Exception as e:row['error']=str(e)[:100];row['finished']=False
 with lock:audit[rank]=row;P.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');print(title,':',row['accepted'][0]['title']if row['accepted']else'not verified',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=5)as ex:list(ex.map(f,doc['items']))
scope['P'].write_text(json.dumps(D,ensure_ascii=False,indent=2)+'\n')
for i in doc['items']:
 if i.get('trailer'):continue
 accepted=audit.get(str(i['rank']),{}).get('accepted',[])
 if not accepted:continue
 def out(v):return {'videoId':v['videoId'],'url':'https://www.youtube.com/watch?v='+v['videoId'],'title':v['title'],'channel':v['channel'],'kind':'trailer','duration':v['duration'],'language':v['language'],'languageBasis':v['languageBasis'],'maxHeight':v['maxHeight'],'verifiedAt':'18.10.2026','availability':{'regions':['UA']+(['RU']if v.get('ruAllowed')else[]),'embed':True,'checkedAt':v['checkedAt'],'source':'YouTube public player metadata'}}
 i['trailer']=out(accepted[0]);i['trailerAlternates']=[out(v)for v in accepted[1:2]]
(R/'dist/papich-series.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n');print('Papich available:',sum(bool(i.get('trailer'))for i in doc['items']),'of',len(doc['items']),flush=True)
