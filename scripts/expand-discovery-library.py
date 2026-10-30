"""Merge only researched, identity-reviewed English-HD discoveries. Idempotent, no user marks edited."""
import datetime,html,json,pathlib,re
R=pathlib.Path(__file__).resolve().parents[1]
raw=json.load(open(R/'research/personal-candidates.json'));meta=json.load(open(R/'research/discovery-200-metadata.json'));videos=json.load(open(R/'research/discovery-200-trailers.json'));pool=json.load(open(R/'dist/personal-candidates.json'));now=datetime.datetime.now(datetime.timezone.utc).isoformat()
# Editorial connections refer to actual shared-profile likes; runtime only uses a connection while that like remains positive.
connections={
'The Franchise':([100,78],'Закулисная сатира на индустрию и корпоративное лицемерие: ближе к «Меню» и «Здесь курят», чем к супергеройскому боевику.'),
'Avenue 5':([76,30],'Некомпетентное руководство превращает кризис в фарс — связь со «Смертью Сталина» именно в сатире на власть.'),
'A.P. Bio':([416,293],'Язвительный неудачник использует работу для мелкой мести; цинизм «Лаудермилка» встречается с комедией рабочего коллектива.'),
'Documentary Now!':([47,48,425],'Пародия на документалистику: серьёзная форма и абсурдное содержание, как в истории с Филоменой Канк.'),
'Portlandia':([47,30],'Скетчи высмеивают самодовольство и социальные привычки; здесь постановочная сатира, а не реальные интервью Коэна.'),
'Killing It':([78,100],'Чёрная сатира на американскую мечту: попытки разбогатеть превращают обычных людей в моральных банкротов.'),
'The Outlaws':([253,72],'Мелкие преступники, неудачные решения и сухой юмор; криминальная история важнее случайной жестокости.'),
'No Activity':([253,426],'Криминальная комедия построена на разговорах и некомпетентности, а не на погонях: история о работе с нелепой стороны.'),
'Perpetual Grace, LTD':([72,73],'Мошенническая схема с очень странными участниками: чёрный юмор и диалоги на фоне настоящего криминала.'),
'Deadloch':([72,75],'Полноценный детектив с язвительной комедией и конфликтующими напарницами; связь — в сочетании расследования и чёрного юмора.'),
'Obituary':([253,424],'Автор некрологов сама создаёт себе работу: преступление становится повседневной рутиной и источником чёрной комедии.'),
'Boat Story':([72,86],'Случайная находка запускает цепочку преступлений и всё более плохих решений — криминальный фарс с последствиями.'),
'Jett':([253,105],'Профессиональная преступница пытается выйти из опасной среды; ставка на характеры и криминальную интригу, комедии здесь меньше.'),
'Reprisal':([105,253],'Стилизованная криминальная месть с борьбой за власть внутри банды; это более жанровая и менее комедийная история.'),
'Gangs of London':([105,109],'Жестокая борьба наследников и группировок за власть — связь с «Чёрными парусами» в предательствах и конкурирующих интересах.'),
'Kin':([253,105],'Семейная лояльность сталкивается с криминальной войной: интерес в отношениях и цене решений, а не в одной пометке 18+.'),
'Love/Hate':([253,105],'Ирландская криминальная история о дружбе, лояльности и расплате; драматическая ветка твоих вкусов, без обещания комедии.'),
'Sneaky Pete':([253,73],'Мошенник присваивает чужую личность; удовольствие — в авантюре, вранье и постоянно усложняющихся последствиях.'),
'Animal Kingdom':([105,253],'Криминальная семья живёт по собственным правилам: ограбления, контроль и предательства внутри близкого круга.'),
'Good Behavior':([253,72],'Воровка сталкивается с наёмным убийцей: опасная работа и личная жизнь постоянно мешают друг другу.'),
'Bad Monkey':([75,72],'Язвительный детектив и эксцентричные преступники; расследование держится на диалогах и чёрной комедии.'),
'The Baby':([423,100],'Хоррор использует невозможную бытовую ситуацию для чёрной комедии; здесь жанровая сатира, а не реалистичная семейная драма.'),
'Wolf Like Me':([423,85],'Отношения осложняет буквальная чудовищность: необычное жанровое допущение и чёрный юмор, но есть романтическая линия.'),
'Shining Vale':([423,100],'Семейный кризис превращается в комедийный хоррор; сверхъестественное работает вместе с язвительной сатирой.'),
'Truth Seekers':([423,94],'Британская комедия об охотниках за паранормальным: обычная работа постепенно превращается в настоящий хоррор.'),
'Ghosts':([94,293],'Комедия о совместном быте с призраками: смешит конфликт характеров и правил, а не страх или жестокость.'),
'The Last Man on Earth':([293,85],'Конец света становится комедией о человеческом эгоизме и невозможности нормально уживаться.'),
'The Completely Made-Up Adventures of Dick Turpin':([47,76],'Исторический антураж намеренно превращён в нелепую комедию; здесь фарс, а не достоверная историческая драма.'),
'The Politician':([30,78],'Предвыборная борьба как сатира на амбиции и управление публичным образом; действие начинается в школе.'),
'House of Lies':([78,100],'Консультанты продают красивую ложь корпорациям: циничные герои и сатира на профессиональное лицемерие.'),
'Fired on Mars':([66,421],'Взрослая анимация о корпоративной бессмысленности на Марсе: абсурдная работа и экзистенциальный кризис.'),
'The Second Best Hospital in the Galaxy':([66,421],'Взрослая фантастическая анимация о работе и странных существах; общий интерес — гротескный мир и характеры.'),
'Carol & the End of the World':([66,85],'Спокойная взрослая анимация о рутине перед концом света: скорее экзистенциальный абсурд, чем грубые шутки.'),
'Scavengers Reign':([122],'Не комедия: самостоятельная фантастическая история о выживании и устройстве чужого мира, для ветки интереса к «Миру Дикого Запада».'),
'Pantheon':([122],'Фантастика о цифровом сознании, свободе и цене технологического прогресса; связь с «Миром Дикого Запада» тематическая, форма анимационная.'),
'The Legend of Vox Machina':([421,66],'Взрослое фэнтези с командой неидеальных героев, кровавыми приключениями и комедией — без обещания сходства с игровым криминалом.'),
'Doom Patrol':([85,423],'Группа сломанных людей в очень странном супергеройском мире: сюрреализм, чёрный юмор и телесный гротеск.'),
'Resident Alien':([293,85],'Чужак пытается изображать человека в маленьком городе: комедия социальной нелепости с детективной линией.'),
'Future Man':([423,424],'Неудачник вмешивается в историю, а попытки всё исправить только умножают катастрофы; грубая комедия и жанровые пародии.'),
'Happyish':([416,78],'Язвительный герой задыхается в рекламе и корпоративной культуре: цинизм и диалоги важнее ситкомных условностей.'),
'Brockmire':([416],'Саморазрушительный комментатор пытается вернуться к работе; едкий взрослый юмор и неприятный, но живой главный герой.'),
'Black Monday':([78,76],'Финансовая индустрия как чёрный фарс: самоуверенные люди, деньги и решения, которые ведут к общей катастрофе.'),
'The Studio':([100,78],'Киноиндустрия изнутри: сатира на начальство, творческое эго и компромиссы ради бизнеса.'),
'Government Cheese':([85,424],'Изобретатель пытается начать жизнь заново, но американская мечта превращается в сюрреалистическую авантюру.'),
'Lodge 49':([85,416],'История о неудачнике и странном братстве: повседневная жизнь постепенно обрастает абсурдом и загадкой.'),
'Wayward Pines':([417,122],'Не комедия: город-загадка с нарушенными правилами реальности, для интереса к фантастическим поворотам.'),
'Upright':([416],'Два неудобных попутчика везут пианино через Австралию: едкие разговоры и комедия характеров с драматической частью.'),
'This Is Going to Hurt':([416,417],'Чёрный британский юмор о работе врача: язвительные наблюдения соседствуют с тяжёлыми последствиями профессиональных решений.'),
'Santa Clarita Diet':([423,94],'Семейная рутина после превращения жены в зомби: комедийный хоррор про попытки сохранить обычную жизнь.'),
'Hot Fuzz':([75,423],'Британский детектив одновременно работает как боевик и кровавый фарс; хорошие диалоги и жанровая пародия.'),
}
excluded={'Exploding Kittens','Agent Elvis','The Newsreader'}
bykp={(x.get('kpurl')or'').rstrip('/').split('/')[-1]:x for x in pool};added=[]
for kp,m in meta.items():
 a=[v for v in videos[kp].get('accepted',[])if v.get('maxHeight',0)>=720]
 if not a or not m.get('image')or(m.get('score')or 0)<6 or m.get('kp')is None or m['title']in excluded:continue
 r=next(x for x in raw.values()if x.get('kpId')==kp);w=r['work'];title=m['title'];evidence,why=connections[title]
 syn=html.unescape(re.sub('<[^>]+>',' ',w.get('description')or''));syn=re.sub(r'\s+',' ',syn).strip();syn=' '.join(re.split(r'(?<=[.!?])\s+',syn)[:2]);
 if len(syn)>600:syn=syn[:600].rsplit(' ',1)[0]+'…'
 genres=m.get('genres')or w.get('genre',[]);genres=[genres]if isinstance(genres,str)else genres
 tags=list(dict.fromkeys(genres+(['Политическая сатира','Сатира']if title in ['Avenue 5','The Politician']else ['Сатира','Цинизм']if r['group']=='satire'else ['Криминальная комедия','Диалоги']if title in ['The Outlaws','No Activity','Perpetual Grace, LTD','Deadloch','Obituary','Boat Story','Bad Monkey','Hot Fuzz']else ['Криминал']if r['group']=='crime'else ['Кровавый фарс','Чёрный юмор']if r['group']=='horror'else ['Мульт','Абсурд']if r['group']=='animated'else ['Сухой юмор','Цинизм']if r['group']=='dry'else ['Абсурд'])))
 def trailer(v):return {'videoId':v['videoId'],'url':'https://www.youtube.com/watch?v='+v['videoId'],'title':v['title'],'channel':v['channel'],'kind':'trailer','duration':v['duration'],'language':'en','languageBasis':v['languageBasis'],'maxHeight':v['maxHeight'],'verifiedAt':now[:10],'availability':{'regions':['UA']+(['RU']if v.get('ruAllowed')else[]),'embed':True,'checkedAt':v['checkedAt'],'source':'YouTube public player metadata'}}
 record={'rank':m['rank'],'title':title,'ru':r['ru'],'type':m['type'],'year':m['year'],'kpurl':'https://www.kinopoisk.ru/'+('series'if m['type']=='series'else'film')+'/'+kp+'/','imdb':m['imdb'],'score':m['score'],'scoreSource':'https://datasets.imdbws.com/title.ratings.tsv.gz','imdbVotes':m.get('votes'),'kp':m['kp'],'kpVotes':m['kpVotes'],'kpSource':m['kpSource'],'kpVerifiedAt':now,'rezka':r['rezka'],'kinogo':r['kinogo'],'source':r['rezka'],'syn':syn,'tags':tags,'kind':'Анимационный сериал'if r['group']=='animated'else'Сериал'if m['type']=='series'else'Фильм','editorialWhy':why,'recommendationEvidence':evidence,'candidatePool':True,'image':m['image'],'productionCountries':m.get('productionCountries',[]),'trailer':trailer(a[0]),'trailerAlternates':[trailer(v)for v in a[1:2]],'addedFrom':'shared-taste-discovery-200','providerVerification':{p:{'url':r[p],'basis':'exact-kinopoisk-id','checkedAt':r['checkedAt']}for p in ['rezka','kinogo']}}
 for key in ['seriesStats','runtime']:
  if m.get(key):record[key]=m[key]
 bykp[kp]=record;added.append(record)
(R/'dist/personal-candidates.json').write_text(json.dumps(sorted(bykp.values(),key=lambda x:x['rank']),ensure_ascii=False,separators=(',',':'))+'\n')
(R/'research/discovery-200-release.json').write_text(json.dumps({'checkedAt':now,'added':[{'rank':x['rank'],'title':x['title'],'year':x['year'],'evidence':x['recommendationEvidence'],'videoId':x['trailer']['videoId']}for x in added],'targetUndecided':200,'sourcePolicy':'Exact provider work identifiers, IMDb >=6, year >=2000, English embeddable HD trailer; only real source comments, never fabricated.'},ensure_ascii=False,indent=2)+'\n')
print('Added',len(added),'series',sum(x['type']=='series'for x in added),'films',sum(x['type']=='film'for x in added))
