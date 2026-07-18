(() => {
  'use strict';
  const MODULES={executivo:'Visão executiva',resultados:'Resultados',convites:'Convites QR',manutencao:'Manutenção',livro:'Livro digital',auditoria:'Auditoria',governanca:'Governança',servicos:'Serviços',financeiro:'Conselho e PIX',demonstracao:'Demonstração',comercial:'Planos e proposta'};
  const ROLE_TABS={master:Object.keys(MODULES),admin:Object.keys(MODULES),sindico:Object.keys(MODULES),subsindico:['executivo','resultados','convites','manutencao','livro','auditoria','governanca','servicos','financeiro','demonstracao'],portaria:['executivo','convites','manutencao','livro'],financeiro:['executivo','resultados','financeiro'],funcionario:['executivo','manutencao','livro','servicos'],morador:['convites','servicos']};
  let activeTab='';
  const currentUser=()=>{try{return JSON.parse(localStorage.getItem('vr_user')||'null')||{};}catch{return {};}};
  const role=()=>String(currentUser().role||'morador').toLowerCase();
  const allowed=()=>ROLE_TABS[role()]||ROLE_TABS.morador;
  const initial=()=>allowed().includes('executivo')?'executivo':allowed()[0]||'convites';
  function removeLegacyMenu(){
    document.getElementById('vr-integrated-menu')?.remove();
    const launcher=document.getElementById('vr-premium-suite-launcher');
    if(launcher){launcher.hidden=true;launcher.setAttribute('aria-hidden','true');}
  }
  function decorate(){
    const root=document.getElementById('vr-premium-suite-root');
    if(!root)return;
    root.classList.add('vr-integrated-root');
    root.setAttribute('aria-label','Recursos administrativos do Vitória Régia');
    root.querySelectorAll('[data-suite-tab]').forEach(button=>button.hidden=!allowed().includes(button.dataset.suiteTab));
    const title=root.querySelector('.vr-suite-header h2');if(title)title.textContent='Vitória Régia';
    const subtitle=root.querySelector('.vr-suite-header small');if(subtitle)subtitle.textContent='Recursos administrativos e operacionais.';
  }
  function open(tab=initial()){
    const target=allowed().includes(tab)?tab:initial();
    const api=window.VitoriaRegiaPremiumSuite;
    if(!api?.open){setTimeout(()=>open(target),120);return;}
    activeTab=target;api.open(target);decorate();
  }
  function close(){activeTab='';window.VitoriaRegiaPremiumSuite?.close?.();}
  function sync(){removeLegacyMenu();decorate();}
  const observer=new MutationObserver(()=>setTimeout(sync,30));
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
  function boot(){sync();window.VitoriaRegiaGestao={open,close,modules:MODULES};document.dispatchEvent(new CustomEvent('vitoria-regia-gestao-ready'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
