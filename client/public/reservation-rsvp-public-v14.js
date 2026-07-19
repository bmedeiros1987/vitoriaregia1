(() => {
  'use strict';
  const state={token:'',data:null};
  const qs=(selector,root=document)=>root.querySelector(selector);
  const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dateBr=value=>value?new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';

  async function api(path,options={}){
    const response=await fetch(path,options);
    const text=await response.text();
    let body={}; try{body=text?JSON.parse(text):{};}catch{body={raw:text};}
    if(!response.ok)throw new Error(body.error||body.message||`Erro ${response.status}`);
    return body;
  }
  function toast(message,tone='ok'){
    let node=qs('#vr-rsvp-toast');
    if(!node){node=document.createElement('div');node.id='vr-rsvp-toast';document.body.appendChild(node);}
    node.className=`vr-rsvp-toast ${tone}`;node.textContent=message;node.hidden=false;
    clearTimeout(node._timer);node._timer=setTimeout(()=>{node.hidden=true;},4200);
  }
  function root(){let node=qs('#vr-rsvp-public');if(!node){node=document.createElement('div');node.id='vr-rsvp-public';document.body.appendChild(node);}return node;}
  function companions(form){return qsa('[data-rsvp-companion]',form).map(row=>({name:qs('[name="companion_name"]',row)?.value.trim()||'',email:qs('[name="companion_email"]',row)?.value.trim()||'',phone:qs('[name="companion_phone"]',row)?.value.trim()||'',age_group:qs('[name="companion_age"]',row)?.value||'adulto',counts_as_guest:qs('[name="companion_counts"]',row)?.checked!==false})).filter(item=>item.name);}
  function companionRow(){return `<div class="vr-rsvp-companion" data-rsvp-companion><label>Nome do agregado<input name="companion_name" required placeholder="Nome completo"></label><label>Faixa<select name="companion_age"><option value="adulto">Adulto</option><option value="crianca">Criança</option><option value="bebe">Bebê</option></select></label><label>E-mail opcional<input type="email" name="companion_email" placeholder="email@exemplo.com"></label><label>WhatsApp opcional<input inputmode="tel" name="companion_phone" placeholder="(61) 99999-9999"></label><label class="vr-check"><input type="checkbox" name="companion_counts" checked> Conta no limite do evento</label><button type="button" class="vr-icon-danger" data-remove-companion aria-label="Remover agregado">×</button></div>`;}

  function contactForm(data){
    const invitation=data?.invitation||{};const campaign=data?.campaign||{};
    const allow=campaign.allow_companions??invitation.allow_companions??true;const max=Number(campaign.max_companions??invitation.max_companions??3);
    return `<form class="vr-rsvp-form" data-rsvp-form><div class="vr-rsvp-grid"><label>Nome completo *<input name="name" required value="${esc(invitation.name||'')}" ${data.type==='invite'?'readonly':''}></label><label>E-mail<input type="email" name="email" value="${esc(invitation.email||'')}" ${invitation.email?'readonly':''} placeholder="Para receber código e QR"></label><label>WhatsApp<input inputmode="tel" name="whatsapp_phone" value="${esc(invitation.whatsapp_phone||invitation.phone||'')}" ${(invitation.whatsapp_phone||invitation.phone)?'readonly':''} placeholder="Para receber código e QR"></label><label>Telegram<input name="telegram_username" value="${esc(invitation.telegram_username||'')}" placeholder="@usuario (se já vinculado ao bot)"></label><label>Documento<input name="document" value="${esc(invitation.document||'')}" placeholder="CPF ou RG, opcional"></label><label>Receber código por<select name="verification_channel"><option value="">Escolher automaticamente</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select></label></div>${allow&&max>0?`<section class="vr-rsvp-companions"><header><div><b>Agregados</b><small>Cadastre somente quem está autorizado a acompanhar você.</small></div><button type="button" data-add-companion data-max="${max}">+ Adicionar</button></header><div data-companion-list></div></section>`:''}<label class="vr-check vr-rsvp-consent"><input type="checkbox" required> Confirmo que os dados são verdadeiros e autorizo o uso somente para controle de acesso ao evento.</label><div class="vr-rsvp-actions"><button type="submit" class="primary">${data.type==='invite'?'Confirmar presença':'Solicitar confirmação'}</button>${data.type==='invite'?'<button type="button" class="secondary" data-decline>Não poderei comparecer</button>':''}</div></form>`;
  }
  function qrView(data){const passes=data?.invitation?.passes||[];return `<section class="vr-rsvp-success"><span class="vr-rsvp-success-icon">✓</span><h2>Presença confirmada</h2><p>Seus QR Codes individuais estão prontos. Não encaminhe para outras pessoas.</p><div class="vr-rsvp-passes">${passes.map(pass=>`<article><h3>${esc(pass.name)}</h3><div class="vr-rsvp-qr">${pass.qr_svg||''}</div><button type="button" data-copy="${esc(pass.url)}">Copiar link do QR</button></article>`).join('')}</div></section>`;}
  function waitingView(status){const approval=status==='aguardando_aprovacao';return `<section class="vr-rsvp-waiting"><span>${approval?'⏳':'✉️'}</span><h2>${approval?'Confirmação enviada para aprovação':'Confira o código recebido'}</h2><p>${approval?'O responsável pelo evento poderá aprovar ou rejeitar sua presença. O QR Code será enviado após a aprovação.':'Digite o código de seis números enviado ao seu e-mail ou WhatsApp.'}</p>${approval?'':`<form data-rsvp-verify><input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required><button>Confirmar código</button></form><button type="button" class="text" data-resend-code>Reenviar código</button>`}</section>`;}
  function inviteOnlyView(){return `<section class="vr-rsvp-waiting"><span>🔒</span><h2>Este evento usa convites individuais</h2><p>Peça ao responsável pelo evento o seu link pessoal. Cada link pode ser revogado e não deve ser compartilhado.</p></section>`;}

  function render(data){
    state.data=data;const event=data.event||data.invitation?.event||{};const status=data.invitation?.status||data.status||'';
    root().innerHTML=`<main class="vr-rsvp-public-shell"><header class="vr-rsvp-public-head"><div class="vr-rsvp-lotus">VR</div><div><small>CONVITE SEGURO · VITÓRIA RÉGIA</small><h1>${esc(event.area||'Evento')}</h1><p>${dateBr(event.date)} · ${esc(event.start_time||'')} às ${esc(event.end_time||'')} · Responsável: ${esc(event.host||'')}</p></div></header><section class="vr-rsvp-security"><b>Link protegido e individual</b><span>Não exige login. O QR só é liberado após verificação e, quando configurado, aprovação do responsável.</span></section><section class="vr-rsvp-public-card" data-rsvp-content>${data.type==='campaign'&&data.campaign?.mode==='invite_only'?inviteOnlyView():status==='confirmado'?qrView(data):status==='aguardando_aprovacao'?waitingView(status):contactForm(data)}</section><footer>Dados usados somente para confirmação e controle de acesso ao evento.</footer></main>`;
  }
  async function load(){const value=new URLSearchParams(location.search).get('rsvp');if(!value)return false;state.token=value;document.body.classList.add('vr-rsvp-public-mode');root().innerHTML='<div class="vr-rsvp-loading"><span></span><b>Abrindo convite seguro…</b></div>';try{render(await api(`/api/public/rsvp/${encodeURIComponent(value)}`));}catch(error){root().innerHTML=`<div class="vr-rsvp-error"><b>Não foi possível abrir o convite</b><p>${esc(error.message)}</p></div>`;}return true;}

  document.addEventListener('click',async event=>{
    const host=qs('#vr-rsvp-public');if(!host||!host.contains(event.target))return;
    const add=event.target.closest('[data-add-companion]');if(add){const list=qs('[data-companion-list]',host);const max=Number(add.dataset.max||0);if(qsa('[data-rsvp-companion]',list).length>=max)return toast(`Limite de ${max} agregado(s).`,'warn');list.insertAdjacentHTML('beforeend',companionRow());return;}
    if(event.target.closest('[data-remove-companion]')){event.target.closest('[data-rsvp-companion]')?.remove();return;}
    const copy=event.target.closest('[data-copy]');if(copy){try{await navigator.clipboard.writeText(copy.dataset.copy);toast('Link copiado.');}catch{toast('Não foi possível copiar.','error');}return;}
    if(event.target.closest('[data-decline]')){try{const result=await api(`/api/public/rsvp/${encodeURIComponent(state.token)}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({response:'declinar'})});qs('[data-rsvp-content]',host).innerHTML=waitingView(result.status);toast('Resposta registrada.');}catch(error){toast(error.message,'error');}return;}
    if(event.target.closest('[data-resend-code]')){try{await api(`/api/public/rsvp/${encodeURIComponent(state.token)}/resend-code`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});toast('Novo código enviado.');}catch(error){toast(error.message,'error');}}
  });
  document.addEventListener('submit',async event=>{
    if(event.target.matches('[data-rsvp-form]')){event.preventDefault();const form=event.target;const body=Object.fromEntries(new FormData(form).entries());body.companions=companions(form);body.response='confirmar';const endpoint=state.data?.type==='campaign'?'register':'respond';const button=qs('button[type="submit"]',form);button.disabled=true;button.textContent='Enviando…';try{const result=await api(`/api/public/rsvp/${encodeURIComponent(state.token)}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(result.invite_token){state.token=result.invite_token;const url=new URL(location.href);url.searchParams.set('rsvp',result.invite_token);history.replaceState(null,'',url);}if(result.status==='confirmado')render({type:'invite',invitation:result.invitation});else qs('[data-rsvp-content]',root()).innerHTML=waitingView(result.status);}catch(error){toast(error.message,'error');button.disabled=false;button.textContent=state.data?.type==='campaign'?'Solicitar confirmação':'Confirmar presença';}return;}
    if(event.target.matches('[data-rsvp-verify]')){event.preventDefault();const code=new FormData(event.target).get('code');const button=qs('button',event.target);button.disabled=true;try{const result=await api(`/api/public/rsvp/${encodeURIComponent(state.token)}/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});if(result.status==='confirmado')render({type:'invite',invitation:result.invitation});else qs('[data-rsvp-content]',root()).innerHTML=waitingView(result.status);}catch(error){toast(error.message,'error');button.disabled=false;}}
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else void load();
})();
