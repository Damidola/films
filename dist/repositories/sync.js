(function (root) {
  'use strict';
  const key='dc-cloud-sync-v1', api='https://api.github.com/repos/', file='/contents/films-profile.json';
  const checked=new Set();
  function valid(c){return !!(c&&typeof c.repo==='string'&&/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(c.repo)&&typeof c.token==='string'&&c.token.length>=10);}
  function config(){try{const c=JSON.parse(localStorage.getItem(key));return valid(c)?c:null;}catch{return null;}}
  const encode=value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));let raw='';for(const n of bytes)raw+=String.fromCharCode(n);return btoa(raw);};
  const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  function headers(c){return {Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};}
  function address(c){return api+c.repo.split('/').map(encodeURIComponent).join('/');}
  async function verify(c,signal){
    if(checked.has(c.repo+'\0'+c.token))return;
    const r=await fetch(address(c),{headers:headers(c),cache:'no-store',signal});
    if(!r.ok)throw Error('github-access');
    if(!(await r.json()).private)throw Error('private-repository-required');
    checked.add(c.repo+'\0'+c.token);
  }
  async function read(c,signal){
    const r=await fetch(address(c)+file,{headers:headers(c),cache:'no-store',signal});
    if(r.status===404)return {records:[],sha:null};
    if(!r.ok)throw Error('github-read');
    const content=await r.json(), data=decode(content.content||'');
    if(!Array.isArray(data.records))throw Error('github-profile-format');
    return {records:data.records,sha:content.sha};
  }
  function merge(remote,local){
    const records=new Map();
    for(const r of [...remote,...local]){
      if(!r||!Number.isSafeInteger(r.workId)||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<0||![null,'like','dislike'].includes(r.decision)||![null,'like','dislike'].includes(r.watched)||typeof r.good!=='boolean')throw Error('invalid-record');
      const old=records.get(r.workId);if(!old||r.updatedAt>old.updatedAt)records.set(r.workId,r);
    }
    return [...records.values()].sort((a,b)=>a.workId-b.workId);
  }
  async function request(options={}){
    const c=config();if(!c)throw Error('sync-not-configured');
    await verify(c,options.signal);
    if(options.method!=='PUT')return new Response(JSON.stringify({records:(await read(c,options.signal)).records}),{headers:{'Content-Type':'application/json'}});
    const local=JSON.parse(options.body).records;
    if(!Array.isArray(local)||local.length>2000)throw Error('invalid-records');
    for(let attempt=0;attempt<3;attempt++){
      const latest=await read(c,options.signal), records=merge(latest.records,local);
      if(JSON.stringify(records)===JSON.stringify(latest.records)&&latest.sha)return new Response(JSON.stringify({records}));
      const r=await fetch(address(c)+file,{method:'PUT',headers:headers(c),signal:options.signal,body:JSON.stringify({message:'Sync film preferences',content:encode({schemaVersion:1,records}),...(latest.sha?{sha:latest.sha}:{})})});
      if(r.ok)return new Response(JSON.stringify({records}),{headers:{'Content-Type':'application/json'}});
      if(![409,422].includes(r.status))throw Error('github-write');
    }
    throw Error('github-conflict');
  }
  function mount(cloud){
    const status=document.getElementById('profile-sync');status.setAttribute('role','button');status.tabIndex=0;status.title='Настроить синхронизацию или перенести отметки';status.style.cursor='pointer';
    const dialog=document.createElement('dialog');dialog.className='sync-dialog';
    dialog.innerHTML='<form method="dialog"><div class="sync-heading"><h2>Синхронизация GitHub</h2><button value="cancel" aria-label="Закрыть">×</button></div><p>Телефон и ПК используют один файл в приватном репозитории. Локальные отметки объединятся, более новые оценки сохранятся.</p><label>Код с другого устройства<textarea id="sync-code" rows="3" placeholder="Вставить код подключения" autocomplete="off"></textarea></label><details><summary>Первое подключение GitHub</summary><p>Нужны приватный репозиторий и fine-grained token с разрешением Contents: Read and write только для него. Токен хранится в этом браузере.</p><label>Репозиторий<input id="sync-repo" placeholder="Damidola/films-data" autocomplete="off"></label><label>Personal access token<input id="sync-token" type="password" autocomplete="off"></label></details><p id="sync-message" role="status"></p><div class="sync-buttons"><button id="sync-connect" type="button">Подключить</button><button id="sync-copy" type="button">Скопировать код</button></div><hr><p>Перенос без облака: сохрани файл и открой его на другом устройстве.</p><div class="sync-buttons"><button id="sync-export" type="button">Сохранить отметки</button><label class="sync-import">Загрузить отметки<input id="sync-import" type="file" accept="application/json" hidden></label></div></form>';
    document.body.append(dialog);const $=id=>dialog.querySelector('#'+id),message=s=>{$('sync-message').textContent=s;};
    const open=()=>{message(config()?'GitHub подключён. Код содержит токен: передавай его только на своё устройство.':'Пока отметки хранятся только в этом браузере.');dialog.showModal();};
    status.onclick=open;status.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
    $('sync-connect').onclick=async()=>{
      const button=$('sync-connect');button.disabled=true;message('Проверяю доступ к приватному репозиторию…');
      try{
        const code=$('sync-code').value.trim();const c=code?decode(code):{repo:$('sync-repo').value.trim().replace(/^https:\/\/github\.com\//,'').replace(/\/$/,''),token:$('sync-token').value.trim()};
        if(!valid(c))throw Error('invalid-config');await verify(c,AbortSignal.timeout(10000));
        localStorage.setItem(key,JSON.stringify(c));location.reload();
      }catch(e){message(e.message==='private-repository-required'?'Нужен приватный репозиторий. Публичный films для личных отметок не подходит.':'Проверь код, имя репозитория и токен. Токену нужен доступ Contents: Read and write.');}finally{button.disabled=false;}
    };
    $('sync-copy').onclick=async()=>{const c=config();if(!c){message('Сначала подключи репозиторий.');return;}const code=encode(c);try{await navigator.clipboard.writeText(code);message('Код скопирован. Вставь на своём втором устройстве. Он содержит токен — не публикуй его.');}catch{$('sync-code').value=code;$('sync-code').focus();$('sync-code').select();message('Скопируй выделенный код. Он содержит токен — не публикуй его.');}};
    $('sync-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,records:cloud.records()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='films-marks.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('sync-import').onchange=async e=>{try{const f=e.target.files[0];if(!f||f.size>1000000)throw Error();const data=JSON.parse(await f.text());let records=data.records;if(!records&&Array.isArray(data.rows))records=data.rows.map(r=>({workId:r.work_id,decision:r.decision,watched:r.watched,good:!!r.good,updatedAt:r.updated_at,addedAt:r.bookmarked_at}));if(!Array.isArray(records)||records.length>2000)throw Error();cloud.merge(records);cloud.onRemote();cloud.changed();message('Отметки объединены. Более новые оценки сохранены.');}catch{message('Не удалось прочитать файл отметок.');}finally{e.target.value='';}};
  }
  root.ProfileSync={config,request,mount};
})(window);
