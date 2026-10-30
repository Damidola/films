import fs from 'node:fs/promises';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const researched=Object.values(await read('research/dark-refresh-50-research.json'));
const editorial=await read('research/dark-refresh-50-editorial.json');
const finalTitles = await read('research/dark-refresh-50-final-titles.json');
const choices = finalTitles.map(title => researched.find(row => row.title === title && row.complete));
if (choices.some(row => !row)) throw Error('A reviewed final work is missing its source research');
if(choices.length!==50)throw Error('Exactly 50 verified new works required');
const providerLinks={
'A Touch of Cloth':'https://kinogo.lu/22916-inspektor-klot-2012.html',
'The Wrong Mans':'https://kinoogo.zone/10521-ne-te-parni.html',
'Sprung':'https://kinogo.eu/16828-raskol-serial-2022.html',
'Big Time in Hollywood, FL':'https://kinogo.bz/gernes/komedija/56302-serial-uspeh-v-gollivude-florida-2015.html',
'White Gold':'https://kinogo.bz/gernes/komedija/18726-serial-beloe-zoloto-2017.html',
'Captain Fall':'https://kinogo.mn/49429-kapitan-foll.html',
'Jeff & Some Aliens':'https://kinogo.net/30500-jeff-some-aliens.html',
'People of Earth':'https://kinogo.media/9886-zemljane.html',
'Ted':'https://kinogo.eu/19626-tretij-lishnij-serial-2024.html',
'Trial & Error':'https://kinogo.mn/8578-metodom-prob-i-oshibok.html',
};
const pool=await read('dist/personal-candidates.json');
const groups={crime:['Криминал','Чёрный юмор','Криминальная комедия','Диалоги','Цинизм'],action:['Комедия','Боевик','Грубый юмор','Кровавый фарс'],con:['Комедия','Аферы','Цинизм','Диалоги'],animated:['Мульт','Чёрный юмор','Абсурд','Грубый юмор'],farce:['Комедия','Абсурд','Грубый юмор'],mock:['Комедия','Мокьюментари','Неловкий юмор'],satire:['Сатира','Чёрный юмор']};
const now=new Date().toISOString(), added=[];
for(const [index,row]of choices.entries()){
 const rank=541+index,w=row.work,[evidence,why,caveat]=editorial[row.title];
 const images=Array.isArray(w.image)?w.image:[w.image].filter(Boolean);
 const image=images.find(u=>u.includes('/posters/'))||row.image||images.at(-1)||'https://st.kp.yandex.net/images/film_big/'+row.kpId+'.jpg';
 const trailers=row.trailers.filter(t=>!(row.title==='The Young Offenders'&&/series|season/i.test(t.title))&&!/Breaking News|upscaled/i.test(t.title+' '+t.channel)&&t.channel!=='Almira Movie Database'&&t.maxHeight>=720&&t.language==='en'&&t.availability?.embed&&t.availability.regions.includes('UA'));
 if(!trailers.length||!row.rezka||!row.kinogo&&!providerLinks[row.title]||!image||row.score<6)throw Error('Incomplete '+row.title);
 const matches=pool.find(i=>i.title===row.title&&i.year===row.year&&i.type===row.type);
 if(matches&&matches.rank!==rank)throw Error('Existing work: '+row.title);
 const duration=String(w.duration||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
 const syn=String(row.syn||w.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 const genres=Array.isArray(w.genre)?w.genre:[w.genre].filter(Boolean);
 const record={rank,title:row.title,ru:row.ru||w.name.replace(/\s*\(\d{4}.*$/,''),type:row.type,year:row.year,
 kpurl:'https://www.kinopoisk.ru/'+(row.type==='series'?'series':'film')+'/'+row.kpId+'/',imdb:row.imdb,
 score:row.score,kp:row.kp,kpVotes:row.kpVotes,scoreSource:'https://rating.kinopoisk.ru/'+row.kpId+'.xml',kpSource:'https://rating.kinopoisk.ru/'+row.kpId+'.xml',kpVerifiedAt:row.checkedAt,
 rezka:row.rezka,kinogo:row.kinogo||providerLinks[row.title],source:row.rezka,image,syn,
 tags:[...new Set([...genres,...groups[row.group]||groups.crime])],kind:row.type==='film'?'Фильм':row.group==='animated'?'Анимационный сериал':'Сериал',
 editorialWhy:why,caveat,recommendationEvidence:evidence,tasteConnections:Object.fromEntries(evidence.map(id=>[id,{reason:why,caveat}])),
 candidatePool:true,productionCountries:(w.countryOfOrigin||[]).map(c=>c.name).filter(Boolean),
 trailer:trailers[0],trailerAlternates:trailers.slice(1),addedFrom:'dark-humor-50-2026-10-20',
 providerVerification:{rezka:{url:row.rezka,basis:row.source?'exact-original-title-year':'exact-kinopoisk-id',checkedAt:row.checkedAt},kinogo:{url:row.kinogo||providerLinks[row.title],basis:row.kinogo?'exact-kinopoisk-id':'indexed-title-year',checkedAt:now}}};
 if(row.seriesStats)record.seriesStats=row.seriesStats;
 if(row.type==='film'&&duration)record.runtime=Number(duration[1]||0)*60+Number(duration[2]||0);
 if(!syn||row.type==='series'&&!record.seriesStats)throw Error('Missing synopsis/statistics '+row.title);
 const at=pool.findIndex(i=>i.rank===rank);if(at<0)pool.push(record);else pool[at]=record;added.push(record);
}
await fs.writeFile('dist/personal-candidates.json',JSON.stringify(pool)+'\n');
await fs.writeFile('research/dark-refresh-50-release.json',JSON.stringify({checkedAt:now,id:'dark-humor-50-2026-10-20',items:added.map(i=>({rank:i.rank,title:i.title,ru:i.ru,type:i.type,year:i.year,kpurl:i.kpurl,videoId:i.trailer.videoId})),series:added.filter(i=>i.type==='series').length,films:added.filter(i=>i.type==='film').length},null,2)+'\n');
console.log('ADDED',added.length,'series',added.filter(i=>i.type==='series').length,'films',added.filter(i=>i.type==='film').length);
