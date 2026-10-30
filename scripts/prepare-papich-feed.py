"""Cache public YouTube search and metadata for Papich's 6+ collection."""
import concurrent.futures,datetime,json,pathlib,re,urllib.request,threading
ROOT=pathlib.Path(__file__).resolve().parents[1];PATH=ROOT/'research/papich-feed-media.json';lock=threading.Lock()
data=json.loads(PATH.read_text()) if PATH.exists() else {'items':{},'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
items=[i for i in json.loads((ROOT/'dist/papich-series.json').read_text())['items'] if i['papichScore']>=6 and i['papichOnly']]
CONTEXT={'client':{'clientName':'WEB','clientVersion':'2.20261014.00.00','hl':'ru'}}
def api(route,payload):
 req=urllib.request.Request('https://www.youtube-nocookie.com/youtubei/v1/'+route,data=json.dumps({'context':CONTEXT,**payload}).encode(),headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0'})
 with urllib.request.urlopen(req,timeout=20) as r:return json.load(r)
def nodes(x,key):
 if isinstance(x,dict):
  if key in x:yield x[key]
  for v in x.values():yield from nodes(v,key)
 elif isinstance(x,list):
  for v in x:yield from nodes(v,key)
def text(x):return x.get('simpleText') or ''.join(r.get('text','') for r in x.get('runs',[]))
def save():PATH.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def search(i):
 key=str(i['rank'])
 if data['items'].get(key,{}).get('search'):return
 query=i['ru']+' '+str(i['year'])+' трейлер'
 raw=api('search',{'query':query});rows=[]
 for v in nodes(raw,'videoRenderer'):
  duration=text(v.get('lengthText',{}));parts=duration.split(':');seconds=sum(int(n)*60**p for p,n in enumerate(reversed(parts))) if all(n.isdigit() for n in parts) else 0
  if not seconds or seconds>900:continue
  rows.append({'videoId':v.get('videoId'),'title':text(v.get('title',{})),'channel':text(v.get('ownerText',{})),'duration':seconds})
  if len(rows)==7:break
 with lock:data['items'][key]={'rank':i['rank'],'ru':i['ru'],'title':i['title'],'query':query,'search':rows};save()
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for i,f in zip(items,pool.map(search,items)):pass
print('Cached searches:',len(data['items']))
for i in items:
 r=data['items'][str(i['rank'])];print(str(i['rank'])+' '+i['ru']+' | '+' | '.join(v['videoId']+' '+v['title'][:88]+' ['+v['channel']+'] '+str(v['duration']) for v in r['search'][:3]))
# Store metadata only, never media URLs or streams. Logged-out Android supplies embed
# permission, while WEB metadata lists countries without changing the user's region.
data.setdefault('videos',{})
def verify(v):
 key=v['videoId']
 if key in data['videos']:return
 try:
  web=api('player',{'videoId':key});m=web.get('microformat',{}).get('playerMicroformatRenderer',{});d=web.get('videoDetails',{})
  payload={'context':{'client':{'clientName':'ANDROID','clientVersion':'20.10.38','androidSdkVersion':30,'hl':'ru'}},'videoId':key}
  req=urllib.request.Request('https://www.youtube-nocookie.com/youtubei/v1/player',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','User-Agent':'com.google.android.youtube/20.10.38 (Linux; U; Android 11)'})
  with urllib.request.urlopen(req,timeout=20) as r:android=json.load(r)
  status=android.get('playabilityStatus',{});countries=m.get('availableCountries',[])
  result={'videoId':key,'title':d.get('title'),'channel':d.get('author'),'duration':int(d.get('lengthSeconds') or 0),'countries':countries,'uaAllowed':'UA'in countries,'ruAllowed':'RU'in countries,'embed':status.get('playableInEmbed') is True,'playability':status.get('status'),'reason':status.get('reason'),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':['https://www.youtube-nocookie.com/youtubei/v1/player'],'private':d.get('isPrivate',False)}
 except Exception as e:result={'videoId':key,'error':str(e)[:160]}
 with lock:data['videos'][key]=result;save()
allvideos={v['videoId']:v for r in data['items'].values() for v in r['search'][:4]}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(verify,allvideos.values()))
print('Metadata:',len(data['videos']),'UA + embeddable:',sum(v.get('uaAllowed') and v.get('embed') and v.get('playability')=='OK' for v in data['videos'].values()))
