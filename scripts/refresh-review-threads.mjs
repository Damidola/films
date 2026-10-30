import fs from 'node:fs/promises';
import {readRegisteredHdrezkaReviews} from '../worker/reviews/hdrezka.mjs';
const dir='dist/reviews/hdrezka', names=(await fs.readdir(dir)).filter(n=>n.endsWith('.json'));
let nextAt=0,blocked=false,count=0,failed=0;
async function fetchPublic(url,opts){
  const at=Math.max(Date.now(),nextAt);nextAt=at+500;
  await new Promise(r=>setTimeout(r,at-Date.now()));
  if(blocked)throw Error('source-blocked');
  const r=await fetch(url,{...opts,signal:AbortSignal.timeout(10000)});
  if([403,429].includes(r.status)){blocked=true;throw Error('source-blocked');}return r;
}
const sources=JSON.parse(await fs.readFile('dist/review-sources.json','utf8')).sources;
let cursor=0;const report=[];
await Promise.all(Array.from({length:2},async()=>{while(cursor<names.length&&!blocked){const name=names[cursor++];const rank=Number(name.slice(0,-5));const source=sources[String(rank)];if(!source||new URL(source.url).hostname!=='hdrezka.me')continue;
try{const data=await readRegisteredHdrezkaReviews({rank,title:source.matchedTitle,year:source.matchedYear,kpId:source.kpId},source,fetchPublic);if(!data.comments.length)continue;await fs.writeFile(dir+'/'+name,JSON.stringify(data)+'\n');count++;report.push({rank,count:data.comments.length,replies:data.comments.filter(c=>c.depth>0).length});if(count%25===0)console.log('Threaded snapshots',count,'failed',failed);}
catch(e){failed++;report.push({rank,error:e.message});}}
}));
await fs.writeFile('research/review-threads-refresh.json',JSON.stringify({checkedAt:new Date().toISOString(),count,failed,blocked,items:report},null,2));console.log('DONE',count,failed,blocked);
