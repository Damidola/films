"""Select real, embeddable English trailers; store facts, never streaming URLs."""
import concurrent.futures,datetime,json,pathlib,re,threading,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];P=ROOT/'research/english-trailers.json';data=json.loads(P.read_text())if P.exists()else{'items':{},'videos':{}};lock=threading.Lock();tasks={}
for i in json.load(open(ROOT/'dist/catalog.json')):
 key=i['kpurl'].split('/')[-2]if i.get('kpurl')else'imdb:'+str(i.get('imdb')or i['rank']);tasks[key]={'key':key,'title':i['title'],'year':i['year'],'type':i['type']}
for row in json.load(open(ROOT/'research/personal-candidates.json')).values():
 if row.get('work'):tasks[row['kpId']]={'key':row['kpId'],'title':row['title'],'year':row['year'],'type':row['type']}
for k,t,y in [('734884','Nathan for You',2013),('693935','Review',2014),('276360','Drawn Together',2004)]:tasks[k]={'key':k,'title':t,'year':y,'type':'series'}
CONTEXT={'client':{'clientName':'WEB','clientVersion':'2.20261014.00.00','hl':'en'}}
def post(route,payload,android=False):
 body={'context':{'client':{'clientName':'ANDROID','clientVersion':'20.10.38','androidSdkVersion':30,'hl':'en'}}if android else CONTEXT,**payload};req=urllib.request.Request('https://www.youtube-nocookie.com/youtubei/v1/'+route,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','User-Agent':'com.google.android.youtube/20.10.38 (Linux; U; Android 11)'if android else'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=15)as r:return json.load(r)
def nodes(x,key):
 if isinstance(x,dict):
  if key in x:yield x[key]
  for v in x.values():yield from nodes(v,key)
 elif isinstance(x,list):
  for v in x:yield from nodes(v,key)
def txt(x):return x.get('simpleText')or''.join(v.get('text','')for v in x.get('runs',[]))
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())
foreign={'Riders of Justice',"Adam's Apples",'The Green Butchers','Men & Chicken','One Cut of the Dead','Wild Tales','Gomorrah','Dark','El Chapo','Jigeum uri hakgyoneun','Elfen Lied','1 rittoru no namida','Vermin'}

def metadata(vid):
 if vid in data['videos']:return data['videos'][vid]
 web=post('player',{'videoId':vid});android=post('player',{'videoId':vid},True);m=web.get('microformat',{}).get('playerMicroformatRenderer',{});v=web.get('videoDetails',{});status=android.get('playabilityStatus',{});captions=android.get('captions',{}).get('playerCaptionsTracklistRenderer',{}).get('captionTracks',[]);formats=android.get('streamingData',{}).get('adaptiveFormats',[])
 result={'videoId':vid,'title':v.get('title'),'channel':v.get('author'),'duration':int(v.get('lengthSeconds')or 0),'uaAllowed':'UA'in m.get('availableCountries',[]),'ruAllowed':'RU'in m.get('availableCountries',[]),'embed':status.get('playableInEmbed')is True,'status':status.get('status'),'maxHeight':max([f.get('height',0)for f in formats]+[0]),'asrLanguages':list({t.get('languageCode')for t in captions if t.get('kind')=='asr'}),'captionLanguages':list({t.get('languageCode')for t in captions}),'audioTracks':list({f.get('audioTrack',{}).get('id')for f in formats if f.get('audioTrack')}),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 with lock:data['videos'][vid]=result
 return result

def f(task):
 key=task['key']
 if data['items'].get(key,{}).get('finished'):return
 result={**task,'search':[],'accepted':[],'finished':True}
 try:
  q=task['title']+' '+str(task['year'])+' '+('series 'if task['type']=='series'else'')+'official trailer English';raw=post('search',{'query':q});result['query']=q
  tokens=[t for t in re.findall(r'[a-z0-9]+',task['title'].lower())if t not in ['the','and','of','a','an','for','to','in','with','vs']];seen=set()
  for v in nodes(raw,'videoRenderer'):
   title=txt(v.get('title',{}));channel=txt(v.get('ownerText',{}));words=set(re.findall(r'[a-z0-9]+',title.lower()));length=txt(v.get('lengthText',{}));parts=length.split(':');seconds=sum(int(x)*60**n for n,x in enumerate(reversed(parts)))if all(x.isdigit()for x in parts)else 0
   if not 40<=seconds<=360 or not re.search('trailer|promo',title,re.I):continue
   if re.search(r'deutsch|german|русск|трейлер|dublado|espa[nñ]ol|italiano|bande.annonce|reaction|recap|honest trailer|fan.?made|concept trailer|opening|title sequence|reviewed',title+' '+channel,re.I):continue
   if tokens and sum(t in words for t in tokens)/len(tokens)<.65:continue
   vid=v['videoId']
   if vid in seen:continue
   seen.add(vid);result['search'].append({'videoId':vid,'title':title,'channel':channel,'duration':seconds})
   if len(result['search'])>=6:break
  for v in result['search'][:5]:
   try:
    m=metadata(v['videoId']);asr=m['asrLanguages'];native=task['title']not in foreign and not re.search('[а-яА-Я]',task['title']);en=any(x and x.startswith('en')for x in asr)
    basis='English automatic speech transcript'if en else None
    if not asr and native and any(x and x.startswith('en')for x in m['captionLanguages']):en=True;basis='English captions for original English-language work'
    if not asr and not m['captionLanguages']and native and re.search(r'HBO|Netflix|Prime Video|Apple TV|Paramount|FX Networks|A24|Searchlight|Sony Pictures|Universal Pictures|Comedy Central|Focus Features|Lionsgate|Warner Bros|Magnolia Pictures|GKIDS|Rotten Tomatoes|Adult Swim|BBC|Channel 4|E4|IFC Films|Magnolia|Film4|NEON',m.get('channel')or'',re.I):en=True;basis='English publisher trailer for original English-language work'
    if not en or not m['uaAllowed']or not m['embed']or m['status']!='OK':continue
    result['accepted'].append({**m,'language':'en','languageBasis':basis})
    if m['maxHeight']>=720 and len(result['accepted'])>=2:break
   except Exception as e:result.setdefault('errors',[]).append(str(e)[:90])
  result['accepted'].sort(key=lambda m:(m['maxHeight']>=720,not bool(re.search('teaser',m['title'],re.I)),m['maxHeight']),reverse=True)
 except Exception as e:result['error']=str(e)[:120];result['finished']=False
 with lock:
  data['items'][key]=result;P.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');count=len(data['items'])
  if count%30==0:print('Checked',count,'/',len(tasks),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as pool:list(pool.map(f,tasks.values()))
print('English trailers:',sum(bool(x['accepted'])for x in data['items'].values()),'of',len(tasks),'HD:',sum(any(v['maxHeight']>=720 for v in x['accepted'])for x in data['items'].values()),flush=True)
print('Missing:',[(i['key'],i['title'])for i in data['items'].values()if not i['accepted']],flush=True)
