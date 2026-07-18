(() => {
  'use strict';
  let enginePromise=null;
  async function ensureEngine(){
    if(window.VitoriaRegiaTelegramCalls?.open)return window.VitoriaRegiaTelegramCalls;
    if(!enginePromise){
      enginePromise=import('/telegram-calls.js?v=20260718a').then(()=>window.VitoriaRegiaTelegramCalls||null).catch(error=>{
        console.error('[telegram-calls] Falha ao carregar central:',error);
        enginePromise=null;
        return null;
      });
    }
    return enginePromise;
  }
  async function openCalls(){
    const api=await ensureEngine();
    if(api?.open)return api.open();
    alert('As preferências de chamada ainda estão carregando. Atualize a página e tente novamente.');
  }
  function boot(){
    ['vr-telegram-call-native-entry','vr-telegram-call-menu','vr-telegram-call-fallback-entry'].forEach(id=>document.getElementById(id)?.remove());
    window.VitoriaRegiaOpenTelegramCalls=openCalls;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
