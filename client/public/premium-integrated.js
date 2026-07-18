(() => {
  'use strict';
  const MODULES={executivo:'Visão executiva',resultados:'Resultados',convites:'Convites QR',manutencao:'Manutenção',livro:'Livro digital',auditoria:'Auditoria',governanca:'Governança',servicos:'Serviços',financeiro:'Conselho e PIX',demonstracao:'Demonstração',comercial:'Planos e proposta'};
  const ROLE_TABS={master:Object.keys(MODULES),admin:Object.keys(MODULES),sindico:Object.keys(MODULES),subsindico:['executivo','resultados','convites','manutencao','livro','auditoria','governanca','servicos','financeiro','demonstracao'],portaria:['executivo','convites','manutencao','livro'],financeiro:['executivo','resultados','financeiro'],funcionario:['executivo','manutencao','livro','servicos'],morador:['convites','servicos']};
  let activeTab='',timer=0;
  const currentUser=()=>{try{return JSON.parse(localStorage.getItem('vr_user')||'null')||{};}catch{return {};}};
  const role=()=>String(currentUser().role||'morador').toLowerCase();
  const allowed=()=>ROLE_TABS[role()]||ROLE_TABS.morador;
  const initial=()=>allowed().includes('executivo')?'executivo':allowed()[0]||'convites';
  function removeLegacyMenu(){
    document.getElementById('vr-integrated-menu')?.remove();
    const launcher=document.getElementById('vr-premium-suite-launcher');
    if(launcher){if(!launcher.hidden)launcher.hidden=true;if(launcher.getAttribute('aria-hidden')!=='true')launcher.setAttribute('aria-hidden','true');}
  }
  function decorate(){
    const root=document.getElementById('vr-premium-suite-root');if(!root)return;
    root.classList.add('vr-integrated-root');
    if(root.getAttribute('aria-label')!=='Recursos administrativos do Vitória Régia')root.setAttribute('aria-label','Recursos administrativos do Vitória Régia');
    const visible=allowed();
    root.querySelectorAll('[data-suite-tab]').forEach(button=>{const hidden=!visible.includes(button.dataset.suiteTab);if(button.hidden!==hidden)button.hidden=hidden;});
    const title=root.querySelector('.vr-suite-header h2');if(title&&title.textContent!=='Vitória Régia')title.textContent='Vitória Régia';
    const subtitle=root.querySelector('.vr-suite-header small');if(subtitle&&subtitle.textContent!=='Recursos administrativos e operacionais.')subtitle.textContent='Recursos administrativos e operacionais.';
  }
  function open(tab=initial()){
    const target=allowed().includes(tab)?tab:initial(),api=window.VitoriaRegiaPremiumSuite;
    if(!api?.open){setTimeout(()=>open(target),120);return;}
    activeTab=target;api.open(target);decorate();
  }
  function close(){activeTab='';window.VitoriaRegiaPremiumSuite?.close?.();}
  function sync(){removeLegacyMenu();decorate();}
  function schedule(){clearTimeout(timer);timer=setTimeout(sync,45);}
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
  function boot(){sync();window.VitoriaRegiaGestao={open,close,modules:MODULES};document.dispatchEvent(new CustomEvent('vitoria-regia-gestao-ready'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
