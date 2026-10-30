"""Apply reviewed, public embeddable English trailers; never use an unrelated fallback."""
import datetime,json,pathlib,re
R=pathlib.Path(__file__).resolve().parents[1];D=json.load(open(R/'research/english-trailers.json'));items=D['items'];videos=D['videos'];now=datetime.datetime.now(datetime.timezone.utc).isoformat()
# Human identity review of ambiguous search results. Empty lists explicitly reject wrong works.
overrides={'253245':['yucGlVHtaLA'],'1439939':[],'6358207':[],'5030035':['ivDwgJeIixU','pu7GqQLE_j4'],'602694':['yg3FFgMTWMg','JsHvETtPq84'],'1358372':['ubFUbaxTiqs','fn9QhK-zQtM'],'489695':['z9XUlA9Cl4E'],'1202423':['zbpWgAbb6yk'],'281897':[],'652700':[],'633647':[],'591870':[],'1002689':[],'1197602':[],'570010':[],'89539':[],'178710':[],'734884':[],'693935':[],'276360':['vtdzW_p5RfY']}
manifest={}
for key,row in items.items():
 accepted=row.get('accepted',[])
 if key in overrides:
  accepted=[]
  for vid in overrides[key]:
   m=videos[vid]
   if not(m.get('status')=='OK'and m.get('embed')and m.get('uaAllowed')):raise ValueError('Unplayable reviewed selection '+vid)
   if vid=='vtdzW_p5RfY':m={**m,'language':'en','languageBasis':'Original US English-language DVD trailer; release identity reviewed'}
   elif any((x or'').startswith('en')for x in m.get('asrLanguages',[])):m={**m,'language':'en','languageBasis':'English automatic speech transcript; work identity reviewed'}
   else:continue
   accepted.append(m)
 accepted=[v for v in accepted if not re.search(r'German|Deutsch|Dublado|Espa[nñ]ol|Italiano|Трейлер|Русск|fan.?made|trailer.style|parody|concept',v.get('title')or'',re.I)]
 if re.search('[а-яА-Я]',row['title']):accepted=[]
 manifest[key]={'title':row['title'],'year':row['year'],'reviewedAt':now,'trailers':accepted[:2]}
paths=['catalog.json','personal-candidates.json','papich-series.json']
for name in paths:
 document=json.load(open(R/'dist'/name));rows=document['items']if isinstance(document,dict)else document
 for i in rows:
  key=(i.get('kpurl')or'').rstrip('/').split('/')[-1];m=manifest.get(key,{});accepted=m.get('trailers',[])
  def out(v):return {'videoId':v['videoId'],'url':'https://www.youtube.com/watch?v='+v['videoId'],'title':v['title'],'channel':v['channel'],'kind':'trailer','duration':v['duration'],'language':'en','languageBasis':v['languageBasis'],'maxHeight':v['maxHeight'],'verifiedAt':'18.10.2026','availability':{'regions':['UA']+(['RU']if v.get('ruAllowed')else[]),'embed':True,'checkedAt':v['checkedAt'],'source':'YouTube public player metadata'}}
  i.pop('trailer',None);i.pop('trailerAlternates',None)
  if accepted:i['trailer']=out(accepted[0]);i['trailerAlternates']=[out(v)for v in accepted[1:]]
  else:i['trailerStatus']='English trailer not verified'
  if i.get('syn')and not re.search(r'[.!?…]$',i['syn']):i['syn']=i['syn'].rsplit(' ',1)[0]+'…'
 (R/'dist'/name).write_text(json.dumps(document,ensure_ascii=False,indent=2 if name!='personal-candidates.json'else None)+'\n')
(R/'research/approved-english-trailers.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
pool=json.load(open(R/'dist/personal-candidates.json'));print('Fresh pool:',len(pool),'English HD:',sum(i.get('trailer',{}).get('maxHeight',0)>=720 for i in pool));print('New pool without verified HD:',[i['title']for i in pool if i.get('trailer',{}).get('maxHeight',0)<720])
