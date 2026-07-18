(() => {
  'use strict';
  const menus={
    morador:new Set(['inicio','portaria','reservas','financeiro','comunicacao','ocorrencias','emergencia','suporte']),
    portaria:new Set(['inicio','portaria','reservas','cadastros','comunicacao','ocorrencias','emergencia','suporte']),
    funcionario:new Set(['inicio','portaria','reservas','comunicacao','ocorrencias','emergencia','suporte']),
    financeiro:new Set(['inicio','financeiro','comunicacao','suporte','configuracoes'])
  };
  const labels={inicio:'Início',portaria:'Portaria',reservas:'Reservas',financeiro:'Financeiro',cadastros:'Cadastros',comunicacao:'Comunicação',ocorrencias:'Ocorrências',emergencia:'Emergência',suporte:'Suporte',configuracoes:'Configurações'};
  const titles={inicio:'Visão geral',portaria:'Portaria e entregas',reservas:'Reservas',financeiro:'Financeiro',cadastros:'Pessoas e acessos',comunicacao:'Comunicados',ocorrencias:'Ocorrências',emergencia:'Emergência',suporte:'Ajuda e suporte',configuracoes:'Configurações'};
  const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  function user(){try{return JSON.parse(localStorage.getItem('vr_user')||'null')||{};}catch{return {};}}
  function role(){return String(user().role||'morador').toLowerCase();}
  function roleName(value){return ({master:'Administrador',admin:'Administrador',sindico:'Síndico',subsindico:'Subsíndico',portaria:'Portaria',funcionario:'Funcionário',financeiro:'Financeiro',morador:'Morador'}[value]||'Usuário');}
  function keyOf(button){
    if(button.dataset.vrOneKey)return button.dataset.vrOneKey;
    const text=clean(button.textContent),found=Object.entries(labels).find(([,label])=>text.includes(clean(label)));
    if(found)button.dataset.vrOneKey=found[0];
    return found?.[0]||'';
  }
  function profile(aside){
    let card=aside.querySelector('.vr-one-profile-card');
    const current=user(),name=String(current.name||'Usuário').trim(),first=name.split(/\s+/)[0]||'Usuário',unit=current.unit?` · Unidade ${current.unit}`:'',signature=`${first}|${role()}|${unit}`;
    if(!card){card=document.createElement('section');card.className='vr-one-profile-card';aside.querySelector('.brand')?.insertAdjacentElement('afterend',card);}
    if(card.dataset.signature===signature)return;
    card.dataset.signature=signature;
    card.innerHTML=`<div class="vr-one-profile-avatar">${first.slice(0,1).toUpperCase()}</div><div class="vr-one-profile-copy"><b>${first}</b><small>${roleName(role())}${unit}</small><span>Sessão protegida</span></div>`;
  }
  function desiredLabel(key){
    if(role()==='morador'&&key==='financeiro')return'Meu financeiro';
    if(role()==='morador'&&key==='portaria')return'Portaria e entregas';
    if(key==='comunicacao')return'Comunicados';
    if(['master','admin','sindico','subsindico'].includes(role())&&key==='cadastros')return'Pessoas e acessos';
    return labels[key]||'';
  }
  function filter(aside){
    const allowed=menus[role()];
    aside.querySelectorAll(':scope>nav>button').forEach(button=>{
      const key=keyOf(button),visible=!allowed||!key||allowed.has(key),hidden=!visible;
      if(button.hidden!==hidden)button.hidden=hidden;
      if(button.getAttribute('aria-hidden')!==String(hidden))button.setAttribute('aria-hidden',String(hidden));
      const label=button.querySelector('span'),next=desiredLabel(key);if(label&&next&&label.textContent!==next)label.textContent=next;
    });
  }
  function help(aside){
    const host=aside.querySelector('.sideBottom');if(!host||document.getElementById('vr-one-telegram-help'))return;
    const button=document.createElement('button');button.id='vr-one-telegram-help';button.type='button';button.innerHTML='<span class="vr-one-plane">➤</span><span>Ajuda pelo Telegram</span>';
    button.addEventListener('click',()=>window.open('https://t.me/vitoriaregia_bot','_blank','noopener'));
    host.insertBefore(button,host.firstChild);
  }
  function heading(shell){
    const active=shell.querySelector('aside nav>button.active'),key=active?keyOf(active):'',h1=shell.querySelector('.topbar h1'),next=titles[key];
    if(h1&&next&&h1.textContent!==next)h1.textContent=next;
  }
  function sync(){const shell=document.querySelector('.appShell'),aside=shell?.querySelector(':scope>aside');if(!shell||!aside)return;profile(aside);filter(aside);help(aside);heading(shell);}
  document.addEventListener('vitoria-regia-one-sync',sync);
  addEventListener('hashchange',()=>setTimeout(sync,30));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
