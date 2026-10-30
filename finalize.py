import json,pathlib
p=pathlib.Path('/workspace/sites/dark-comedy-guide');a=json.load(open(p/'content.json'));m=json.load(open(p/'metadata.json'))
x=next(x for x in a if x['title']=='Kevin Can F**k Himself');x.update(title='Psychoville',ru='Психовилль',kind='Игровой сериал',tags=['Hidden gem','Хитрый сюжет','Чернуха'],syn='Несколько очень странных людей получают загадочное послание. Их разрозненные жизни начинают складываться в одну неприятную историю.',why='От авторов Inside No. 9: гротескные персонажи и взаимосвязанная загадка. Под любовь к ранним сезонам «Девятого номера» и конструкции 11:14.',caveat='Начало нарочно выглядит набором странностей: общей картине нужно время.',dark=5)
order=['Corporate','The Life & Times of Tim','How To with John Wilson','Monkey Dust','Psychoville','Jury Duty','Patriot','The Chair Company','The Curse','Stan Against Evil','Bookie','Common Side Effects','Ten Year Old Tom','Smiling Friends','I Think You Should Leave with Tim Robinson','Murder Mindfully','Search Party','Such Brave Girls','The Comeback','American Vandal']
a=sorted(a,key=lambda x:order.index(x['title']))
ratings={'How To with John Wilson':{'score':8.7,'kp':8.3,'kpurl':'1406458'},'Patriot':{'score':8.2,'kp':7.9,'kpurl':'928407'},'Such Brave Girls':{'score':7.4,'kp':6.8,'kpurl':'5431384'},'The Curse':{'kp':6.5,'kpurl':'4292836'},'The Chair Company':{'score':7.3,'kp':7.1,'kpurl':'9153218'},'Jury Duty':{'kp':7.7,'kpurl':'5106451'},'I Think You Should Leave with Tim Robinson':{'kp':7.1,'kpurl':'1254442'},'Bookie':{'score':7.5,'kp':7.1,'kpurl':'5124994'},'Murder Mindfully':{'score':7.4,'kp':7.3,'kpurl':'6358207'},'Search Party':{'score':7.6,'kp':7.1,'kpurl':'1002689'},'The Comeback':{'kp':6.9,'kpurl':'401529'},'American Vandal':{'score':8.1},'Stan Against Evil':{'score':7.3,'kp':7.3,'kpurl':'1007563'},'Psychoville':{'score':7.9,'kp':7.1,'kpurl':'468109'}}
if (p/'agent-ratings.json').exists():
 for k,v in json.load(open(p/'agent-ratings.json')).items():ratings.setdefault(k,{}).update({key:val for key,val in v.items() if val is not None})
for i,d in enumerate(a):
 d['rank']=i+1;t=d['title'];meta=m[t];d.update(meta);d['title']=t;d['year']=int(meta['premiered'][:4]);d.update(ratings.get(t,{}));d.setdefault('score',None);d.setdefault('kp',None);d.setdefault('kpurl',None)
 if d['kpurl'] and not d['kpurl'].startswith('http'):d['kpurl']='https://www.kinopoisk.ru/series/'+d['kpurl']+'/'
 if t in ['Search Party','American Vandal','The Curse','Patriot']:d['tags'].append('Хитрый сюжет')
html=(p/'template.html').read_text();html=html.replace('__DATA__',json.dumps(a,ensure_ascii=False).replace('</','<\\/'))
html=html.replace('<span class="taste-item">Убойные каникулы</span>','<span class="taste-item">Убойные каникулы / 11:14</span><span class="taste-item">Inside No. 9 · сезоны 1–3</span>')
html=html.replace('<button class="filter" data-filter="new"','<button class="filter" data-filter="Хитрый сюжет" aria-pressed="false">Хитрый сюжет</button><button class="filter" data-filter="new"')
(p/'dist/index.html').write_text(html)
(p/'dist/catalog.json').write_text(json.dumps(a,ensure_ascii=False,indent=2))
manifest={'project_id':'appgprj_6ad134993d388191a64c79119f6561de','static':{'directory':'dist'}};(p/'.openai/hosting.json').write_text(json.dumps(manifest,indent=2))
print('20 titles merged. Missing ratings:',[(d['title'],d['score'],d['kp']) for d in a if not d['score'] or not d['kp']])
