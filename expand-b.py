import urllib.request as U,urllib.parse as P,json,pathlib,concurrent.futures as C,gzip,re,html
root=pathlib.Path('/workspace/sites/dark-comedy-guide')
names=['Strangers with Candy','Childrens Hospital','NTSF:SD:SUV::','Delocated','Tim and Eric Awesome Show, Great Job!',"Tim and Eric's Bedtime Stories",'On Cinema at the Cinema','Eagleheart','Wilfred','Man Seeking Woman','The Increasingly Poor Decisions of Todd Margaret','Get Shorty','Happy!','Ash vs Evil Dead','Death Valley','Ugly Americans','China, IL','Frisky Dingo','Xavier: Renegade Angel','Lucy, the Daughter of the Devil']
rus=['Фривольная жизнь','Детская больница','НТСФ:СД:ВНЕДОРОЖНИК','Делокейтед','Шоу Тима и Эрика','Сказки Тима и Эрика на ночь','В кино с Тимом и Греггом','Орлиное сердце','Уилфред','Мужчина ищет женщину','Всё более неудачные решения Тодда Маргарета','Достать коротышку','Хэппи!','Эш против зловещих мертвецов','Долина смерти','Гадкие американцы','Китай, Иллинойс','Фриски Динго','Ксавьер: Отступник-ангел','Люси — дочь дьявола']
syn=['Бывшая наркоманка возвращается в школу и снова принимает чудовищные решения.','Врачи детской больницы ставят собственные нелепые страсти выше медицинской логики.','Сверхсекретный отряд защищает Сан-Диего от абсурднейших угроз.','Участник программы защиты свидетелей снимается в реалити-шоу в балаклаве.','Два ведущих собирают кошмарный тележурнал из рекламы, скетчей и сломанного монтажа.','Обыденные ситуации превращаются в неприятные сюрреалистические истории.','Два самоуверенных кинокритика обсуждают кино, постоянно уходя в личные разборки.','Маршал решает мелкие проблемы с безумной жестокостью.','Подавленный мужчина видит в соседской собаке грубого мужика в костюме.','Неудачи на свиданиях буквально превращаются в фантастические катастрофы.','Американского продавца отправляют торговать энергетиками в Британию, хотя он не умеет ничего.','Криминальный вышибала пытается попасть в голливудское кино.','Бывший полицейский сталкивается с синим единорогом и очень грязным преступным миром.','Ветеран с бензопилой снова разбирается с нечистью.','Полицейские патрулируют долину, где монстры стали рутинной проблемой.','Социальный работник помогает монстрам приспособиться к ненормальному Нью-Йорку.','Преподаватели худшего университета регулярно превращают работу в катастрофу.','Суперзлодей и противники заняты мелкими амбициями не меньше, чем грандиозными планами.','Мутант-странник ищет смысл жизни, превращая философствование в чудовищный абсурд.','Дочь дьявола пытается жить самостоятельно вопреки адским планам отца.']
def get(url):
 r=U.urlopen(U.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=15);b=r.read();return gzip.decompress(b)if b[:2]==b'\x1f\x8b' else b

def work(i):
 n=names[i];rank=51+i
 d=dict(rank=rank,title=n,ru=rus[i],year=None,kind='Анимация' if i>=15 else 'Игровой сериал',type='series',tags=['Чернуха','Абсурд']+(['Мульт']if i>=15 else ['Сатира']),syn=syn[i],why='Злой абсурд и непредсказуемая логика близки к твоей любви к Review и Drawn Together.',caveat='Очень специфический сюрреализм.' if i in [4,5,18]else 'Намеренно неприятные герои и грубый юмор.',dark=5 if i in [0,4,5,12,13,18]else 4,imdb=None,score=None,kp=None,kpurl=None,image=f'assets/new-s-{rank}.jpg',source=None,rezka=None,trailer=None)
 try:
  shows=json.loads(get('https://api.tvmaze.com/search/shows?q='+P.quote(n)))
  sh=next((x['show']for x in shows if x['show']['name'].lower()==n.lower() and(n!='Wilfred'or x['show']['premiered'].startswith('2011'))),shows[0]['show'])
  d.update(year=int(sh['premiered'][:4]),imdb=sh['externals']['imdb'],source=sh['url'])
  im=sh.get('image')
  if im:(root/'dist'/d['image']).write_bytes(get(im['original']or im['medium']))
 except Exception as e:d['metadataError']=str(e)
 try:
  s=get('https://hdrezka.me/search/?do=search&subaction=search&q='+P.quote(n)).decode('utf8','replace');cs=[]
  for chunk in re.split(r'<div class="b-content__inline_item"',s)[1:]:
   u=re.search(r'data-url="([^"]+)"',chunk);t=re.search(r'<div class="b-content__inline_item-link">\s*<a[^>]+>(.*?)</a>\s*<div>(.*?)</div>',chunk,re.S)
   if u and t:cs.append(dict(url=html.unescape(u[1]),title=html.unescape(t[1]),info=t[2]))
  ms=[x for x in cs if str(d['year'])in x['info']]
  if len(ms)==1:d['rezka']=ms[0]['url']
  d['rezkaCandidates']=cs
 except:pass
 return d
with C.ThreadPoolExecutor(max_workers=10)as ex:out=list(ex.map(work,range(20)))
(root/'expand-series-b.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print([(x['rank'],x['year'],x['rezka'])for x in out])
