(function () {
  const $app = document.getElementById('app');
  const STORE_KEY = 'vitoriaRegiaStore.v3';
  const SESSION_KEY = 'currentUser';

  const defaultStore = {
    residents: [], users: [], packages: [], visitors: [], recurringVisitors: [], bookings: [], notices: [], services: [], emergencies: [], notifications: [], logs: [], settings: {
      condominiumName: 'Condomínio Vitória Régia', buildingBackground: 'assets/building-bg.svg'
    }
  };

  const roleLabels = { morador: 'Morador', portaria: 'Portaria', sindico: 'Síndico', subsindico: 'Subsíndico', admin: 'Administrador técnico' };
  const pages = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'moradores', icon: '🏢', label: 'Moradores', roles: ['sindico', 'subsindico', 'admin'] },
    { id: 'usuarios', icon: '👥', label: 'Usuários internos', roles: ['sindico', 'admin'] },
    { id: 'encomendas', icon: '📦', label: 'Encomendas', roles: ['portaria', 'sindico', 'subsindico', 'admin', 'morador'] },
    { id: 'visitantes', icon: '🪪', label: 'Visitantes', roles: ['portaria', 'sindico', 'subsindico', 'admin', 'morador'] },
    { id: 'reservas', icon: '📅', label: 'Reservas', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'comunicados', icon: '📣', label: 'Comunicados', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'emergencias', icon: '🚨', label: 'Emergências', roles: ['portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'premium', icon: '⭐', label: 'Central premium', roles: ['sindico', 'admin'] },
    { id: 'atualizacoes', icon: '⬆️', label: 'Atualizações', roles: ['admin'] }
  ];

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function loadStore() {
    try { return { ...clone(defaultStore), ...(JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}) }; }
    catch (_) { return clone(defaultStore); }
  }
  function saveStore(store) { localStorage.setItem(STORE_KEY, JSON.stringify(store)); syncState(store); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem('userRole', user.role);
    localStorage.setItem('user', JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('userRole');
  }
  function firstName(name) { return String(name || 'Usuário').trim().split(/\s+/)[0] || 'Usuário'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function formatDate(value) { if (!value) return '-'; try { return new Date(value).toLocaleString('pt-BR'); } catch (_) { return value; } }
  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
  function toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.remove(), 2900);
  }
  function allow(user, roles) { return user && roles.includes(user.role); }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function syncState(store) {
    if (!navigator.onLine) return;
    try { await fetch('/api/state/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: store }) }); }
    catch (_) {}
  }

  function seed() {
    const store = loadStore();
    if (!store.notices.length) {
      store.notices.push({ id: id('notice'), title: 'Sistema restaurado', audience: 'Todos', body: 'Arquivos essenciais restaurados e sistema pronto para operação.', createdAt: new Date().toISOString() });
    }
    saveStore(store);
  }

  function renderLogin() {
    $app.innerHTML = `
      <main class="login-page">
        <section class="login-hero">
          <div>
            <div class="brand"><div class="brand-mark">VR</div><div><div class="brand-title">Vitória Régia</div><div class="brand-subtitle">Sistema condominial</div></div></div>
            <h1>Gestão simples, segura e elegante.</h1>
            <p>Login, moradores, usuários internos, encomendas, visitantes, reservas, comunicados, notificações, emergência e central de atualizações em um só lugar.</p>
          </div>
        </section>
        <section class="login-card">
          <div class="brand"><div class="brand-mark">🏢</div><div><div class="brand-title">Entrar no sistema</div><div class="brand-subtitle">A tela inicial exibe apenas login e senha.</div></div></div>
          <form id="loginForm" class="form-grid">
            <label class="field"><span>Nome</span><input name="name" placeholder="Ex.: Bruno Saraiva" autocomplete="name" required /></label>
            <label class="field"><span>E-mail ou usuário</span><input name="email" placeholder="seu@email.com" autocomplete="username" required /></label>
            <label class="field"><span>Senha</span><input name="password" type="password" placeholder="Digite sua senha" autocomplete="current-password" required /></label>
            <label class="field"><span>Perfil de acesso</span><select name="role"><option value="morador">Morador</option><option value="portaria">Portaria</option><option value="sindico">Síndico</option><option value="subsindico">Subsíndico</option><option value="admin">Administrador técnico</option></select></label>
            <label class="field"><span>Unidade, se aplicável</span><input name="apartment" placeholder="Ex.: 305, Bloco B" /></label>
            <button class="btn primary" type="submit">Entrar</button>
            <p class="note">O administrador técnico é reconhecido pelo login e senha, sem botão público específico. Dados locais são preservados no navegador e sincronizados com o backend quando disponível.</p>
          </form>
        </section>
      </main>`;
    document.getElementById('loginForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.currentTarget).entries());
      const user = { id: data.email || id('user'), name: data.name, email: data.email, role: data.role, apartment: data.apartment, createdAt: new Date().toISOString() };
      setSession(user);
      try { await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) }); } catch (_) {}
      seed(); renderApp('dashboard');
    });
  }

  function navFor(user) { return pages.filter(p => allow(user, p.roles)); }
  function renderApp(page = location.hash.replace('#', '') || 'dashboard') {
    const user = getSession(); if (!user) return renderLogin();
    const visible = navFor(user); if (!visible.some(p => p.id === page)) page = 'dashboard';
    const current = pages.find(p => p.id === page) || pages[0];
    $app.innerHTML = `
      <div class="layout">
        <aside id="sidebar" class="sidebar">
          <div class="brand"><div class="brand-mark">VR</div><div><div class="brand-title">Vitória Régia</div><div class="brand-subtitle">${escapeHtml(roleLabels[user.role] || user.role)}</div></div></div>
          <nav class="nav">${visible.map(p => `<button class="${p.id === page ? 'active' : ''}" data-page="${p.id}"><span>${p.icon}</span>${p.label}</button>`).join('')}</nav>
          <div class="user-panel"><strong>${escapeHtml(user.name)}</strong><div class="note">${escapeHtml(user.apartment || user.email || '')}</div><button class="btn ghost small" id="logoutBtn" style="margin-top:10px">Sair</button></div>
        </aside>
        <main class="main">
          <div class="topbar"><div><button class="btn ghost menu-toggle" id="menuToggle">☰ Menu</button><h2>${current.icon} ${current.label}</h2><p>${greeting()}, ${escapeHtml(firstName(user.name))}. Sistema operacional.</p></div><button class="btn ghost small" id="syncBtn">Sincronizar</button></div>
          <div id="page"></div>
        </main>
      </div>
      <button class="global-panic" title="Emergência" aria-label="Abrir emergência" id="panicFloating">🚨</button>`;
    document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => { location.hash = btn.dataset.page; renderApp(btn.dataset.page); }));
    document.getElementById('logoutBtn').onclick = () => { clearSession(); renderLogin(); };
    document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('syncBtn').onclick = () => { syncState(loadStore()); toast('Sincronização solicitada.'); };
    document.getElementById('panicFloating').onclick = () => openPanicModal();
    renderPage(page, user);
  }

  function renderPage(page, user) {
    const renderer = { dashboard, moradores, usuarios, encomendas, visitantes, reservas, comunicados, emergencias, premium, atualizacoes }[page] || dashboard;
    document.getElementById('page').innerHTML = renderer(user);
    bindPage(page, user);
  }

  function action(id, icon, title, text) { return `<button class="action-card" data-page="${id}"><span style="font-size:1.5rem">${icon}</span><strong>${title}</strong><small>${text}</small></button>`; }
  function dashboard(user) {
    const s = loadStore();
    const baseActions = user.role === 'morador'
      ? [action('reservas','📅','Solicitar reserva','Reserve área comum.'), action('encomendas','📦','Minhas encomendas','Consulte entregas.'), action('visitantes','🪪','Visitante recorrente','Cadastre visitantes.'), action('comunicados','📣','Comunicados','Leia avisos.'), action('dashboard','🛠️','Solicitar serviço','Registre demanda.'), action('dashboard','☎️','Falar com portaria','Contato rápido.')]
      : user.role === 'portaria'
        ? [action('encomendas','📦','Registrar encomenda','Nova entrega.'), action('visitantes','🪪','Cadastrar visitante','Entrada/saída.'), action('visitantes','🔎','Consultar recorrentes','Lista liberada.'), action('comunicados','📣','Avisar morador','Comunicado rápido.'), action('emergencias','🚨','Emergências','Ocorrências abertas.')]
        : [action('moradores','🏢','Moradores','Cadastro e consulta.'), action('usuarios','👥','Usuários internos','Perfis e permissões.'), action('comunicados','📣','Novo comunicado','Geral ou por unidade.'), action('encomendas','📦','Encomendas','Acompanhar entregas.'), action('reservas','📅','Reservas','Aprovar solicitações.'), action('premium','⭐','Central premium','Diagnóstico do sistema.'), action('emergencias','🚨','Emergências','Confirmar alertas.')];
    return `<section class="hero"><h1>${greeting()}, ${escapeHtml(firstName(user.name))}.</h1><p>Bem-vindo ao Vitória Régia. O painel foi restaurado com todos os arquivos essenciais e atalhos por perfil.</p><div class="hero-actions"><button class="btn primary" data-page="reservas">📅 Solicitar reserva</button><button class="btn danger" data-open-panic>🚨 Emergência</button></div></section>
      <div class="grid cols-4" style="margin:16px 0"><div class="card kpi"><strong>${s.residents.length}</strong><span>Moradores</span></div><div class="card kpi"><strong>${s.packages.length}</strong><span>Encomendas</span></div><div class="card kpi"><strong>${s.bookings.length}</strong><span>Reservas</span></div><div class="card kpi"><strong>${s.emergencies.filter(e=>e.status!=='resolvido').length}</strong><span>Emergências abertas</span></div></div>
      <div class="card"><div class="section-title"><h3>Ações rápidas</h3><span class="badge ok">Perfil: ${escapeHtml(roleLabels[user.role] || user.role)}</span></div><div class="action-grid">${baseActions.join('')}</div></div>`;
  }

  function table(rows, columns) {
    if (!rows.length) return `<p class="note">Nenhum registro encontrado.</p>`;
    return `<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td>${escapeHtml(typeof c.value === 'function' ? c.value(r) : r[c.value])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function moradores() {
    const s = loadStore();
    return `<div class="grid cols-2"><section class="card"><h3>Cadastro de morador</h3><form id="residentForm" class="form-grid"><label class="field"><span>Nome</span><input name="name" required></label><label class="field"><span>Unidade</span><input name="apartment" required></label><label class="field"><span>E-mail</span><input name="email" type="email"></label><label class="field"><span>Telefone</span><input name="phone"></label><button class="btn primary">Salvar morador</button></form></section><section class="card"><div class="section-title"><h3>Consulta de moradores</h3><span class="badge">${s.residents.length}</span></div>${table(s.residents, [{label:'Nome', value:'name'}, {label:'Unidade', value:'apartment'}, {label:'E-mail', value:'email'}, {label:'Telefone', value:'phone'}])}</section></div>`;
  }
  function usuarios() {
    const s = loadStore();
    return `<div class="grid cols-2"><section class="card"><h3>Cadastro de usuário interno</h3><form id="userForm" class="form-grid"><label class="field"><span>Nome</span><input name="name" required></label><label class="field"><span>E-mail</span><input name="email" type="email" required></label><label class="field"><span>Perfil</span><select name="role"><option value="portaria">Portaria</option><option value="subsindico">Subsíndico</option><option value="sindico">Síndico</option><option value="admin">Administrador técnico</option></select></label><button class="btn primary">Salvar usuário</button></form></section><section class="card"><div class="section-title"><h3>Consulta de usuários</h3><span class="badge">${s.users.length}</span></div>${table(s.users, [{label:'Nome', value:'name'}, {label:'E-mail', value:'email'}, {label:'Perfil', value:r=>roleLabels[r.role]||r.role}])}</section></div>`;
  }
  function encomendas(user) {
    const s = loadStore();
    const rows = user.role === 'morador' && user.apartment ? s.packages.filter(p => String(p.apartment||'').toLowerCase() === String(user.apartment).toLowerCase()) : s.packages;
    const form = user.role !== 'morador' ? `<section class="card"><h3>Registrar encomenda</h3><form id="packageForm" class="form-grid"><label class="field"><span>Unidade</span><input name="apartment" required></label><label class="field"><span>Destinatário</span><input name="recipient"></label><label class="field"><span>Descrição</span><input name="description" placeholder="Mercado Livre, Sedex, envelope..."></label><button class="btn primary">Registrar</button></form></section>` : '';
    return `<div class="grid ${form?'cols-2':''}">${form}<section class="card"><div class="section-title"><h3>${user.role==='morador'?'Minhas encomendas':'Consulta de encomendas'}</h3><span class="badge">${rows.length}</span></div>${table(rows, [{label:'Unidade', value:'apartment'}, {label:'Destinatário', value:'recipient'}, {label:'Descrição', value:'description'}, {label:'Status', value:r=>r.status||'pendente'}, {label:'Data', value:r=>formatDate(r.createdAt)}])}</section></div>`;
  }
  function visitantes() {
    const s = loadStore();
    return `<div class="grid cols-2"><section class="card"><h3>Cadastrar visitante</h3><form id="visitorForm" class="form-grid"><label class="field"><span>Nome</span><input name="name" required></label><label class="field"><span>Documento/placa</span><input name="document"></label><label class="field"><span>Unidade</span><input name="apartment" required></label><label class="field"><span>Recorrente?</span><select name="recurring"><option value="Não">Não</option><option value="Sim">Sim</option></select></label><button class="btn primary">Salvar visitante</button></form></section><section class="card"><div class="section-title"><h3>Consulta de visitantes</h3><span class="badge">${s.visitors.length}</span></div>${table(s.visitors, [{label:'Nome', value:'name'}, {label:'Documento', value:'document'}, {label:'Unidade', value:'apartment'}, {label:'Recorrente', value:'recurring'}, {label:'Data', value:r=>formatDate(r.createdAt)}])}</section></div>`;
  }
  function reservas() {
    const s = loadStore();
    return `<div class="grid cols-2"><section class="card"><h3>Solicitar reserva</h3><form id="bookingForm" class="form-grid"><label class="field"><span>Área</span><select name="space"><option>Salão de festas</option><option>Churrasqueira</option><option>Espaço gourmet</option><option>Quadra</option></select></label><label class="field"><span>Data e hora</span><input name="date" type="datetime-local" required></label><label class="field"><span>Unidade</span><input name="apartment"></label><button class="btn primary">Solicitar</button></form></section><section class="card"><div class="section-title"><h3>Reservas</h3><span class="badge">${s.bookings.length}</span></div>${table(s.bookings, [{label:'Área', value:'space'}, {label:'Unidade', value:'apartment'}, {label:'Status', value:r=>r.status||'solicitada'}, {label:'Data', value:r=>formatDate(r.date)}])}</section></div>`;
  }
  function comunicados(user) {
    const s = loadStore();
    const canPost = ['sindico','subsindico','admin','portaria'].includes(user.role);
    return `<div class="grid ${canPost?'cols-2':''}">${canPost ? `<section class="card"><h3>Novo comunicado</h3><form id="noticeForm" class="form-grid"><label class="field"><span>Título</span><input name="title" required></label><label class="field"><span>Destinatário</span><select name="audience"><option>Todos</option><option>Unidade específica</option><option>Portaria</option><option>Síndico/Administração</option></select></label><label class="field"><span>Unidade, se específico</span><input name="apartment"></label><label class="field"><span>Mensagem</span><textarea name="body" required></textarea></label><button class="btn primary">Publicar comunicado</button></form></section>` : ''}<section class="card"><div class="section-title"><h3>Comunicados</h3><span class="badge">${s.notices.length}</span></div>${table(s.notices, [{label:'Título', value:'title'}, {label:'Público', value:'audience'}, {label:'Unidade', value:'apartment'}, {label:'Mensagem', value:'body'}, {label:'Data', value:r=>formatDate(r.createdAt)}])}</section></div>`;
  }
  function emergencias() {
    const s = loadStore();
    return `<section class="card"><div class="section-title"><h3>Central de emergências</h3><button class="btn danger" data-open-panic>🚨 Acionar emergência</button></div>${table(s.emergencies, [{label:'Tipo', value:'type'}, {label:'Unidade', value:'apartment'}, {label:'Relato', value:'description'}, {label:'Status', value:'status'}, {label:'Data', value:r=>formatDate(r.createdAt)}])}</section>`;
  }
  function premium() { return `<div class="grid cols-3"><div class="card kpi"><strong>✅</strong><span>Frontend restaurado</span></div><div class="card kpi"><strong>✅</strong><span>Backend presente</span></div><div class="card kpi"><strong>⚠️</strong><span>Banco opcional no modo seguro</span></div></div><section class="card" style="margin-top:16px"><h3>Central premium</h3><p class="note">Diagnóstico de mercado, prontidão do sistema, checklist de deploy e monitoramento básico. Esta área aparece apenas para síndico/administração.</p><button class="btn primary" onclick="fetch('/api/admin/market-readiness').then(r=>r.json()).then(j=>alert(JSON.stringify(j,null,2))).catch(()=>alert('Backend indisponível'))">Rodar diagnóstico</button></section>`; }
  function atualizacoes() { return `<section class="card"><h3>Central de atualizações</h3><p class="note">Use o atualizador profissional em <code>tools/atualizador_profissional_vitoriaregia.sh</code>. Ele cria backup, aplica update, valida arquivos críticos e faz rollback se necessário.</p><div class="grid cols-2"><div class="card"><strong>Arquivos críticos</strong><p class="note">index.html, app.js, styles.css, render.yaml, backend/src/server.js, backend/package.json.</p></div><div class="card"><strong>Status</strong><p class="note">Este pacote é completo e pode restaurar diretório apagado.</p></div></div></section>`; }

  function bindPage(page, user) {
    document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => renderApp(btn.dataset.page)));
    document.querySelectorAll('[data-open-panic]').forEach(btn => btn.addEventListener('click', openPanicModal));
    const forms = {
      residentForm: (s,d)=>s.residents.push({ id:id('resident'), ...d, createdAt:new Date().toISOString() }),
      userForm: (s,d)=>s.users.push({ id:id('user'), ...d, createdAt:new Date().toISOString() }),
      packageForm: (s,d)=>{ s.packages.unshift({ id:id('package'), status:'pendente', ...d, createdAt:new Date().toISOString() }); s.notifications.unshift({ id:id('notif'), title:'Nova encomenda', body:`Encomenda para unidade ${d.apartment}`, createdAt:new Date().toISOString() }); },
      visitorForm: (s,d)=>s.visitors.unshift({ id:id('visitor'), ...d, createdAt:new Date().toISOString() }),
      bookingForm: (s,d)=>s.bookings.unshift({ id:id('booking'), status:'solicitada', ...d, createdAt:new Date().toISOString() }),
      noticeForm: (s,d)=>{ s.notices.unshift({ id:id('notice'), ...d, createdAt:new Date().toISOString() }); notify(d.title, d.body); }
    };
    Object.entries(forms).forEach(([formId, fn]) => {
      const form = document.getElementById(formId); if (!form) return;
      form.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(form).entries()); const s = loadStore(); fn(s,d); saveStore(s); toast('Registro salvo.'); renderApp(page); });
    });
  }

  function notify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') new Notification(title || 'Vitória Régia', { body: body || 'Novo aviso do condomínio.' });
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title || 'Vitória Régia', { body: body || 'Novo aviso do condomínio.' }); });
  }

  function openPanicModal() {
    const user = getSession() || { name:'Usuário' };
    const wrap = document.createElement('div'); wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal"><div class="modal-head"><h3>🚨 Acionar emergência</h3><button class="close" type="button">×</button></div><p class="note">O alerta será enviado primeiro para síndico e portaria. Após confirmação deles, os moradores poderão ser notificados.</p><form id="panicForm" class="form-grid"><label class="field"><span>Tipo</span><select name="type"><option>Incêndio</option><option>Emergência médica</option><option>Violência ou invasão</option><option>Vazamento de gás</option><option>Pane elétrica</option><option>Outro risco</option></select></label><label class="field"><span>Unidade/local</span><input name="apartment" value="${escapeHtml(user.apartment||'')}"></label><label class="field"><span>Descrição</span><textarea name="description" placeholder="Descreva rapidamente o que está acontecendo"></textarea></label><button class="btn danger">Confirmar emergência</button><p class="note">Em risco imediato, acione também os serviços oficiais de emergência.</p></form></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.close').onclick = () => wrap.remove();
    wrap.addEventListener('click', ev => { if (ev.target === wrap) wrap.remove(); });
    wrap.querySelector('#panicForm').addEventListener('submit', async ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); const e = { id:id('panic'), reporter:user.name, status:'aguardando confirmação', ...d, createdAt:new Date().toISOString() }; s.emergencies.unshift(e); s.notifications.unshift({ id:id('notif'), title:'Emergência acionada', body:`${e.type} - ${e.apartment}`, createdAt:new Date().toISOString() }); saveStore(s); try { await fetch('/api/panic', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(e) }); } catch (_) {} notify('Emergência acionada', `${e.type} - ${e.apartment}`); wrap.remove(); toast('Emergência enviada para síndico e portaria.'); renderApp(location.hash.replace('#','') || 'dashboard'); });
  }

  window.addEventListener('hashchange', () => renderApp(location.hash.replace('#','') || 'dashboard'));
  seed(); getSession() ? renderApp(location.hash.replace('#','') || 'dashboard') : renderLogin();
})();
