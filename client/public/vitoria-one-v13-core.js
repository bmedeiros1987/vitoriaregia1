(() => {
  'use strict';
  let timer=0;
  function currentUser(){try{return JSON.parse(localStorage.getItem('vr_user')||'null')||{};}catch{return {};}}
  function brand(){
    if(document.title!=='Vitória Régia One')document.title='Vitória Régia One';
    document.querySelectorAll('.logoVersion').forEach(node=>{if(node.textContent!=='Vitória Régia One v13.1.0')node.textContent='Vitória Régia One v13.1.0';});
  }
  function cleanup(){
    ['vr-integrated-menu','vr-presentation-tools','vr-telegram-nudge','vr-telegram-call-native-entry','vr-telegram-call-menu','vr-telegram-call-fallback-entry'].forEach(id=>document.getElementById(id)?.remove());
    document.querySelector('.mobileViewportHint')?.remove();
  }
  function drawer(shell){
    const open=shell.classList.contains('mobile-open');
    document.body.classList.toggle('vr-one-menu-open',open);
    const bottom=shell.querySelector('.bottomNav');
    bottom?.classList.toggle('vr-one-hidden-by-drawer',open);
    if(bottom&&bottom.getAttribute('aria-hidden')!==String(open))bottom.setAttribute('aria-hidden',String(open));
  }
  function trust(shell){
    const host=shell.querySelector('.topActions');if(!host)return;
    let badge=host.querySelector('.vr-one-trust');
    if(!badge){badge=document.createElement('span');badge.className='vr-one-trust';host.insertBefore(badge,host.firstChild);}
    const online=navigator.onLine!==false,label=online?'Sistema conectado':'Sem conexão';
    if(badge.textContent!==label)badge.textContent=label;
    badge.classList.toggle('offline',!online);
  }
  function footer(){
    const node=document.querySelector('.appFooter');if(!node)return;
    node.classList.add('vr-one-footer');
    if(node.dataset.vrOneFooter==='13.1')return;
    node.dataset.vrOneFooter='13.1';
    node.innerHTML='<span>Vitória Régia One v13.1</span><span>Ambiente seguro · dados protegidos</span>';
  }
  function sync(){
    brand();
    const shell=document.querySelector('.appShell');if(!shell)return;
    const current=currentUser(),nextRole=String(current.role||'morador').toLowerCase();
    document.body.classList.add('vr-one-active');document.body.dataset.vrOne='13.1.0';
    shell.classList.add('vr-one-shell');shell.dataset.role=nextRole;
    cleanup();drawer(shell);trust(shell);footer();
    document.dispatchEvent(new CustomEvent('vitoria-regia-one-sync',{detail:{role:nextRole}}));
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(sync,50);}
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']});
  ['hashchange','pageshow','online','offline','storage'].forEach(name=>addEventListener(name,schedule));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
