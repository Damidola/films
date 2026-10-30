"""Review identity and use alternative public English trailers, with evidence."""
import concurrent.futures,datetime,json,pathlib,re,threading,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];P=ROOT/'research/english-trailers.json';data=json.load(open(P));lock=threading.Lock()
reject={'6358207','1002689','709862','633647','687220','471995','412485','570010','229746','336463','1197602','1431592','5126495','591870','521547','493390','81691','818981','1123456','255671','89539','178710','820540','1045249','471825','731962','395369','1394147','1166515'}
queries={'734884':'Nathan for You Comedy Central season 1 trailer','693935':'Review Andy Daly Comedy Central series trailer','276360':'Drawn Together Comedy Central cartoon trailer','471825':'Community Sony season 1 official trailer 2009','731962':'Utopia Channel 4 2013 trailer','395369':'The Descendants George Clooney 2011 trailer','1394147':'Confess Fletch Jon Hamm 2022 trailer','1002689':'Search Party TBS 2016 season 1 trailer','818981':'What We Do in the Shadows 2014 Taika Waititi movie trailer','591870':'Death Valley MTV 2011 series trailer','1197602':'Camping Julia Davis 2016 Sky Atlantic trailer','493390':'The Voices Ryan Reynolds 2014 trailer','255671':'Deadwood 2004 series HBO trailer','6358207':'Murder Mindfully season 1 official Netflix trailer English','521547':'Lucy Daughter Devil Adult Swim promo','687220':'Moral Orel Adult Swim series promo','1431592':'Cunk on Britain BBC 2018 trailer','5126495':'Cunk on Earth Netflix trailer'}
CONTEXT={'client':{'clientName':'WEB','clientVersion':'2.20261014.00.00','hl':'en'}}
def post(route,payload,android=False):
 context={'client':{'clientName':'ANDROID','clientVersion':'20.10.38','androidSdkVersion':30,'hl':'en'}}if android else CONTEXT
 req=urllib.request.Request('https://www.youtube-nocookie.com/youtubei/v1/'+route,data=json.dumps({'context':context,**payload}).encode(),headers={'Content-Type':'application/json','User-Agent':'com.google.android.youtube/20.10.38 (Linux; U; Android 11)'if android else'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=12)as r:return json.load(r)
def nodes(x,key):
 if isinstance(x,dict):
  if key in x:yield x[key]
  for v in x.values():yield from nodes(v,key)
 elif isinstance(x,list):
  for v in x:yield from nodes(v,key)
def txt(x):return x.get('simpleText')or''.join(v.get('text','')for v in x.get('runs',[]))
def metadata(vid):
 if vid in data['videos']:return data['videos'][vid]
 web=post('player',{'videoId':vid});android=post('player',{'videoId':vid},True);m=web.get('microformat',{}).get('playerMicroformatRenderer',{});v=web.get('videoDetails',{});s=android.get('playabilityStatus',{});c=android.get('captions',{}).get('playerCaptionsTracklistRenderer',{}).get('captionTracks',[])
 result={'videoId':vid,'title':v.get('title'),'channel':v.get('author'),'duration':int(v.get('lengthSeconds')or 0),'uaAllowed':'UA'in m.get('availableCountries',[]),'ruAllowed':'RU'in m.get('availableCountries',[]),'embed':s.get('playableInEmbed')is True,'status':s.get('status'),'maxHeight':max([f.get('height',0)for f in android.get('streamingData',{}).get('adaptiveFormats',[])]+[0]),'asrLanguages':list({t.get('languageCode')for t in c if t.get('kind')=='asr'}),'captionLanguages':list({t.get('languageCode')for t in c}),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 with lock:data['videos'][vid]=result
 return result
foreign={'Riders of Justice',"Adam's Apples",'The Green Butchers','Men & Chicken','One Cut of the Dead','Wild Tales','Gomorrah','Dark','El Chapo','Jigeum uri hakgyoneun','Vermin','Junk Head','Robot Dreams'}
def identity(row,title):
 s=title.lower()
 if re.search(r'fan.?made|parody|remake|demo|trailer.style|\b1960\b|\b1976\b|disney|trailer park\b|\bfull episode\b|auditions',s):return False
 if row['key']=='471825'and'movie'in s:return False
 if row['key']=='731962'and re.search('prime|amazon',s):return False
 if row['key']=='493390'and'2020'in s:return False
 if row['key']=='255671'and'movie'in s:return False
 if row['key']=='395369'and'2015'in s:return False
 if row['key'] in ['1431592','5126495']and'cunk on life'in s:return False
 if row['key']=='734884'and'you can see everything'in s:return False
 return True
pool=json.load(open(ROOT/'dist/personal-candidates.json'));keys={i['kpurl'].split('/')[-2]for i in pool};keys|=reject|{'734884','693935','276360','5030035','818445','1145673','485261','102474','1978'}
for k,row in data['items'].items():
 if re.search('[а-яА-Я]',row['title']):row['accepted']=[]
 if k in reject:row['rejectedPrevious']='Wrong work, fan edit, remake or non-trailer';row['accepted']=[]
 row['accepted']=[m for m in row['accepted']if identity(row,m.get('title')or'')]
def f(k):
 row=data['items'].get(k)
 if not row or row['title']in foreign or re.search('[а-яА-Я]',row['title']):return
 if any(m['maxHeight']>=720 for m in row['accepted']):return
 try:
  q=queries.get(k,row['title']+' '+str(row['year'])+' '+('cartoon series 'if row['title']in ['BoJack Horseman','Archer','Inside Job','Solar Opposites']else'')+'trailer HD');raw=post('search',{'query':q});tokens=set(re.findall('[a-z0-9]+',row['title'].lower()))-{'the','and','a','for','of','to','in','with','vs','s'};seen=set();found=[]
  for v in nodes(raw,'videoRenderer'):
   title=txt(v.get('title',{}));channel=txt(v.get('ownerText',{}));words=set(re.findall('[a-z0-9]+',title.lower()));parts=txt(v.get('lengthText',{})).split(':');duration=sum(int(x)*60**n for n,x in enumerate(reversed(parts)))if all(x.isdigit()for x in parts)else 0
   if not 35<=duration<=330 or not re.search('trailer|promo',title,re.I)or not identity(row,title):continue
   if re.search('deutsch|german|русск|трейлер|dublado|espa[nñ]ol|italiano|bande.annonce|reaction|recap|honest trailer|fan.?made|concept|opening|explained|announcement',title+' '+channel,re.I):continue
   if tokens and len(tokens&words)/len(tokens)<.75:continue
   vid=v['videoId']
   if vid not in seen:found.append({'videoId':vid,'title':title,'channel':channel});seen.add(vid)
   if len(found)>=12:break
  row['additionalQuery']=q;row['additionalSearch']=found
  for v in found:
   try:
    m=metadata(v['videoId'])
    if not m['uaAllowed']or not m['embed']or m['status']!='OK':continue
    en=any((x or'').startswith('en')for x in m['asrLanguages']);basis='English automatic speech transcript'
    if not m['asrLanguages']and(any((x or'').startswith('en')for x in m['captionLanguages'])or re.search(r'HBO|Netflix|Prime Video|Apple TV|Paramount|FX Networks|A24|Searchlight|Sony.?Pictures|Universal|Comedy Central|Focus Features|Lionsgate|Warner Bros|Magnolia|GKIDS|Rotten Tomatoes|Adult Swim|BBC|Channel 4|E4|IFC|Film4|NEON|Amazon MGM|Shout! Studios|TV Promos',m.get('channel')or'',re.I)):
     en=True;basis='English publisher/captions for original English-language work'
    if not en:continue
    m={**m,'language':'en','languageBasis':basis}
    if not any(x['videoId']==m['videoId']for x in row['accepted']):row['accepted'].append(m)
    if m['maxHeight']>=720:break
   except Exception:pass
  row['accepted'].sort(key=lambda m:(m['maxHeight']>=720,m['maxHeight']),reverse=True)
 except Exception as e:row['refineError']=str(e)[:100]
 with lock:P.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(row['title'],':',row['accepted'][0]['title']if row['accepted']else'not verified',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as executor:list(executor.map(f,sorted(keys)))
print('pool HD',sum(any(m['maxHeight']>=720 for m in data['items'].get(i['kpurl'].split('/')[-2],{}).get('accepted',[]))for i in pool),flush=True)
