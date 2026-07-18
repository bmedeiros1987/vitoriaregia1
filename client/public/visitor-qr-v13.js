(() => {
  'use strict';
  const ROOT_ID='vr-visitor-qr-one';
  const MODAL_ID='vr-visitor-qr-modal';
  const state={dates:new Set(),mode:'single',rule:'weekdays',visitors:[],stream:null,scanTimer:0,currentPass:null};
  const weekdays=[['1','Segunda'],['2','Terça'],['3','Quarta'],['4','Quinta'],['5','Sexta'],['6','Sábado'],['0','Domingo']];
  const today=()=>new Date().toISOString().slice(0,10);
  function user(){try{return JSON.parse(localStorage.getItem('vr_user')||'null')||{};}catch{return {};}}
  function token(){return localStorage.getItem('vr_token')||'';}
  function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function arr(v){if(Array.isArray(v))return v;try{return JSON.parse(v||'[]');}catch{return [];}}
  function role(){return String(user().role||'morador').toLowerCase();}
  function canValidate(){return ['master','admin','sindico','subsindico','portaria'].includes(role());}
  async function api(path,options={}){
    const response=await fetch(path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token()}`,...(options.headers||{})}});
    const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{body={error:text};}
    if(!response.ok)throw new Error(body.error||body.message||`Erro ${response.status}`);return body;
  }
  function toast(message,tone='ok'){
    let n=document.getElementById('vr-visitor-toast');if(!n){n=document.createElement('div');n.id='vr-visitor-toast';document.body.appendChild(n);}n.className=`vr-visitor-toast ${tone}`;n.textContent=message;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>n.hidden=true,4200);
  }
  function findLegacyForm(){return [...document.querySelectorAll('form.formGrid')].find(f=>/Visitante recorrente/i.test(f.textContent||''))||null;}
  function isVisitorPage(){return /portaria\/visitantes|visitantes/i.test(location.hash)||Boolean(findLegacyForm());}
  function rootMarkup(){
    const u=user(),unit=u.unit||'';
    return `<section id="${ROOT_ID}" class="vr-invite-shell">
      <header class="vr-invite-hero"><div><span>CONVITE DIGITAL</span><h3>Autorizar visitante com QR Code</h3><p>Crie uma entrada avulsa ou recorrente e envie o convite pelo Telegram ou WhatsApp.</p></div><div class="vr-invite-shield">✓</div></header>
      <div class="vr-invite-tabs"><button type="button" class="active" data-vr-mode="single">Uma visita</button><button type="button" data-vr-mode="recurring">Visitante recorrente</button>${canValidate()?'<button type="button" data-vr-open-scanner>Ler QR na portaria</button>':''}</div>
      <form class="vr-invite-form" data-vr-invite-form>
        <div class="vr-invite-step"><b>1</b><span><strong>Quem vai entrar?</strong><small>Informe somente os dados necessários para identificação.</small></span></div>
        <div class="vr-invite-grid"><label>Nome do visitante *<input name="name" required autocomplete="name" placeholder="Nome completo"></label><label>Unidade *<input name="unit" required value="${esc(unit)}" ${role()==='morador'?'readonly':''} placeholder="Ex.: 602"></label><label>Documento<input name="document" placeholder="RG ou CPF (opcional)"></label><label>Telefone<input name="phone" inputmode="tel" placeholder="DDD + número"></label><label>Placa do veículo<input name="plate" placeholder="ABC1D23"></label><label>Morador responsável<input name="authorized_by" value="${esc(u.name||'')}" ${role()==='morador'?'readonly':''}></label></div>
        <div class="vr-invite-step"><b>2</b><span><strong>Quando a entrada será permitida?</strong><small>O QR deixa de funcionar automaticamente fora das regras.</small></span></div>
        <div data-vr-single-fields class="vr-invite-grid"><label>Data da visita *<input name="visit_date" type="date" value="${today()}"></label></div>
        <div data-vr-recurring-fields hidden>
          <div class="vr-rule-tabs"><button type="button" class="active" data-vr-rule="weekdays">Dias da semana</button><button type="button" data-vr-rule="dates">Datas específicas</button></div>
          <div class="vr-invite-grid"><label>Início *<input name="valid_from" type="date" value="${today()}"></label><label>Fim *<input name="valid_until" type="date"></label></div>
          <div data-vr-weekdays class="vr-weekdays">${weekdays.map(([v,l])=>`<label><input type="checkbox" value="${v}"><span>${l}</span></label>`).join('')}</div>
          <div data-vr-specific-dates hidden><div class="vr-date-add"><input type="date" data-vr-date-input><button type="button" data-vr-add-date>Adicionar data</button></div><div class="vr-date-chips" data-vr-date-chips><small>Nenhuma data adicionada.</small></div></div>
        </div>
        <div class="vr-invite-grid"><label>Entrada a partir de<input name="access_start_time" type="time" value="00:00"></label><label>Entrada até<input name="access_end_time" type="time" value="23:59"></label><label>Limite de entradas<input name="max_entries" type="number" min="0" value="0"><small>Zero significa sem limite dentro da validade.</small></label><label class="vr-check"><input name="announce_required" type="checkbox" checked><span>Portaria deve anunciar a chegada</span></label><label class="full">Observações<textarea name="notes" placeholder="Ex.: prestador de serviço, familiar, cuidador..."></textarea></label></div>
        <div class="vr-invite-actions"><button type="submit" class="primary">Gerar QR Code</button><button type="button" data-vr-toggle-manual>Cadastro manual</button></div>
      </form>
      <section class="vr-invite-list"><header><div><b>Convites recentes</b><small>Exiba, compartilhe, regenere ou revogue o QR.</small></div><button type="button" data-vr-refresh>Atualizar</button></header><div data-vr-invite-list><div class="vr-invite-empty">Carregando convites…</div></div></section>
    </section>`;
  }
  function mount(){
    if(!token()||!isVisitorPage())return;
    const legacy=findLegacyForm();if(!legacy)return;
    let root=document.getElementById(ROOT_ID);if(!root){root=document.createElement('div');root.innerHTML=rootMarkup();root=root.firstElementChild;legacy.parentElement.insertBefore(root,legacy);legacy.classList.add('vr-legacy-visitor-form');legacy.hidden=true;bind(root);refresh();}
  }
  function bind(root){
    root.addEventListener('click',async e=>{
      const mode=e.target.closest('[data-vr-mode]');if(mode){state.mode=mode.dataset.vrMode;root.querySelectorAll('[data-vr-mode]').forEach(b=>b.classList.toggle('active',b===mode));root.querySelector('[data-vr-single-fields]').hidden=state.mode!=='single';root.querySelector('[data-vr-recurring-fields]').hidden=state.mode!=='recurring';return;}
      const rule=e.target.closest('[data-vr-rule]');if(rule){state.rule=rule.dataset.vrRule;root.querySelectorAll('[data-vr-rule]').forEach(b=>b.classList.toggle('active',b===rule));root.querySelector('[data-vr-weekdays]').hidden=state.rule!=='weekdays';root.querySelector('[data-vr-specific-dates]').hidden=state.rule!=='dates';return;}
      if(e.target.closest('[data-vr-add-date]')){const input=root.querySelector('[data-vr-date-input]');if(input.value){state.dates.add(input.value);input.value='';renderDates(root);}return;}
      const remove=e.target.closest('[data-vr-remove-date]');if(remove){state.dates.delete(remove.dataset.vrRemoveDate);renderDates(root);return;}
      if(e.target.closest('[data-vr-toggle-manual]')){const legacy=findLegacyForm();legacy.hidden=!legacy.hidden;e.target.closest('button').textContent=legacy.hidden?'Cadastro manual':'Ocultar cadastro manual';return;}
      if(e.target.closest('[data-vr-refresh]'))return refresh();
      if(e.target.closest('[data-vr-open-scanner]'))return openScanner();
      const pass=e.target.closest('[data-vr-pass]');if(pass)return showPass(pass.dataset.vrPass);
      const revoke=e.target.closest('[data-vr-revoke]');if(revoke&&confirm('Revogar este QR Code?')){await api(`/api/visitor-invites/${revoke.dataset.vrRevoke}/revoke`,{method:'POST',body:'{}'});toast('Convite revogado.');refresh();return;}
      const regen=e.target.closest('[data-vr-regenerate]');if(regen&&confirm('Gerar um novo QR? O anterior deixará de funcionar.')){const result=await api(`/api/visitor-invites/${regen.dataset.vrRegenerate}/regenerate`,{method:'POST',body:'{}'});openPass(result);refresh();return;}
    });
    root.querySelector('[data-vr-invite-form]').addEventListener('submit',submitInvite);
  }
  function renderDates(root){const host=root.querySelector('[data-vr-date-chips]');host.innerHTML=state.dates.size?[...state.dates].sort().map(d=>`<button type="button" data-vr-remove-date="${d}">${new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')} ×</button>`).join(''):'<small>Nenhuma data adicionada.</small>';}
  async function submitInvite(e){
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form),button=form.querySelector('[type="submit"]');
    const body=Object.fromEntries(fd.entries());body.recurring=state.mode==='recurring';body.weekdays=state.mode==='recurring'&&state.rule==='weekdays'?[...form.querySelectorAll('[data-vr-weekdays] input:checked')].map(i=>i.value):[];body.access_dates=state.mode==='recurring'&&state.rule==='dates'?[...state.dates]:[];body.announce_required=form.elements.announce_required.checked;
    if(body.recurring&&state.rule==='weekdays'&&!body.weekdays.length)return toast('Selecione ao menos um dia da semana.','error');
    if(body.recurring&&state.rule==='dates'&&!body.access_dates.length)return toast('Adicione ao menos uma data de entrada.','error');
    button.disabled=true;button.textContent='Gerando convite…';
    try{const result=await api('/api/visitor-invites',{method:'POST',body:JSON.stringify(body)});openPass(result);form.reset();form.elements.visit_date.value=today();form.elements.unit.value=user().unit||'';form.elements.authorized_by.value=user().name||'';state.dates.clear();renderDates(document.getElementById(ROOT_ID));toast('QR Code gerado com segurança.');refresh();}
    catch(error){toast(error.message,'error');}finally{button.disabled=false;button.textContent='Gerar QR Code';}
  }
  function period(v){const dates=arr(v.access_dates);if(dates.length)return `${dates.length} data(s) específica(s)`;if(v.recurring)return `${String(v.valid_from||'').slice(0,10)} até ${String(v.valid_until||'').slice(0,10)}`;return String(v.valid_from||'').slice(0,10)||'Data não informada';}
  async function refresh(){
    const host=document.querySelector('[data-vr-invite-list]');if(!host)return;
    try{let rows=await api('/api/visitors');if(role()==='morador')rows=rows.filter(v=>String(v.unit||'').replace(/\s/g,'').toUpperCase()===String(user().unit||'').replace(/\s/g,'').toUpperCase());state.visitors=rows.slice(0,20);host.innerHTML=state.visitors.length?state.visitors.map(v=>`<article class="vr-invite-row ${v.qr_enabled===false||v.qr_revoked_at?'revoked':''}"><div class="vr-invite-avatar">${esc(v.name||'?').slice(0,1).toUpperCase()}</div><div><b>${esc(v.name)}</b><small>Unidade ${esc(v.unit)} · ${esc(period(v))}</small><span>${v.recurring?'Recorrente':'Visita única'} · ${esc(v.access_start_time||'00:00')}–${esc(v.access_end_time||'23:59')}</span></div><div class="vr-row-actions"><button type="button" data-vr-pass="${v.id}">Exibir QR</button><button type="button" data-vr-regenerate="${v.id}">Novo QR</button><button type="button" class="danger" data-vr-revoke="${v.id}">Revogar</button></div></article>`).join(''):'<div class="vr-invite-empty">Nenhum convite cadastrado.</div>';}
    catch(error){host.innerHTML=`<div class="vr-invite-empty error">${esc(error.message)}</div>`;}
  }
  async function showPass(id){try{openPass(await api(`/api/visitor-invites/${id}/pass`));}catch(error){toast(error.message,'error');}}
  function ensureModal(){let modal=document.getElementById(MODAL_ID);if(modal)return modal;modal=document.createElement('div');modal.id=MODAL_ID;modal.hidden=true;document.body.appendChild(modal);modal.addEventListener('click',handleModal);return modal;}
  function openPass(result){state.currentPass=result;const modal=ensureModal(),v=result.visitor,invite=result.invite,validation=result.validation;modal.className='vr-visitor-modal';modal.hidden=false;modal.innerHTML=`<div class="vr-modal-backdrop" data-vr-close></div><section class="vr-pass-card" role="dialog" aria-modal="true"><button class="vr-modal-close" data-vr-close>×</button><header><span>CONVITE VITÓRIA RÉGIA</span><h2>${esc(v.name)}</h2><p>Apresente este QR Code na portaria.</p></header><div class="vr-qr-frame">${invite.qr_svg}</div><div class="vr-pass-data"><span><small>Unidade</small><b>${esc(v.unit)}</b></span><span><small>Validade</small><b>${esc(period(v))}</b></span><span><small>Horário</small><b>${esc(v.access_start_time||'00:00')}–${esc(v.access_end_time||'23:59')}</b></span><span><small>Status atual</small><b class="${validation&&!validation.valid?'bad':'ok'}">${validation&&!validation.valid?'Fora da validade':'Autorizado'}</b></span></div><div class="vr-pass-actions"><button data-vr-share>Compartilhar</button><button data-vr-telegram>Enviar pelo Telegram</button><button data-vr-copy>Copiar link</button><button data-vr-download>Baixar QR</button></div><small class="vr-pass-security">Código assinado. Dados pessoais não ficam visíveis dentro do QR.</small></section>`;document.body.classList.add('vr-modal-open');}
  function closeModal(){const m=ensureModal();m.hidden=true;m.innerHTML='';document.body.classList.remove('vr-modal-open');stopCamera();}
  async function handleModal(e){
    if(e.target.closest('[data-vr-close]'))return closeModal();
    const p=state.currentPass;if(!p?.invite)return;
    if(e.target.closest('[data-vr-copy]')){await navigator.clipboard.writeText(p.invite.url);return toast('Link copiado.');}
    if(e.target.closest('[data-vr-telegram]'))return window.open(`https://t.me/share/url?url=${encodeURIComponent(p.invite.url)}&text=${encodeURIComponent(`Convite de acesso para ${p.visitor.name} — unidade ${p.visitor.unit}`)}`,'_blank','noopener');
    if(e.target.closest('[data-vr-share]')){try{if(navigator.share)await navigator.share({title:'Convite Vitória Régia',text:`Convite de acesso para ${p.visitor.name}`,url:p.invite.url});else await navigator.clipboard.writeText(p.invite.url);}catch{}return;}
    if(e.target.closest('[data-vr-download]')){const blob=new Blob([p.invite.qr_svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`convite-${String(p.visitor.name).replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
    if(e.target.closest('[data-vr-confirm-entry]'))return verifyValue(e.target.closest('[data-vr-confirm-entry]').dataset.vrConfirmEntry,true);
  }
  function openScanner(){const modal=ensureModal();state.currentPass=null;modal.className='vr-visitor-modal';modal.hidden=false;modal.innerHTML=`<div class="vr-modal-backdrop" data-vr-close></div><section class="vr-scanner-card"><button class="vr-modal-close" data-vr-close>×</button><header><span>PORTARIA</span><h2>Ler convite do visitante</h2><p>Aponte a câmera para o QR Code apresentado.</p></header><div class="vr-scanner-stage"><video data-vr-video playsinline muted autoplay></video><div class="vr-scan-guide"></div></div><div class="vr-scanner-actions"><button type="button" data-vr-start-camera>Abrir câmera</button><label>Escolher imagem<input type="file" accept="image/*" data-vr-scan-file></label></div><label class="vr-manual-token">Ou cole o conteúdo do QR<input data-vr-token-input><button type="button" data-vr-verify-manual>Validar</button></label><div data-vr-scan-result></div></section>`;document.body.classList.add('vr-modal-open');modal.querySelector('[data-vr-start-camera]').onclick=startCamera;modal.querySelector('[data-vr-verify-manual]').onclick=()=>verifyValue(modal.querySelector('[data-vr-token-input]').value,false);modal.querySelector('[data-vr-scan-file]').onchange=e=>scanFile(e.target.files?.[0]);}
  async function startCamera(){
    if(!('BarcodeDetector'in window))return toast('Este aparelho não possui leitura automática. Use uma imagem ou cole o código.','error');
    try{state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=ensureModal().querySelector('[data-vr-video]');video.srcObject=state.stream;await video.play();const detector=new BarcodeDetector({formats:['qr_code']});state.scanTimer=setInterval(async()=>{try{const codes=await detector.detect(video);if(codes[0]?.rawValue){stopCamera();await verifyValue(codes[0].rawValue,false);}}catch{}},650);}catch(error){toast('Não foi possível abrir a câmera. Verifique a permissão.','error');}
  }
  function stopCamera(){clearInterval(state.scanTimer);state.scanTimer=0;try{state.stream?.getTracks().forEach(t=>t.stop());}catch{}state.stream=null;}
  async function scanFile(file){if(!file)return;if(!('BarcodeDetector'in window)||!window.createImageBitmap)return toast('Leitura de imagem indisponível neste aparelho.','error');try{const bmp=await createImageBitmap(file),codes=await new BarcodeDetector({formats:['qr_code']}).detect(bmp);bmp.close?.();if(!codes[0]?.rawValue)throw new Error('Nenhum QR Code encontrado.');await verifyValue(codes[0].rawValue,false);}catch(error){toast(error.message,'error');}}
  async function verifyValue(value,confirmEntry){
    const host=ensureModal().querySelector('[data-vr-scan-result]');if(host)host.innerHTML='<div class="vr-checking">Verificando convite…</div>';
    try{const r=await api('/api/visitor-invites/verify',{method:'POST',body:JSON.stringify({token:value,confirm_entry:confirmEntry})});if(host)host.innerHTML=`<article class="vr-validation ${r.valid?'valid':'invalid'}"><b>${r.valid?'Entrada autorizada':'Entrada não autorizada'}</b><h3>${esc(r.visitor.name)}</h3><p>Unidade ${esc(r.visitor.unit)} · ${esc(r.validation.local_date)} às ${esc(r.validation.local_time)}</p>${r.validation.reasons?.length?`<ul>${r.validation.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${r.valid&&!confirmEntry?`<button type="button" data-vr-confirm-entry="${esc(value)}">Confirmar entrada</button>`:''}${r.entry_confirmed?'<strong>Entrada registrada com sucesso.</strong>':''}</article>`;if(r.entry_confirmed)toast('Entrada registrada.');}
    catch(error){if(host)host.innerHTML=`<article class="vr-validation invalid"><b>QR inválido</b><p>${esc(error.message)}</p></article>`;}
  }
  function checkDeepLink(){const value=new URLSearchParams(location.search).get('visitor_invite');if(!value||!token()||!canValidate())return;location.hash='#/portaria/visitantes';setTimeout(()=>{openScanner();const input=ensureModal().querySelector('[data-vr-token-input]');if(input)input.value=value;verifyValue(value,false);history.replaceState({},'',location.pathname+location.hash);},700);}
  let timer=0;const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(mount,80);});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-current']});
  addEventListener('hashchange',()=>setTimeout(mount,80));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();checkDeepLink();},{once:true});else{mount();checkDeepLink();}
})();