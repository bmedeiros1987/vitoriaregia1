(() => {
  'use strict';
  let timer=0;
  function currentUser(){try{return JSON.parse(localStorage.getItem('vr_user')||'null')||{};}catch{return {};}}
  function cleanup(){
    ['vr-integrated-menu','vr-presentation-tools','vr-telegram-nudge','vr-telegram-call-native-entry','vr-telegram-call-menu','vr-telegram-call-fallback-entry'].forEach(id=>document.getElementById(id)?.remove());
    document.querySelector('.mobileViewportHint')?.remove();
  }
  function drawer(shell){
    const open=shell.classList.contains('mobile-open');
    document.body.classList.toggle('vr-one-menu-open',open);
    const bottom=shell.querySelector('.bottomNav');
    bottom?.classList.toggle('vr-one-hidden-by-drawer',open);
    bottom?.setAttribute('aria-hidden',String(open));
  }
  function trust(shell){
    const host=shell.querySelector('.topActions');
    if(!host)return;
    let badge=host.querySelector('.vr-one-trust');
    if(!badge){badge=document.createElement('span');badge.className='vr-one-trust';host.insertBefore(badge,host.firstChild);}
    const online=navigator.onLine!==false;
    badge.textContent=online?'Sistema conectado':'Sem conexão';
    badge.classList.toggle('offline',!online);
  }
  function footer(){
    const node=document.querySelector('.appFooter');
    if(!node)return;
    node.classList.add('vr-one-footer');
    node.innerHTML='<span>Vitória Régia One v13</span><span>Ambiente seguro · dados protegidos</span>';
  }
  function sync(){
    const shell=document.querySelector('.appShell');
    if(!shell)return;
    const user=currentUser();
    document.body.classList.add('vr-one-active');
    document.body.dataset.vrOne='13.0.0';
    shell.classList.add('vr-one-shell');
    shell.dataset.role=String(user.role||'morador').toLowerCase();
    cleanup();drawer(shell);trust(shell);footer();
    document.dispatchEvent(new CustomEvent('vitoria-regia-one-sync',{detail:{role:shell.dataset.role}}));
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(sync,40);}
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']});
  ['hashchange','pageshow','online','offline','storage'].forEach(name=>addEventListener(name,schedule));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
