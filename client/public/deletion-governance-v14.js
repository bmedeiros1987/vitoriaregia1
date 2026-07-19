(() => {
  'use strict';

  const allowedRoles=new Set(['master','admin','sindico','subsindico']);
  const types={
    users:{label:'Usuários',singular:'usuário',icon:'👤'},
    residents:{label:'Moradores',singular:'morador',icon:'🏠'},
    packages:{label:'Encomendas',singular:'encomenda',icon:'📦'},
    reservations:{label:'Reservas',singular:'reserva',icon:'📅'}
  };
  const state={type:'users',items:[],query:'',loading:false,changed:false,overlay:null};

  function user(){
    try{return JSON.parse(localStorage.getItem('vr_user')||'null')||null;}catch{return null;}
  }
  function token(){return localStorage.getItem('vr_token')||'';}
  function role(){return String(user()?.role||'').toLowerCase();}
  function escapeHtml(value=''){
    return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }
  function normalize(value=''){
    return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  }
  async function api(path,options={}){
    const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{}),...(token()?{Authorization:`Bearer ${token()}`}:{})}});
    const body=await response.json().catch(()=>({error:'Resposta inválida do servidor.'}));
    if(!response.ok) throw new Error(body.error||`Falha ${response.status}`);
    return body;
  }
  function display(item){
    if(state.type==='users') return {title:item.name||item.email||`Usuário ${item.id}`,subtitle:`${item.email||'sem e-mail'} · ${item.role||'sem perfil'}`,meta:item.unit?`Unidade ${item.unit}`:'Acesso do sistema'};
    if(state.type==='residents') return {title:item.name||`Morador ${item.id}`,subtitle:`Unidade ${item.unit||'-'} · ${item.email||'sem e-mail'}`,meta:item.creator_role?`Criado por ${item.creator_role}`:'Autoria anterior não identificada'};
    if(state.type==='packages') return {title:item.tracking||item.label||`Encomenda ${item.id}`,subtitle:`${item.recipient||'Destinatário não informado'} · Unidade ${item.unit||'-'}`,meta:`Status: ${item.status||'pendente'}`};
    return {title:item.area||`Reserva ${item.id}`,subtitle:`${String(item.reserved_for||'').slice(0,10)||'sem data'} · Unidade ${item.unit||'-'}`,meta:`${item.start_time||'--:--'} às ${item.end_time||'--:--'} · ${item.status||'pendente'}`};
  }
  function filteredItems(){
    const q=normalize(state.query).trim();
    if(!q) return state.items;
    return state.items.filter(item=>normalize(Object.values(item).join(' ')).includes(q));
  }
  function policyText(){
    if(role()==='admin') return 'O administrador pode excluir registros operacionais e cadastros comuns. Registros criados pelo síndico ficam protegidos, salvo quando estiverem claramente identificados como teste.';
    if(role()==='subsindico') return 'O subsíndico pode excluir registros nesta central. Todas as exclusões são rastreadas na auditoria e usam remoção segura.';
    if(role()==='sindico') return 'O síndico possui gestão das exclusões. O sistema registra quem excluiu, a autoria original e uma cópia técnica para auditoria.';
    return 'Área técnica de exclusões rastreáveis.';
  }
  function toast(message,fail=false){
    if(!state.overlay) return;
    let node=state.overlay.querySelector('.vrDeletionToast');
    if(!node){node=document.createElement('div');node.className='vrDeletionToast';state.overlay.querySelector('.vrDeletionShell')?.appendChild(node);}
    node.textContent=message;
    node.dataset.fail=fail?'true':'false';
    node.hidden=false;
    clearTimeout(node._timer);
    node._timer=setTimeout(()=>{node.hidden=true;},3600);
  }
  function renderBody(){
    if(!state.overlay) return;
    const body=state.overlay.querySelector('.vrDeletionBody');
    if(!body) return;
    if(state.loading){body.innerHTML='<div class="vrDeletionState">Carregando registros protegidos…</div>';return;}
    const rows=filteredItems();
    if(!rows.length){body.innerHTML=`<div class="vrDeletionState">${state.query?'Nenhum resultado para a pesquisa.':'Nenhum registro disponível nesta categoria.'}</div>`;return;}
    body.innerHTML=`<div class="vrDeletionList">${rows.map(item=>{
      const info=display(item);
      const creator=item.creator_role?` · autoria: ${escapeHtml(item.creator_role)}`:'';
      const test=item.is_test_record?' · cadastro de teste':'';
      const blocked=item.delete_block_reason?`<small>${escapeHtml(item.delete_block_reason)}</small>`:'';
      return `<article class="vrDeletionRow" data-id="${Number(item.id)}">
        <div><b>${escapeHtml(info.title)}</b><small>${escapeHtml(info.subtitle)}</small></div>
        <div class="vrDeletionMeta">${escapeHtml(info.meta)}${creator}${test}${blocked}</div>
        <button type="button" class="vrDeleteButton" data-delete-id="${Number(item.id)}" ${item.can_delete===false?'disabled':''}>${item.can_delete===false?'Protegido':'Excluir'}</button>
      </article>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-delete-id]').forEach(button=>button.addEventListener('click',()=>removeItem(Number(button.dataset.deleteId))));
  }
  function renderTabs(){
    if(!state.overlay) return;
    const tabs=state.overlay.querySelector('.vrDeletionTabs');
    if(!tabs) return;
    tabs.innerHTML=Object.entries(types).map(([key,value])=>`<button type="button" data-type="${key}" class="${key===state.type?'active':''}">${value.icon} ${value.label}</button>`).join('');
    tabs.querySelectorAll('[data-type]').forEach(button=>button.addEventListener('click',async()=>{
      state.type=button.dataset.type;
      state.query='';
      const input=state.overlay?.querySelector('.vrDeletionSearch');if(input)input.value='';
      renderTabs();
      await load();
    }));
  }
  async function load(){
    state.loading=true;renderBody();
    try{
      const result=await api(`/api/deletion-governance/list/${state.type}`);
      state.items=Array.isArray(result.items)?result.items:[];
    }catch(error){state.items=[];toast(error.message,true);}
    finally{state.loading=false;renderBody();}
  }
  async function removeItem(id){
    const item=state.items.find(row=>Number(row.id)===Number(id));
    if(!item||item.can_delete===false) return;
    const info=display(item);
    const category=types[state.type];
    const warning=`Excluir ${category.singular} “${info.title}”?\n\nA remoção sairá das telas do sistema e ficará registrada na auditoria.`;
    if(!window.confirm(warning)) return;
    const button=state.overlay?.querySelector(`[data-delete-id="${id}"]`);
    if(button){button.disabled=true;button.textContent='Excluindo…';}
    try{
      await api(`/api/${state.type}/${id}`,{method:'DELETE'});
      state.items=state.items.filter(row=>Number(row.id)!==Number(id));
      state.changed=true;
      renderBody();
      toast(`${category.singular.charAt(0).toUpperCase()+category.singular.slice(1)} excluído com auditoria.`);
    }catch(error){
      if(button){button.disabled=false;button.textContent='Excluir';}
      toast(error.message,true);
    }
  }

  function clearStaleFocus(){
    if(state.overlay?.isConnected) return;
    state.overlay=null;
    document.body.classList.remove('vr-focus-layer','vr-deletion-open');
  }
  function close(){
    if(state.overlay) state.overlay.remove();
    state.overlay=null;
    document.body.classList.remove('vr-focus-layer','vr-deletion-open');
    document.removeEventListener('keydown',onKey);
    scheduleSync();
    if(state.changed) window.setTimeout(()=>window.location.reload(),120);
  }
  function onKey(event){if(event.key==='Escape')close();}
  async function open(){
    if(!allowedRoles.has(role())) return;
    if(state.overlay?.isConnected) return;
    clearStaleFocus();
    state.changed=false;state.query='';
    const overlay=document.createElement('div');
    overlay.className='vrDeletionOverlay';
    overlay.innerHTML=`<section class="vrDeletionShell" role="dialog" aria-modal="true" aria-label="Central de exclusões">
      <header class="vrDeletionHead"><div><small>Governança e auditoria</small><h2>Central de exclusões</h2><p>Gerencie usuários, moradores, encomendas e reservas sem perder rastreabilidade.</p></div><button type="button" class="vrDeletionClose" aria-label="Fechar">×</button></header>
      <div class="vrDeletionPolicy ${role()==='admin'?'admin':''}"><b>Regra de proteção</b><br>${escapeHtml(policyText())}</div>
      <div class="vrDeletionToolbar"><div class="vrDeletionTabs"></div><input class="vrDeletionSearch" type="search" placeholder="Pesquisar nesta categoria" aria-label="Pesquisar registros"></div>
      <div class="vrDeletionBody"></div>
      <div class="vrDeletionToast" hidden></div>
    </section>`;
    document.body.appendChild(overlay);
    state.overlay=overlay;
    document.body.classList.add('vr-focus-layer','vr-deletion-open');
    overlay.querySelector('.vrDeletionClose')?.addEventListener('click',close);
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    overlay.querySelector('.vrDeletionSearch')?.addEventListener('input',event=>{state.query=event.target.value;renderBody();});
    document.addEventListener('keydown',onKey);
    renderTabs();
    await load();
  }
  function injectMenu(){
    const current=user();
    if(!current||!allowedRoles.has(String(current.role||'').toLowerCase())) return;
    const host=document.querySelector('.appShell aside .sideBottom');
    if(!host||host.querySelector('.vrGovernanceMenuButton')) return;
    const button=document.createElement('button');
    button.type='button';button.className='vrGovernanceMenuButton';button.innerHTML='<span aria-hidden="true">🛡️</span><span>Gerenciar exclusões</span>';
    button.addEventListener('click',open);
    host.insertBefore(button,host.firstChild);
  }

  let syncQueued=false;
  let lastDrawerOpen=null;
  function syncLayerState(){
    const shell=document.querySelector('.appShell');
    const drawerOpen=Boolean(shell?.classList.contains('mobile-open'));
    if(drawerOpen!==lastDrawerOpen){
      lastDrawerOpen=drawerOpen;
      document.body.classList.toggle('vr-sidebar-drawer-open',drawerOpen);
    }
    // A classe de foco pertence exclusivamente à central de exclusões.
    // Elementos ocultos de outros módulos não podem mais esconder a navegação.
    clearStaleFocus();
    injectMenu();
  }
  function scheduleSync(){
    if(syncQueued) return;
    syncQueued=true;
    const run=()=>{syncQueued=false;syncLayerState();};
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(run);
    else setTimeout(run,0);
  }
  const observer=new MutationObserver(scheduleSync);
  function start(){
    clearStaleFocus();
    observer.observe(document.body,{childList:true,subtree:true});
    scheduleSync();
    setTimeout(clearStaleFocus,500);
    setTimeout(clearStaleFocus,2500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.VitoriaRegiaDeletionGovernance={open,close,reload:load};
})();
