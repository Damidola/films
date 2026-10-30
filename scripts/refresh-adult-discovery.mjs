/** Reproducible editorial refresh; source proofs are retained in research/. */
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const [editorial, metadata, providers, videos, ages, current] = await Promise.all([
  'research/adult-refresh-editorial.json',
  'research/discovery-adult-30-metadata.json',
  'research/discovery-adult-30-provider-records.json',
  'research/discovery-adult-30-trailers.json',
  'research/discovery-adult-30-age-proof.json',
  'dist/personal-candidates.json',
].map(read));
const preferred = {492:'WXNf9dxnQrM',493:'kCY5sk2hElo',494:'e9WTU_33Ank',516:'-xoCCmjkxKQ',535:'NGOL2_mI9Hw'};
const rejectedVideos = new Set(['H8w30K9FwtY','vCkklk1-URc','Du2OaaTjgkw','a65SPHOQZa0']);
for (const choice of editorial) {
  const meta = metadata.find(x => x.rank === choice.rank);
  const id = meta.kpurl.match(/\/(\d+)\/?$/)[1];
  const source = providers.find(x => x.kpId === id);
  const age = ages[id];
  if (!age || !meta.image || !source.rezka || !source.kinogo || meta.score < 6 || meta.year < 2000)
    throw Error('Incomplete work ' + choice.rank);
  const accepted = videos[id].accepted.filter(x => !rejectedVideos.has(x.videoId) && x.uaAllowed && x.embed && x.language === 'en' && x.maxHeight >= 720);
  accepted.sort((a,b) => Number(b.videoId === preferred[choice.rank]) - Number(a.videoId === preferred[choice.rank]));
  if (!accepted.length) throw Error('No verified English HD trailer ' + choice.rank);
  const trailer = x => ({videoId:x.videoId,url:'https://www.youtube.com/watch?v='+x.videoId,title:x.title,channel:x.channel,kind:'trailer',duration:x.duration,language:'en',languageBasis:x.languageBasis,maxHeight:x.maxHeight,verifiedAt:x.checkedAt.slice(0,10),availability:{regions:x.ruAllowed?['UA','RU']:['UA'],embed:true,checkedAt:x.checkedAt,source:'YouTube public player metadata'}});
  const verification = url => ({url,basis:'exact-kinopoisk-id',checkedAt:source.checkedAt});
  const record = {...meta,imdbVotes:meta.votes,scoreSource:'https://datasets.imdbws.com/title.ratings.tsv.gz',rezka:source.rezka,kinogo:source.kinogo,source:source.rezka,
    syn:source.work.description,tags:[...new Set([...(source.work.genre || []),...choice.themes])],
    kind:meta.type === 'series'?'Сериал':'Фильм',editorialWhy:choice.why,caveat:choice.caveat,recommendationEvidence:choice.evidence,
    candidatePool:true,productionCountries:(source.work.countryOfOrigin || []).map(x=>x.name),
    trailer:trailer(accepted[0]),trailerAlternates:accepted.slice(1).map(trailer),
    ageRating:age,addedFrom:'adult-story-refresh-2026-10-19',
    providerVerification:{rezka:verification(source.rezka),kinogo:verification(source.kinogo)}};
  delete record.votes;
  const index = current.findIndex(x => x.rank === record.rank);
  if(index < 0) current.push(record); else current[index]=record;
}
await fs.writeFile(path.join(root,'dist/personal-candidates.json'),JSON.stringify(current)+'\n');
console.log('Added/updated',editorial.length,'source-backed works');
