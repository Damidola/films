import fs from 'node:fs/promises';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const rows=Object.values(await read('research/dark-series-17-research.json'));
const editorial=await read('research/dark-series-17-editorial.json');
const pool=(await read('dist/personal-candidates.json')).filter(i=>i.rank!==592);
const archive=(await read('dist/papich-series.json')).items;
const existing=[...await read('dist/catalog.json'),...pool.filter(i=>i.rank<591||i.rank>607)];
const id='dark-series-17-2026-10-21';const added=[];
for(const [index,[title,[evidence,syn,why,caveat,tags]]]of Object.entries(editorial).entries()){
 const row=rows.find(r=>r.title===title&&r.complete);if(!row)throw Error('Incomplete '+title);
 const canonical=archive.find(i=>i.imdb===row.imdb||i.kpurl?.match(/\/(\d+)\/?$/)?.[1]===row.kpId);
 const rank=canonical?.rank||591+index,w=row.work;
 if(existing.some(i=>i.rank!==rank&&(i.imdb===row.imdb||i.kpurl?.match(/\/(\d+)\/?$/)?.[1]===row.kpId)))throw Error('Duplicate '+title);
 const trailers=row.trailers.filter(t=>t.language==='en'&&t.maxHeight>=720&&t.availability?.embed&&t.availability.regions.includes('UA'));
 if(!trailers.length||!row.seriesStats||!row.rezka||!row.kinogo||row.score<6||row.year<2000)throw Error('Missing data '+title);
 if(title==='Louie')trailers.forEach(t=>{t.kind='series-promo';t.note='Промо сериала FX';});
 const images=Array.isArray(w.image)?w.image:[w.image].filter(Boolean);
 const image=canonical?.image||images.find(u=>u.includes('/posters/'))||row.image||images.at(-1);
 if(!image)throw Error('Missing poster '+title);
 const record={rank,title,ru:w.name.replace(/\s*\(\d+.*$/,''),type:'series',year:row.year,kpurl:'https://www.kinopoisk.ru/series/'+row.kpId+'/',imdb:row.imdb,score:row.score,kp:row.kp,kpVotes:row.kpVotes,scoreSource:'https://rating.kinopoisk.ru/'+row.kpId+'.xml',kpSource:'https://rating.kinopoisk.ru/'+row.kpId+'.xml',kpVerifiedAt:row.checkedAt,rezka:row.rezka,kinogo:row.kinogo,source:row.rezka,image,syn,tags,kind:row.group==='animated'?'Анимационный сериал':'Сериал',editorialWhy:why,caveat,recommendationEvidence:evidence,tasteConnections:Object.fromEntries(evidence.map(rank=>[rank,{reason:why,caveat}])),candidatePool:true,papichOnly:false,productionCountries:(w.countryOfOrigin||[]).map(c=>c.name).filter(Boolean),trailer:trailers[0],trailerAlternates:trailers.slice(1),seriesStats:row.seriesStats,addedFrom:id,providerVerification:{rezka:{url:row.rezka,basis:'exact-kinopoisk-id',checkedAt:row.checkedAt},kinogo:{url:row.kinogo,basis:'exact-kinopoisk-id',checkedAt:row.checkedAt}}};
 const at=pool.findIndex(i=>i.rank===rank);if(at<0)pool.push(record);else pool[at]=record;added.push(record);
}
if(added.length!==17)throw Error('Exactly 17 required');
await fs.writeFile('dist/personal-candidates.json',JSON.stringify(pool)+'\n');
await fs.writeFile('research/dark-series-17-release.json',JSON.stringify({id,checkedAt:new Date().toISOString(),items:added.map(i=>({rank:i.rank,title:i.title,ru:i.ru,type:i.type,year:i.year,kpurl:i.kpurl,videoId:i.trailer.videoId}))},null,2)+'\n');
console.log('ADDED',added.map(i=>[i.rank,i.ru]));
