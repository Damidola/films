(function(root){
  'use strict';
  const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  async function restore(cloud){
    const params=new URLSearchParams(location.hash.slice(1)),secret=params.get('restore');
    if(!secret)return;
    history.replaceState(history.state,'',location.pathname+location.search);
    try{
      const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);
      const response=await fetch('recovery/marks-2026-10-30.json',{cache:'no-cache'});
      if(!response.ok)throw Error('recovery-unavailable');
      const envelope=await response.json();
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv)},key,bytes(envelope.data));
      const data=JSON.parse(new TextDecoder().decode(plaintext));
      if(!Array.isArray(data.records))throw Error('invalid-recovery');
      cloud.merge(data.records);
      localStorage.setItem('dc-profile-restored-2026-10-30','true');
    }catch{
      alert('Не удалось восстановить списки. Открой ссылку восстановления ещё раз. Текущие отметки не удалены.');
    }
  }
  root.ProfileRecovery={restore};
})(window);
