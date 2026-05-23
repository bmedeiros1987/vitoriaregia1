
(function(){
const P='vitoriaRegia.full.v1.';
const K={session:P+'session',packages:P+'packages',bookings:P+'bookings',notices:P+'notices',requests:P+'serviceRequests',finance:P+'financeRecords'};
function parse(v,f){if(!v)return f;try{return JSON.parse(v)}catch(_){return f}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
function s(){return parse(localStorage.getItem(K.session),{})||{}}
function rk(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function role(){const x=s();const r=rk(x.role||x.staffRole||x.originalRole||'');if(r.includes('owner')||r.includes('propriet'))return'owner';if(r.includes('admin'))return'admin';if(r.includes('sind'))return'sindico';if(r.includes('port'))return'portaria';return'morador'}
function name(){return String(s().name||s().email||'usuário').trim().split(/\s+/)[0]||'usuário'}
function unit(){const x=s();return x.apartment||x.unit||x.unidade||''}
function greet(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
function logged(){const app=document.querySelector('[data-app]'),login=document.querySelector('[data-login-screen]');return !!(document.body.classList.contains('vr-authenticated')||(app&&!app.hidden&&(!login||login.hidden)))}
function arr(k){return parse(localStorage.getItem(k),[])}
function mine(i){const u=String(unit()||'');return !!u&&[i.apartment,i.unit,i.unidade,i.residentApartment,i.bookingApartment].some(v=>String(v||'')===u)}
function go(t){const q=[`[data-nav="${t}"]`,`[data-route="${t}"]`,`[data-section="${t}"]`,`a[href="#${t}"]`,`button[data-target="${t}"]`];const el=q.map(x=>document.querySelector(x)).find(Boolean);if(el)el.click();else location.hash=t}
function cls(t){t=rk(t);if(t.includes('pendente')||t.includes('aguard')||t.includes('pagamento')||t.includes('assinar'))return'warning';if(t.includes('venc')||t.includes('atras')||t.includes('inadimpl'))return'danger';return''}
function item(ic,ti,tx,st,t){return `<button class="vr-home-item" type="button" data-vr-go="${t||''}"><span class="vr-home-icon">${ic}</span><span><strong>${ti}</strong><small>${tx}</small></span><span class="vr-home-status ${cls(st)}">${st||'Abrir'}</span></button>`}
function notice(ti,tx,t){return `<button class="vr-home-notice" type="button" data-vr-go="${t||'comunicados'}"><span class="vr-home-icon">🔔</span><span><strong>${ti}</strong><small>${tx}</small></span><span class="vr-home-status warning">Novo</span></button>`}
function relevant(r){
 const packages=arr(K.packages),bookings=arr(K.bookings),finance=arr(K.finance),requests=arr(K.requests);
 if(r==='morador'){
  const rows=[];
  bookings.filter(mine).slice(0,3).forEach(b=>rows.push(item('📅','Reserva',`${b.area||b.space||'Área comum'} • ${b.date||b.createdAt||''}`,b.status||'Aguardando análise','reservas')));
  packages.filter(mine).slice(0,3).forEach(p=>rows.push(item('📦','Encomenda',`${p.description||p.codigo||p.tracking||'Entrega registrada'} • ${p.createdAt||''}`,p.status||'Pendente','encomendas')));
  finance.filter(mine).slice(0,3).forEach(f=>rows.push(item('💰','Financeiro da sua unidade',`${f.description||f.title||'Cobrança'} • ${f.amount||f.valor||''}`,f.status||'Ver','financeiro-publico')));
  requests.filter(mine).slice(0,3).forEach(x=>rows.push(item('🛠️','Solicitação',`${x.type||x.tipo||'Solicitação'} • ${x.description||''}`,x.status||'Aberta','solicitacoes')));
  return rows.length?rows:[item('✅','Tudo em ordem','Nenhuma pendência relevante para sua unidade no momento.','OK','dashboard')]
 }
 if(r==='portaria')return [item('📦','Encomendas','Registrar e acompanhar entregas do dia.','Operação','encomendas'),item('👥','Visitantes','Autorizações e entrada de visitantes.','Operação','visitantes'),item('🚨','Emergências','Ver alertas ativos do turno.','Atenção','emergencias')];
 const del=finance.filter(f=>/venc|atras|inadimpl/i.test(String(f.status||f.description||'')));
 return [item('🔴','Inadimplências',`${del.length} registro(s) para acompanhar.`,del.length?'Atenção':'OK','financeiro-admin'),item('💰','Financeiro administrativo','Receitas, despesas, boletos e relatórios internos.','Restrito','financeiro-admin'),item('👁️','Financeiro público','Escolha o que os moradores podem visualizar.','Publicar','financeiro-publico'),item('🏦','Banco e boletos','Vincular banco, configurar boletos e recorrências.','Configurar','boletos'),item('🧾','Relatórios no boleto','Despesas fixas, emergenciais e observações do síndico.','Editar','boletos')]
}
function notices(r){
 const ns=arr(K.notices);
 if(r==='morador')return ns.filter(n=>n.public===true||n.publico===true||mine(n)).slice(0,3).map(n=>notice(n.title||'Comunicado',n.message||n.text||'Aviso do condomínio.','comunicados'));
 if(r==='portaria')return [notice('Avisos da portaria','Veja ocorrências, visitantes e encomendas do turno.','portaria'),notice('Emergências','Alertas críticos aparecem conforme escala cadastrada.','emergencias')];
 const req=arr(K.requests).filter(r=>/pendente|aguard|abert|novo/i.test(String(r.status||'pendente')));
 return [notice('Notificações do síndico','Aprovações, solicitações e avisos administrativos.','notificacoes'),notice('Solicitações pendentes',`${req.length} solicitação(ões) aguardando análise.`,'solicitacoes'),notice('Financeiro','Confira inadimplências e relatórios antes dos envios.','financeiro-admin')]
}
function dash(){
 if(!logged())return;
 const d=document.querySelector('#dashboard[data-section]')||document.querySelector('[data-page="dashboard"]')||document.querySelector('main')||document.body;
 if(!d||d.querySelector('.vr-home-objective'))return;
 const r=role();document.body.classList.remove('vr-role-morador','vr-role-portaria','vr-role-sindico','vr-role-admin','vr-role-owner');document.body.classList.add('vr-role-'+r);
 document.querySelectorAll('.vr-dashboard-hero,.vr-profile-home,.vr-safe-dashboard-strip').forEach(e=>e.remove());
 const subtitle=r==='morador'?'Acesse suas reservas, encomendas, cobranças da sua unidade e comunicados liberados pelo síndico.':r==='portaria'?'Acompanhe os registros operacionais do turno, visitantes, encomendas e emergências.':'Veja notificações do síndico, inadimplências, boletos, solicitações e informações administrativas.';
 const quick=r==='morador'?`<button class="vr-home-btn" data-vr-go="reservas">Solicitar reserva</button><button class="vr-home-btn" data-vr-go="financeiro-publico">Financeiro</button><button class="vr-home-btn" data-vr-go="encomendas">Encomendas</button><button class="vr-home-btn" data-vr-profile>Meu perfil</button>`:r==='portaria'?`<button class="vr-home-btn" data-vr-go="encomendas">Registrar encomenda</button><button class="vr-home-btn" data-vr-go="visitantes">Cadastrar visitante</button><button class="vr-home-btn" data-vr-profile>Meu perfil</button>`:`<button class="vr-home-btn" data-vr-go="financeiro-admin">Financeiro admin</button><button class="vr-home-btn" data-vr-go="financeiro-publico">Financeiro público</button><button class="vr-home-btn" data-vr-go="boletos">Banco e boletos</button><button class="vr-home-btn" data-vr-profile>Meu perfil</button>`;
 d.insertAdjacentHTML('afterbegin',`<section class="vr-home-objective"><div class="vr-home-greeting"><div><h2>${greet()}, ${name()}.</h2><p>${subtitle}</p></div><div class="vr-home-greeting-actions">${quick}</div></div><div class="vr-home-grid"><div class="vr-home-panel"><h3>🔔 Notificações importantes</h3><div class="vr-home-notices">${notices(r).join('')||'<div class="vr-home-empty">Nenhuma notificação importante agora.</div>'}</div></div><div class="vr-home-panel"><h3>📌 Informações relevantes</h3><div class="vr-home-items">${relevant(r).join('')}</div></div></div></section>`);
 d.querySelectorAll('[data-vr-go]').forEach(b=>b.addEventListener('click',()=>go(b.getAttribute('data-vr-go'))));d.querySelectorAll('[data-vr-profile]').forEach(b=>b.addEventListener('click',profile))
}
function profile(){
 const x=s();let m=document.querySelector('.vr-profile-modal-v437');if(!m){m=document.createElement('div');m.className='vr-profile-modal-v437';m.innerHTML=`<div class="vr-profile-card-v437"><div class="vr-profile-head-v437"><div><h3>Meu perfil</h3><p>Atualize seus dados e altere sua senha.</p></div><button class="vr-home-btn" data-close-profile>Fechar</button></div><div class="vr-profile-body-v437"><label>Nome <input name="name"></label><label>E-mail <input name="email" type="email"></label><label>WhatsApp <input name="whatsapp"></label><label>Telegram / Chat ID <input name="telegram"></label><label>Nova senha <input name="newPassword" type="password"></label><label>Confirmar nova senha <input name="confirmPassword" type="password"></label></div><div class="vr-profile-actions-v437"><button class="vr-home-btn" data-close-profile>Cancelar</button><button class="vr-home-btn" data-save-profile>Salvar perfil</button></div></div>`;document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m||e.target.dataset.closeProfile!==undefined)m.classList.remove('is-open');if(e.target.dataset.saveProfile!==undefined)saveProfile(m)})}
 m.querySelector('[name="name"]').value=x.name||'';m.querySelector('[name="email"]').value=x.email||'';m.querySelector('[name="whatsapp"]').value=x.whatsapp||'';m.querySelector('[name="telegram"]').value=x.telegram||x.telegramChatId||'';m.querySelector('[name="newPassword"]').value='';m.querySelector('[name="confirmPassword"]').value='';m.classList.add('is-open')
}
function toast(msg){let e=document.querySelector('.vr-safe-toast');if(!e){e=document.createElement('div');e.className='vr-safe-toast';document.body.appendChild(e)}e.textContent=msg;e.classList.add('is-open');setTimeout(()=>e.classList.remove('is-open'),3200)}
function saveProfile(m){const x=s(),pass=m.querySelector('[name="newPassword"]').value,conf=m.querySelector('[name="confirmPassword"]').value;if(pass&&pass!==conf)return toast('As senhas não conferem.');const n={...x,name:m.querySelector('[name="name"]').value.trim(),email:m.querySelector('[name="email"]').value.trim(),whatsapp:m.querySelector('[name="whatsapp"]').value.trim(),telegram:m.querySelector('[name="telegram"]').value.trim(),telegramChatId:m.querySelector('[name="telegram"]').value.trim(),updatedAt:new Date().toISOString()};if(pass){n.passwordUpdatedAt=new Date().toISOString();n.localPasswordChanged=true}save(K.session,n);m.classList.remove('is-open');toast('Perfil atualizado com sucesso.');setTimeout(()=>location.reload(),600)}
document.addEventListener('DOMContentLoaded',dash);window.addEventListener('load',dash);new MutationObserver(()=>{if(!document.querySelector('.vr-home-objective'))dash()}).observe(document.documentElement,{childList:true,subtree:true});
})();
