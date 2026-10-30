"""Apply manually reviewed archive identities and disclose non-trailer previews."""
import copy,json,pathlib
R=pathlib.Path(__file__).resolve().parents[1];data=json.load(open(R/'research/english-trailers.json'));videos=data['videos'];doc=json.load(open(R/'dist/papich-series.json'));byrank={i['rank']:i for i in doc['items']};choices={164:('Xv1M-W0vrf4','en','trailer'),136:('zS8nD0UdaVE','en','trailer'),129:('vRhfEG_529I','ru','trailer'),127:('6ulDdKJRrQY','ru','trailer'),196:('7sKDWKDEugU','en','trailer'),260:('SE8Xk-cFom0','en','trailer'),156:('odIwkGztmcc','en','trailer'),201:('tTQCcFOGfS0','en','trailer'),139:('Ph4c5HTpjvI','ru','series-promo'),175:('Ph4c5HTpjvI','ru','series-promo'),167:('PrpA9iQdtCE','ru','trailer'),138:('IdaymHd8yZI','ru','series-promo'),246:('fvCdLmxnkj0','en','trailer'),277:('EPJL-YKMFjE','en','trailer'),158:('gSW4qb4rtg4','en','fan-trailer'),154:('GgXGy78km5w','ru','clip'),182:('ToiBuBS2aOk','ja','clip'),150:('Ob1K9k1ucwo','en','related-edition')}
notes={139:'Общий трейлер сериала «Крот», 2001–2002.',175:'Общий трейлер сериала «Крот», 2001–2002.',158:'Фан-трейлер из кадров оригинального аниме.',154:'Короткий фрагмент сериала; полноценный трейлер не найден.',182:'Фрагмент спецвыпуска сериала, 2007. Полноценный трейлер не найден.',150:'Трейлер киноверсии 1981 года — того же проекта, из которого смонтирован мини-сериал 1985 года.'}
for rank,(vid,language,kind)in choices.items():
 m=videos[vid]
 if not(m.get('uaAllowed')and m.get('embed')and m.get('status')=='OK'):raise ValueError('Unplayable '+vid)
 i=byrank[rank];v={'videoId':vid,'url':'https://www.youtube.com/watch?v='+vid,'title':m['title'],'channel':m['channel'],'duration':m['duration'],'kind':kind,'language':language,'languageBasis':'Manual review of work identity, publisher, public metadata and source description','maxHeight':m['maxHeight'],'verifiedAt':'18.10.2026','availability':{'regions':['UA']+(['RU']if m.get('ruAllowed')else[]),'embed':True,'checkedAt':m['checkedAt'],'source':'YouTube public player metadata'}}
 if rank in notes:v['note']=notes[rank]
 if rank==182 and any((x or'').startswith('en')for x in m.get('captionLanguages',[])):v['subtitles']='en'
 i['trailer']=v;i['trailerAlternates']=[];i.pop('trailerStatus',None)
# These catalog rows represent seasons of the same show; explicitly label a shared series promo.
for rank in [159,176,191,198]:
 i=byrank[rank];i['trailer']=copy.deepcopy(byrank[153]['trailer']);i['trailer']['kind']='series-promo';i['trailer']['note']='Общее промо сериала «Ментовские войны»; отдельный трейлер сезона не найден.';i['trailerAlternates']=[];i.pop('trailerStatus',None)
for rank in [135]:byrank[rank]['trailer']['kind']='fan-trailer'
(R/'dist/papich-series.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n');(R/'research/papich-trailer-choices.json').write_text(json.dumps({'choices':{str(k):{'videoId':v[0],'language':v[1],'kind':v[2],'note':notes.get(k)}for k,v in choices.items()},'sharedPromoRanks':[159,176,191,198]},ensure_ascii=False,indent=2)+'\n')
print('Archive previews:',sum(bool(i.get('trailer'))for i in doc['items']),'/',len(doc['items']));print('Disclosed alternatives:',[(i['rank'],i['trailer']['kind'])for i in doc['items']if i.get('trailer',{}).get('kind')in ['clip','fan-trailer','related-edition']])
