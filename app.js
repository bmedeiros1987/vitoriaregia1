(function () {
  'use strict';

  const VERSION = '3.1.0';
  const VERSION_LABEL = `v${VERSION}`;
  const STORE_KEY = 'vitoriaRegiaStore.v310';
  const SESSION_KEY = 'currentUser';
  const LEGACY_KEYS = ['vitoriaRegiaStore.v3'];
  const app = document.getElementById('app');

  const roleLabels = {
    morador: 'Morador',
    portaria: 'Portaria',
    porteiro: 'Portaria',
    sindico: 'Síndico',
    subsindico: 'Subsíndico',
    admin: 'Administrador'
  };

  const pageMap = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'moradores', icon: '🏢', label: 'Moradores', roles: ['sindico', 'subsindico', 'admin'] },
    { id: 'usuarios', icon: '👥', label: 'Usuários', roles: ['sindico', 'admin'] },
    { id: 'encomendas', icon: '📦', label: 'Encomendas', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'visitantes', icon: '🪪', label: 'Visitantes', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'reservas', icon: '📅', label: 'Reservas', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'comunicados', icon: '📣', label: 'Comunicados', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'emergencias', icon: '🛟', label: 'Emergências', roles: ['portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'premium', icon: '⭐', label: 'Central premium', roles: ['sindico', 'admin'] },
    { id: 'configuracoes', icon: '⚙️', label: 'Configurações', roles: ['sindico', 'admin'] },
    { id: 'backups', icon: '💾', label: 'Backup', roles: ['sindico', 'admin'] }
  ];

  const defaultStore = {
    meta: { version: VERSION, updatedAt: new Date().toISOString() },
    settings: {
      condominiumName: 'Condomínio Vitória Régia',
      buildingBackground: 'assets/building-bg.svg',
      defaultNoticeDays: 7,
      cloudMode: 'local',
      cloudName: '',
      renderDeployHook: '',
      allowFirstAccessAdmin: true
    },
    users: [],
    residents: [],
    packages: [],
    visitors: [],
    recurringVisitors: [],
    bookings: [],
    notices: [],
    emergencies: [],
    notifications: [],
    cloudFiles: [],
    updateRequests: [],
    backups: [],
    logs: []
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function now() { return new Date().toISOString(); }
  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
  function normalizeRole(value) {
    const raw = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (raw.includes('admin')) return 'admin';
    if (raw.includes('sind') && raw.includes('sub')) return 'subsindico';
    if (raw.includes('sind')) return 'sindico';
    if (raw.includes('port') || raw.includes('porte')) return 'portaria';
    if (raw.includes('morad')) return 'morador';
    return raw || 'morador';
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  function firstName(name) { return String(name || 'Usuário').trim().split(/\s+/)[0] || 'Usuário'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function formatDate(value) {
    if (!value) return '-';
    try { return new Date(value).toLocaleString('pt-BR'); } catch (_) { return value; }
  }
  function todayInputPlus(days) {
    const d = new Date(); d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 16);
  }
  function isVisibleNotice(notice) {
    if (!notice.visibleUntil) return true;
    return new Date(notice.visibleUntil).getTime() >= Date.now();
  }
  function can(user, roles) { return !!user && roles.includes(user.role); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
  }
  function setSession(user) {
    const clean = { ...user, role: normalizeRole(user.role), name: user.name || user.username || 'Usuário' };
    localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
    localStorage.setItem('user', JSON.stringify(clean));
    localStorage.setItem('userRole', clean.role);
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('user');
    localStorage.removeItem('userRole');
  }

  function mergeStore(raw) {
    const base = clone(defaultStore);
    const merged = { ...base, ...(raw || {}) };
    merged.meta = { ...base.meta, ...(raw && raw.meta ? raw.meta : {}), version: VERSION };
    merged.settings = { ...base.settings, ...(raw && raw.settings ? raw.settings : {}) };
    for (const key of ['users','residents','packages','visitors','recurringVisitors','bookings','notices','emergencies','notifications','cloudFiles','updateRequests','backups','logs']) {
      merged[key] = Array.isArray(merged[key]) ? merged[key] : [];
    }
    return merged;
  }

  function loadStore() {
    try {
      const current = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (current) return mergeStore(current);
      for (const key of LEGACY_KEYS) {
        const legacy = JSON.parse(localStorage.getItem(key) || 'null');
        if (legacy) {
          const migrated = mergeStore(legacy);
          saveStore(migrated, false);
          return migrated;
        }
      }
    } catch (_) {}
    return clone(defaultStore);
  }

  function saveStore(store, sync = true) {
    const clean = mergeStore(store);
    clean.meta.updatedAt = now();
    localStorage.setItem(STORE_KEY, JSON.stringify(clean));
    if (sync) syncState(clean);
    return clean;
  }

  async function syncState(store) {
    if (!navigator.onLine) return;
    try {
      await fetch('/api/state/bulk', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ state: store }) });
    } catch (_) {}
  }

  function logAction(type, message, extra = {}) {
    const store = loadStore();
    store.logs.unshift({ id: id('log'), type, message, extra, createdAt: now() });
    saveStore(store, false);
  }

  function toast(message, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`.trim();
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function removeDuplicatePanicButtons() {
    document.querySelectorAll('.global-panic,.vr-global-panic,.panic-button,#panicFloating,#vr-panic-button').forEach(el => {
      if (el.id !== 'emergencyFloat') el.remove();
    });
  }

  function initFirstAccessIfNeeded(username, password) {
    const store = loadStore();
    const hasAnyLogin = store.users.some(u => u.username || u.email || u.password) || store.residents.some(r => r.username || r.email || r.password);
    if (hasAnyLogin || !store.settings.allowFirstAccessAdmin) return null;
    const admin = {
      id: id('user'), name: username.includes('@') ? 'Administrador' : username,
      username, email: username.includes('@') ? username : '', password,
      role: 'admin', active: true, createdAt: now(), firstAccess: true
    };
    store.users.push(admin);
    logAction('auth', 'Primeiro acesso técnico configurado automaticamente.', { username });
    saveStore(store);
    return admin;
  }

  function localAuthenticate(username, password) {
    const store = loadStore();
    const normalized = String(username || '').trim().toLowerCase();
    const pass = String(password || '');
    const matchUser = store.users.find(u => {
      if (u.active === false) return false;
      const ids = [u.username, u.email, u.name].filter(Boolean).map(v => String(v).trim().toLowerCase());
      return ids.includes(normalized) && String(u.password || '') === pass;
    });
    if (matchUser) return { ...matchUser, role: normalizeRole(matchUser.role || 'morador') };

    const matchResident = store.residents.find(r => {
      if (r.active === false) return false;
      const ids = [r.username, r.email, r.name].filter(Boolean).map(v => String(v).trim().toLowerCase());
      return ids.includes(normalized) && String(r.password || '') === pass;
    });
    if (matchResident) return { ...matchResident, role: 'morador' };

    return initFirstAccessIfNeeded(username, password);
  }

  async function authenticate(username, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email: username, password })
      });
      if (response.ok) {
        const result = await response.json();
        if (result && result.ok && result.user) return result.user;
      }
    } catch (_) {}
    return localAuthenticate(username, password);
  }

  function renderLogin(error = '') {
    clearEmergencyFloat();
    app.innerHTML = `
      <main class="login-page">
        <section class="login-hero">
          <div>
            <div class="brand"><div class="brand-mark">VR</div><div><div class="brand-title">Vitória Régia</div><div class="brand-subtitle">Sistema condominial premium</div></div></div>
            <h1>Gestão segura, limpa e profissional.</h1>
            <p>Controle moradores, visitantes, encomendas, reservas, comunicados, emergências, backup e atualizações em uma plataforma única e responsiva.</p>
          </div>
        </section>
        <section class="login-card">
          <div class="brand"><div class="brand-mark">🏢</div><div><div class="brand-title">Entrar no sistema</div><div class="brand-subtitle">Informe apenas usuário e senha.</div></div></div>
          ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
          <form id="loginForm" class="form-grid" autocomplete="on">
            <label class="field"><span>Usuário ou e-mail</span><input name="username" autocomplete="username" placeholder="Digite seu usuário" required /></label>
            <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required /></label>
            <button class="btn primary full" type="submit">Entrar</button>
            <p class="note">A tela inicial não mostra nome, unidade ou perfil. O perfil é reconhecido automaticamente pelo usuário e senha cadastrados.</p>
          </form>
          <p class="note">${VERSION_LABEL} • Vitória Régia</p>
        </section>
      </main>`;

    document.getElementById('loginForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.currentTarget).entries());
      const user = await authenticate(data.username, data.password);
      if (!user) return renderLogin('Usuário ou senha inválidos.');
      setSession(user);
      logAction('auth', `Login realizado por ${user.name || user.username || data.username}.`, { role: user.role });
      renderApp('dashboard');
    });
  }

  function visiblePages(user) { return pageMap.filter(p => can(user, p.roles)); }
  function pageById(page) { return pageMap.find(p => p.id === page) || pageMap[0]; }

  function renderApp(page = location.hash.replace('#','') || 'dashboard') {
    const user = getSession();
    if (!user) return renderLogin();
    removeDuplicatePanicButtons();
    const pages = visiblePages(user);
    if (!pages.some(p => p.id === page)) page = 'dashboard';
    const current = pageById(page);
    const store = loadStore();
    document.documentElement.style.setProperty('--building-bg', `url('${store.settings.buildingBackground || 'assets/building-bg.svg'}')`);

    app.innerHTML = `
      <div class="layout">
        <aside id="sidebar" class="sidebar" aria-label="Menu lateral">
          <div class="brand"><div class="brand-mark">VR</div><div><div class="brand-title">Vitória Régia</div><div class="brand-subtitle">${escapeHtml(roleLabels[user.role] || user.role)}</div></div></div>
          <nav class="nav">${pages.map(p => `<button class="${p.id === page ? 'active' : ''}" data-page="${p.id}" title="${escapeHtml(p.label)}"><span class="ico">${p.icon}</span><span class="label">${escapeHtml(p.label)}</span></button>`).join('')}</nav>
          <div class="user-panel"><strong>${escapeHtml(user.name || user.username || 'Usuário')}</strong><div class="note">${escapeHtml(roleLabels[user.role] || user.role)}${user.apartment ? ' • ' + escapeHtml(user.apartment) : ''}</div><button class="btn ghost small" id="logoutBtn" style="margin-top:10px">Sair</button></div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div class="topbar-left">
              <button class="btn ghost small menu-toggle mobile-only" id="menuToggle">☰</button>
              <button class="btn ghost small back-btn ${page !== 'dashboard' ? 'show' : ''}" id="backDashboard">← Dashboard</button>
              <div><h2>${current.icon} ${escapeHtml(current.label)}</h2><p>${greeting()}, ${escapeHtml(firstName(user.name || user.username))}. Sistema operacional.</p></div>
            </div>
            <div class="topbar-actions"><button class="btn ghost small" id="syncBtn">Sincronizar</button><button class="btn secondary small" data-page="configuracoes">${VERSION_LABEL}</button></div>
          </header>
          <div id="page"></div>
          <div class="footer-version">Vitória Régia ${VERSION_LABEL} • ${escapeHtml(store.settings.condominiumName || 'Condomínio')}</div>
        </main>
      </div>`;

    document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
    document.getElementById('logoutBtn').onclick = () => { clearSession(); renderLogin(); };
    document.getElementById('menuToggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('backDashboard')?.addEventListener('click', () => navigate('dashboard'));
    document.getElementById('syncBtn').onclick = () => { syncState(loadStore()); toast('Sincronização solicitada.'); };

    renderPage(page, user);
    injectEmergencyFloat(user);
  }

  function navigate(page) {
    location.hash = page;
    renderApp(page);
  }

  function renderPage(page, user) {
    const renderers = { dashboard, moradores, usuarios, encomendas, visitantes, reservas, comunicados, emergencias, premium, configuracoes, backups };
    const html = (renderers[page] || dashboard)(user);
    document.getElementById('page').innerHTML = html;
    bindCommonActions(page, user);
    bindForms(page, user);
  }

  function action(page, icon, title, text, extra = '') {
    return `<button class="action-card" data-page="${page}" ${extra}><span class="big">${icon}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text)}</small></button>`;
  }

  function kpi(page, value, label, badge = '') {
    return `<section class="card kpi clickable" data-page="${page}"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${badge ? `<small class="badge">${escapeHtml(badge)}</small>` : ''}</section>`;
  }

  function dashboard(user) {
    const s = loadStore();
    const openEmergencies = s.emergencies.filter(e => !['resolvido','resetado','cancelado'].includes(String(e.status || '').toLowerCase()));
    const visibleNotices = s.notices.filter(n => isVisibleNotice(n));
    const pkgRows = visiblePackagesFor(user, s.packages);
    const actionSets = {
      morador: [
        action('reservas','📅','Solicitar reserva','Reservar área comum'),
        action('encomendas','📦','Minhas encomendas','Ver entregas e imagens'),
        action('visitantes','🪪','Visitante recorrente','Cadastrar autorização'),
        action('comunicados','📣','Comunicados','Ler avisos ativos'),
        action('emergencias','🛟','Emergência','Acionamento discreto')
      ],
      portaria: [
        action('encomendas','📦','Registrar encomenda','Nova entrega com foto'),
        action('visitantes','🪪','Cadastrar visitante','Entrada, saída e imagem'),
        action('comunicados','📣','Avisar morador','Aviso por unidade'),
        action('emergencias','🛟','Emergências','Confirmar ou resetar'),
        action('dashboard','🔎','Consulta rápida','Painel operacional')
      ],
      sindico: [
        action('moradores','🏢','Moradores','Cadastro e consulta'),
        action('usuarios','👥','Usuários','Perfis e senhas'),
        action('comunicados','📣','Novo comunicado','Prazo de visibilidade'),
        action('emergencias','🛟','Emergências','Confirmar, avisar, resetar'),
        action('configuracoes','⚙️','Configurações','Atualização e nuvem'),
        action('backups','💾','Backup','Exportar e restaurar')
      ],
      subsindico: [
        action('moradores','🏢','Moradores','Cadastro e consulta'),
        action('comunicados','📣','Comunicados','Gerenciar avisos'),
        action('encomendas','📦','Encomendas','Acompanhar entregas'),
        action('emergencias','🛟','Emergências','Central de alarme'),
        action('backups','💾','Backup','Gerar cópia')
      ],
      admin: [
        action('premium','⭐','Central premium','Diagnóstico e prontidão'),
        action('configuracoes','⚙️','Configurações','Atualização do sistema'),
        action('backups','💾','Backup e rollback','Exportar/restaurar'),
        action('usuarios','👥','Usuários','Permissões e senhas'),
        action('moradores','🏢','Moradores','Base cadastral'),
        action('emergencias','🛟','Emergências','Reset e auditoria')
      ]
    };
    const actions = actionSets[user.role] || actionSets.morador;
    return `
      <section class="hero">
        <div class="hero-inner">
          <div>
            <div class="chip">🏢 ${escapeHtml(s.settings.condominiumName)}</div>
            <h1>${greeting()}, ${escapeHtml(firstName(user.name || user.username))}.</h1>
            <p>Dashboard premium, compacto e responsivo. Acesse as principais funções do seu perfil sem poluição visual.</p>
            <div class="hero-chips"><span class="chip">👤 ${escapeHtml(roleLabels[user.role] || user.role)}</span><span class="chip">🔔 ${visibleNotices.length} avisos ativos</span><span class="chip">${VERSION_LABEL}</span></div>
          </div>
          <div class="hero-panel"><strong>Atalhos inteligentes</strong><p>As opções abaixo são clicáveis e mudam conforme o perfil.</p></div>
        </div>
      </section>
      <div class="grid cols-4" style="margin-bottom:16px">
        ${kpi('encomendas', pkgRows.length, user.role === 'morador' ? 'Minhas encomendas' : 'Encomendas', 'clicável')}
        ${kpi('visitantes', visibleVisitorsFor(user, s.visitors).length, 'Visitantes', 'clicável')}
        ${kpi('reservas', visibleBookingsFor(user, s.bookings).length, 'Reservas', 'clicável')}
        ${kpi('emergencias', openEmergencies.length, 'Emergências abertas', 'clicável')}
      </div>
      <section class="card"><div class="section-title"><h3>Ações rápidas</h3><span class="badge ok">Perfil reconhecido por login</span></div><div class="action-grid">${actions.join('')}</div></section>
      <div class="grid cols-2" style="margin-top:16px">
        <section class="card"><div class="section-title"><h3>Comunicados ativos</h3><button class="btn ghost small" data-page="comunicados">Ver todos</button></div>${noticeCards(visibleNotices.slice(0,3), user)}</section>
        <section class="card"><div class="section-title"><h3>Últimas atividades</h3><button class="btn ghost small" data-page="backups">Backup</button></div>${activityList(s.logs.slice(0,5))}</section>
      </div>`;
  }

  function table(rows, columns, rowActions) {
    if (!rows.length) return '<p class="note">Nenhum registro encontrado.</p>';
    return `<div class="table-wrap"><table><thead><tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}${rowActions ? '<th>Ações</th>' : ''}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${c.html ? c.html(row) : escapeHtml(typeof c.value === 'function' ? c.value(row) : row[c.value])}</td>`).join('')}${rowActions ? `<td>${rowActions(row)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  function moradores(user) {
    const s = loadStore();
    const rows = s.residents;
    return `<div class="grid cols-2">
      <section class="card"><div class="section-title"><h3>Cadastro de morador</h3><span class="badge">Login próprio</span></div><form id="residentForm" class="form-grid">
        <label class="field"><span>Nome</span><input name="name" required></label>
        <label class="field"><span>Unidade</span><input name="apartment" required placeholder="Ex.: 305 Bloco B"></label>
        <label class="field"><span>E-mail</span><input name="email" type="email"></label>
        <label class="field"><span>Telefone</span><input name="phone"></label>
        <label class="field"><span>Usuário de acesso</span><input name="username" placeholder="Ex.: bruno305"></label>
        <label class="field"><span>Senha</span><input name="password" type="password" placeholder="Senha do morador"></label>
        <button class="btn primary">Salvar morador</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Consulta de moradores</h3><span class="badge">${rows.length}</span></div>
        ${table(rows, [{label:'Nome',value:'name'}, {label:'Unidade',value:'apartment'}, {label:'Usuário',value:'username'}, {label:'Contato',value:r => r.phone || r.email || '-'}], row => `<div class="row-actions"><button class="btn ghost small" data-edit-resident="${row.id}">Editar</button></div>`)}
      </section>
    </div>`;
  }

  function usuarios() {
    const s = loadStore();
    return `<div class="grid cols-2">
      <section class="card"><div class="section-title"><h3>Cadastro de usuário</h3><span class="badge ok">Perfil por credencial</span></div><form id="userForm" class="form-grid">
        <label class="field"><span>Nome</span><input name="name" required></label>
        <label class="field"><span>Usuário</span><input name="username" required placeholder="Ex.: portaria01"></label>
        <label class="field"><span>E-mail</span><input name="email" type="email"></label>
        <label class="field"><span>Senha</span><input name="password" type="password" required></label>
        <label class="field"><span>Perfil</span><select name="role"><option value="portaria">Portaria</option><option value="sindico">Síndico</option><option value="subsindico">Subsíndico</option><option value="admin">Administrador</option><option value="morador">Morador</option></select></label>
        <button class="btn primary">Salvar usuário</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Consulta de usuários</h3><span class="badge">${s.users.length}</span></div>
        ${table(s.users, [{label:'Nome',value:'name'}, {label:'Usuário',value:'username'}, {label:'Perfil',value:r => roleLabels[normalizeRole(r.role)] || r.role}, {label:'Ativo',value:r => r.active === false ? 'Não' : 'Sim'}], row => `<div class="row-actions"><button class="btn ghost small" data-toggle-user="${row.id}">${row.active === false ? 'Ativar' : 'Desativar'}</button></div>`)}
      </section>
    </div>`;
  }

  function visiblePackagesFor(user, rows) {
    if (user.role === 'morador' && user.apartment) return rows.filter(p => String(p.apartment || '').toLowerCase() === String(user.apartment).toLowerCase());
    return rows;
  }
  function visibleVisitorsFor(user, rows) {
    if (user.role === 'morador' && user.apartment) return rows.filter(v => String(v.apartment || '').toLowerCase() === String(user.apartment).toLowerCase());
    return rows;
  }
  function visibleBookingsFor(user, rows) {
    if (user.role === 'morador' && user.apartment) return rows.filter(b => String(b.apartment || '').toLowerCase() === String(user.apartment).toLowerCase());
    return rows;
  }

  function imgCell(file) { return file ? `<img class="thumb" src="${escapeHtml(file.dataUrl || file.url)}" alt="Imagem">` : '-'; }

  function encomendas(user) {
    const s = loadStore();
    const rows = visiblePackagesFor(user, s.packages);
    const canRegister = ['portaria','sindico','subsindico','admin'].includes(user.role);
    return `<div class="grid ${canRegister ? 'cols-2' : ''}">
      ${canRegister ? `<section class="card"><div class="section-title"><h3>Registrar encomenda</h3><span class="badge">Imagem na nuvem</span></div><form id="packageForm" class="form-grid">
        <label class="field"><span>Unidade</span><input name="apartment" required></label>
        <label class="field"><span>Destinatário</span><input name="recipient" required></label>
        <label class="field"><span>Descrição</span><input name="description" placeholder="Sedex, mercado, envelope..."></label>
        <label class="field"><span>Foto da encomenda</span><input name="image" type="file" accept="image/*"></label>
        <button class="btn primary">Registrar e notificar</button>
      </form></section>` : ''}
      <section class="card"><div class="section-title"><h3>${user.role === 'morador' ? 'Minhas encomendas' : 'Consulta de encomendas'}</h3><span class="badge">${rows.length}</span></div>
        ${table(rows, [{label:'Foto',html:r=>imgCell(r.image)}, {label:'Unidade',value:'apartment'}, {label:'Destinatário',value:'recipient'}, {label:'Descrição',value:'description'}, {label:'Status',value:r=>r.status || 'pendente'}, {label:'Data',value:r=>formatDate(r.createdAt)}], row => `<div class="row-actions"><button class="btn ghost small" data-notify-package="${row.id}">Enviar imagem</button><button class="btn ok small" data-deliver-package="${row.id}">Entregue</button></div>`)}
      </section>
    </div>`;
  }

  function visitantes(user) {
    const s = loadStore();
    const rows = visibleVisitorsFor(user, s.visitors);
    const canRegister = ['morador','portaria','sindico','subsindico','admin'].includes(user.role);
    return `<div class="grid ${canRegister ? 'cols-2' : ''}">
      <section class="card"><div class="section-title"><h3>Cadastrar visitante</h3><span class="badge">Com imagem</span></div><form id="visitorForm" class="form-grid">
        <label class="field"><span>Nome</span><input name="name" required></label>
        <label class="field"><span>Documento/placa</span><input name="document"></label>
        <label class="field"><span>Unidade</span><input name="apartment" value="${escapeHtml(user.role === 'morador' ? (user.apartment || '') : '')}" required></label>
        <label class="field"><span>Tipo</span><select name="recurring"><option value="Não">Visitante pontual</option><option value="Sim">Visitante recorrente</option></select></label>
        <label class="field"><span>Foto/documento</span><input name="image" type="file" accept="image/*"></label>
        <button class="btn primary">Salvar visitante</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Consulta de visitantes</h3><span class="badge">${rows.length}</span></div>
        ${table(rows, [{label:'Foto',html:r=>imgCell(r.image)}, {label:'Nome',value:'name'}, {label:'Documento',value:'document'}, {label:'Unidade',value:'apartment'}, {label:'Recorrente',value:'recurring'}, {label:'Data',value:r=>formatDate(r.createdAt)}], row => `<div class="row-actions"><button class="btn ghost small" data-notify-visitor="${row.id}">Enviar imagem</button></div>`)}
      </section>
    </div>`;
  }

  function reservas(user) {
    const s = loadStore();
    const rows = visibleBookingsFor(user, s.bookings);
    return `<div class="grid cols-2"><section class="card"><div class="section-title"><h3>Solicitar reserva</h3><span class="badge">Área comum</span></div><form id="bookingForm" class="form-grid">
      <label class="field"><span>Área</span><select name="space"><option>Salão de festas</option><option>Churrasqueira</option><option>Espaço gourmet</option><option>Quadra</option><option>Piscina</option></select></label>
      <label class="field"><span>Data e hora</span><input name="date" type="datetime-local" required></label>
      <label class="field"><span>Unidade</span><input name="apartment" value="${escapeHtml(user.apartment || '')}" required></label>
      <label class="field"><span>Observação</span><textarea name="note" placeholder="Detalhes da reserva"></textarea></label>
      <button class="btn primary">Solicitar reserva</button>
    </form></section><section class="card"><div class="section-title"><h3>Reservas</h3><span class="badge">${rows.length}</span></div>
      ${table(rows, [{label:'Área',value:'space'}, {label:'Unidade',value:'apartment'}, {label:'Status',value:r=>r.status || 'solicitada'}, {label:'Data',value:r=>formatDate(r.date)}], row => `<div class="row-actions"><button class="btn ok small" data-approve-booking="${row.id}">Aprovar</button></div>`)}
    </section></div>`;
  }

  function noticeCards(rows, user) {
    if (!rows.length) return '<p class="note">Nenhum comunicado ativo.</p>';
    return `<div class="grid">${rows.map(n => `<article class="notice-card ${isVisibleNotice(n) ? '' : 'expired'}"><div class="section-title"><h3>${escapeHtml(n.title)}</h3><span class="badge ${isVisibleNotice(n) ? 'ok' : 'warn'}">${isVisibleNotice(n) ? 'ativo' : 'expirado'}</span></div><p>${escapeHtml(n.body)}</p><div class="notice-meta"><span class="badge">${escapeHtml(n.audience || 'Todos')}</span>${n.apartment ? `<span class="badge">Unidade ${escapeHtml(n.apartment)}</span>` : ''}<span class="badge">até ${escapeHtml(formatDate(n.visibleUntil))}</span></div></article>`).join('')}</div>`;
  }

  function comunicados(user) {
    const s = loadStore();
    const canPost = ['portaria','sindico','subsindico','admin'].includes(user.role);
    const notices = ['sindico','subsindico','admin','portaria'].includes(user.role) ? s.notices : s.notices.filter(n => isVisibleNotice(n) && (n.audience === 'Todos' || !n.audience || (n.audience === 'Unidade específica' && String(n.apartment || '').toLowerCase() === String(user.apartment || '').toLowerCase())));
    return `<div class="grid ${canPost ? 'cols-2' : ''}">
      ${canPost ? `<section class="card"><div class="section-title"><h3>Novo comunicado</h3><span class="badge">Prazo configurável</span></div><form id="noticeForm" class="form-grid">
        <label class="field"><span>Título</span><input name="title" required></label>
        <label class="field"><span>Destinatário</span><select name="audience"><option>Todos</option><option>Unidade específica</option><option>Portaria</option><option>Síndico/Administração</option></select></label>
        <label class="field"><span>Unidade, se específico</span><input name="apartment"></label>
        <label class="field"><span>Visível até</span><input name="visibleUntil" type="datetime-local" value="${todayInputPlus(s.settings.defaultNoticeDays)}"></label>
        <label class="field"><span>Mensagem</span><textarea name="body" required></textarea></label>
        <button class="btn primary">Publicar e notificar</button>
      </form></section>` : ''}
      <section class="card"><div class="section-title"><h3>Comunicados</h3><span class="badge">${notices.length}</span></div>${noticeCards(notices, user)}</section>
    </div>`;
  }

  function emergencias(user) {
    const s = loadStore();
    const rows = s.emergencies;
    return `<section class="card"><div class="section-title"><h3>Central de emergências</h3><button class="btn danger small" data-open-emergency>Acionar emergência</button></div>
      <p class="note">O morador aciona. Síndico ou portaria confirmam. Só depois os moradores são avisados. O alarme pode ser resetado por síndico ou portaria.</p>
      ${table(rows, [{label:'Tipo',value:'type'}, {label:'Unidade',value:'apartment'}, {label:'Relato',value:'description'}, {label:'Status',value:'status'}, {label:'Data',value:r=>formatDate(r.createdAt)}], row => `<div class="row-actions"><button class="btn ok small" data-confirm-emergency="${row.id}">Confirmar</button><button class="btn warn small" data-reset-emergency="${row.id}">Resetar</button><button class="btn ghost small" data-resolve-emergency="${row.id}">Resolver</button></div>`)}
    </section>`;
  }

  function premium() {
    const s = loadStore();
    return `<div class="grid cols-3"><section class="card kpi"><strong>96%</strong><span>Layout premium</span></section><section class="card kpi"><strong>${VERSION_LABEL}</strong><span>Versão atual</span></section><section class="card kpi"><strong>${s.cloudFiles.length}</strong><span>Imagens salvas</span></section></div>
      <section class="card" style="margin-top:16px"><div class="section-title"><h3>Central premium</h3><button class="btn primary small" id="runReadiness">Rodar diagnóstico</button></div><div id="readinessResult" class="note">Diagnóstico de mercado, arquivos críticos, backup, atualização e rotas principais.</div></section>`;
  }

  function configuracoes(user) {
    const s = loadStore();
    return `<div class="grid cols-2">
      <section class="card"><div class="section-title"><h3>Configurações visuais</h3><span class="badge">${VERSION_LABEL}</span></div><form id="settingsForm" class="form-grid">
        <label class="field"><span>Nome do condomínio</span><input name="condominiumName" value="${escapeHtml(s.settings.condominiumName)}"></label>
        <label class="field"><span>Imagem de fundo do prédio</span><input name="buildingBackground" value="${escapeHtml(s.settings.buildingBackground)}" placeholder="URL ou assets/building-bg.svg"></label>
        <label class="field"><span>Dias padrão de comunicado visível</span><input name="defaultNoticeDays" type="number" min="1" max="365" value="${escapeHtml(s.settings.defaultNoticeDays)}"></label>
        <button class="btn primary">Salvar configurações</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Atualização do sistema</h3><span class="badge ok">Admin</span></div><p class="note">Para segurança, o navegador não substitui arquivos diretamente no servidor. A central registra a atualização, gera backup e pode acionar deploy se o hook do Render estiver configurado.</p><form id="updateForm" class="form-grid">
        <label class="field"><span>Arquivo ZIP da atualização</span><input name="updateZip" type="file" accept=".zip"></label>
        <label class="field"><span>Deploy Hook do Render, opcional</span><input name="renderDeployHook" value="${escapeHtml(s.settings.renderDeployHook)}" placeholder="https://api.render.com/deploy/..." /></label>
        <button class="btn primary">Registrar atualização</button>
        <button class="btn secondary" type="button" id="triggerDeploy">Acionar deploy</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Nuvem de imagens</h3><span class="badge">${escapeHtml(s.settings.cloudMode)}</span></div><form id="cloudForm" class="form-grid">
        <label class="field"><span>Modo de armazenamento</span><select name="cloudMode"><option value="local" ${s.settings.cloudMode==='local'?'selected':''}>Local/backup do sistema</option><option value="cloudinary" ${s.settings.cloudMode==='cloudinary'?'selected':''}>Cloudinary/API externa</option></select></label>
        <label class="field"><span>Nome/identificador da nuvem</span><input name="cloudName" value="${escapeHtml(s.settings.cloudName)}" placeholder="Ex.: vitoria-regia"></label>
        <p class="note">As fotos de encomendas e visitantes já são salvas no sistema e vinculadas às notificações. Para nuvem real, configure o provedor no backend.</p>
        <button class="btn primary">Salvar nuvem</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Segurança</h3><span class="badge warn">Acesso</span></div><p class="note">A tela inicial não exibe nome, unidade nem usuário administrador. O perfil é identificado pelo login e senha cadastrados em Usuários ou Moradores.</p><button class="btn ghost" id="lockFirstAccess">Bloquear criação automática de primeiro admin</button></section>
    </div>`;
  }

  function backups() {
    const s = loadStore();
    return `<div class="grid cols-2">
      <section class="card"><div class="section-title"><h3>Backup do sistema</h3><span class="badge ok">Recomendado</span></div><p class="note">Exporte uma cópia completa de moradores, usuários, imagens, avisos, emergências e configurações.</p><div class="grid"><button class="btn primary" id="exportBackup">Baixar backup JSON</button><label class="field"><span>Restaurar backup</span><input id="restoreBackupFile" type="file" accept="application/json,.json"></label><button class="btn warn" id="restoreBackup">Voltar backup</button></div></section>
      <section class="card"><div class="section-title"><h3>Histórico</h3><span class="badge">${s.logs.length}</span></div>${activityList(s.logs.slice(0,12))}</section>
    </div>`;
  }

  function activityList(rows) {
    if (!rows.length) return '<p class="note">Sem atividades registradas.</p>';
    return `<div class="grid">${rows.map(l => `<div class="notice-card"><strong>${escapeHtml(l.message || l.type)}</strong><div class="notice-meta"><span class="badge">${escapeHtml(l.type || 'log')}</span><span class="badge">${escapeHtml(formatDate(l.createdAt))}</span></div></div>`).join('')}</div>`;
  }

  async function fileToDataUrl(file) {
    if (!file || !file.size) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function cloudSaveImage(file, type, refId) {
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) return null;
    const store = loadStore();
    const item = { id: id('file'), type, refId, name: file.name, mime: file.type, size: file.size, dataUrl, url: dataUrl, createdAt: now() };
    store.cloudFiles.unshift(item);
    saveStore(store);
    try {
      await fetch('/api/uploads', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(item) });
    } catch (_) {}
    return item;
  }

  function bindCommonActions(page, user) {
    document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
    document.querySelectorAll('[data-open-emergency]').forEach(btn => btn.addEventListener('click', () => openEmergencyModal(user)));

    document.querySelectorAll('[data-toggle-user]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore(); const row = s.users.find(u => u.id === btn.dataset.toggleUser); if (!row) return;
      row.active = row.active === false;
      logAction('usuarios', `${row.active === false ? 'Desativou' : 'Ativou'} usuário ${row.username || row.name}.`);
      saveStore(s); renderApp(page);
    }));

    document.querySelectorAll('[data-deliver-package]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore(); const row = s.packages.find(p => p.id === btn.dataset.deliverPackage); if (!row) return;
      row.status = 'entregue'; row.deliveredAt = now();
      addNotification(s, 'Encomenda entregue', `A encomenda da unidade ${row.apartment} foi marcada como entregue.`, row.apartment, row.image);
      logAction('encomendas', `Encomenda entregue para unidade ${row.apartment}.`); saveStore(s); renderApp(page);
    }));

    document.querySelectorAll('[data-notify-package]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore(); const row = s.packages.find(p => p.id === btn.dataset.notifyPackage); if (!row) return;
      addNotification(s, 'Imagem da encomenda', `Imagem disponível para encomenda da unidade ${row.apartment}.`, row.apartment, row.image);
      notifyBrowser('Imagem da encomenda', `Unidade ${row.apartment}`, row.image); saveStore(s); toast('Imagem enviada por notificação.');
    }));

    document.querySelectorAll('[data-notify-visitor]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore(); const row = s.visitors.find(v => v.id === btn.dataset.notifyVisitor); if (!row) return;
      addNotification(s, 'Imagem de visitante', `Imagem disponível para visitante ${row.name}, unidade ${row.apartment}.`, row.apartment, row.image);
      notifyBrowser('Imagem de visitante', `${row.name} • Unidade ${row.apartment}`, row.image); saveStore(s); toast('Imagem enviada por notificação.');
    }));

    document.querySelectorAll('[data-confirm-emergency]').forEach(btn => btn.addEventListener('click', () => setEmergencyStatus(btn.dataset.confirmEmergency, 'confirmado e moradores notificados', true)));
    document.querySelectorAll('[data-reset-emergency]').forEach(btn => btn.addEventListener('click', () => setEmergencyStatus(btn.dataset.resetEmergency, 'resetado', false)));
    document.querySelectorAll('[data-resolve-emergency]').forEach(btn => btn.addEventListener('click', () => setEmergencyStatus(btn.dataset.resolveEmergency, 'resolvido', false)));

    document.getElementById('runReadiness')?.addEventListener('click', async () => {
      const target = document.getElementById('readinessResult');
      target.textContent = 'Rodando diagnóstico...';
      try { const r = await fetch('/api/admin/market-readiness'); target.innerHTML = `<pre>${escapeHtml(JSON.stringify(await r.json(), null, 2))}</pre>`; }
      catch (e) { target.textContent = 'Backend indisponível. O frontend está funcionando em modo local.'; }
    });

    document.getElementById('exportBackup')?.addEventListener('click', exportBackup);
    document.getElementById('restoreBackup')?.addEventListener('click', restoreBackup);
    document.getElementById('triggerDeploy')?.addEventListener('click', triggerDeploy);
    document.getElementById('lockFirstAccess')?.addEventListener('click', () => { const s = loadStore(); s.settings.allowFirstAccessAdmin = false; saveStore(s); toast('Primeiro acesso automático bloqueado.'); });
  }

  async function bindForms(page, user) {
    const residentsForm = document.getElementById('residentForm');
    residentsForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); s.residents.unshift({ id:id('resident'), role:'morador', active:true, ...d, createdAt:now() }); logAction('moradores', `Morador ${d.name} cadastrado.`); saveStore(s); toast('Morador salvo.'); renderApp('moradores'); });

    const userForm = document.getElementById('userForm');
    userForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); s.users.unshift({ id:id('user'), active:true, ...d, role:normalizeRole(d.role), createdAt:now() }); logAction('usuarios', `Usuário ${d.username} cadastrado.`); saveStore(s); toast('Usuário salvo.'); renderApp('usuarios'); });

    const packageForm = document.getElementById('packageForm');
    packageForm?.addEventListener('submit', async ev => {
      ev.preventDefault(); const fd = new FormData(ev.currentTarget); const d = Object.fromEntries(fd.entries()); const s = loadStore(); const itemId = id('package');
      const image = await cloudSaveImage(fd.get('image'), 'package', itemId);
      const item = { id:itemId, status:'pendente', ...d, image, createdAt:now() };
      s.packages.unshift(item); addNotification(s, 'Nova encomenda', `Encomenda registrada para unidade ${d.apartment}.`, d.apartment, image); logAction('encomendas', `Encomenda registrada para unidade ${d.apartment}.`); saveStore(s); notifyBrowser('Nova encomenda', `Unidade ${d.apartment}`, image); toast('Encomenda registrada e notificada.'); renderApp('encomendas');
    });

    const visitorForm = document.getElementById('visitorForm');
    visitorForm?.addEventListener('submit', async ev => {
      ev.preventDefault(); const fd = new FormData(ev.currentTarget); const d = Object.fromEntries(fd.entries()); const s = loadStore(); const itemId = id('visitor');
      const image = await cloudSaveImage(fd.get('image'), 'visitor', itemId);
      const item = { id:itemId, ...d, image, createdAt:now() };
      s.visitors.unshift(item); if (d.recurring === 'Sim') s.recurringVisitors.unshift(item);
      addNotification(s, 'Visitante cadastrado', `${d.name} cadastrado para unidade ${d.apartment}.`, d.apartment, image); logAction('visitantes', `Visitante ${d.name} cadastrado.`); saveStore(s); notifyBrowser('Visitante cadastrado', `${d.name} • Unidade ${d.apartment}`, image); toast('Visitante salvo.'); renderApp('visitantes');
    });

    const bookingForm = document.getElementById('bookingForm');
    bookingForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); s.bookings.unshift({ id:id('booking'), status:'solicitada', requester:user.name, ...d, createdAt:now() }); addNotification(s, 'Reserva solicitada', `${d.space} para unidade ${d.apartment}.`, d.apartment); logAction('reservas', `Reserva solicitada para ${d.space}.`); saveStore(s); toast('Reserva solicitada.'); renderApp('reservas'); });

    const noticeForm = document.getElementById('noticeForm');
    noticeForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); s.notices.unshift({ id:id('notice'), author:user.name, ...d, createdAt:now() }); addNotification(s, d.title, d.body, d.apartment || 'Todos'); logAction('comunicados', `Comunicado publicado: ${d.title}.`); saveStore(s); notifyBrowser(d.title, d.body); toast('Comunicado publicado.'); renderApp('comunicados'); });

    const settingsForm = document.getElementById('settingsForm');
    settingsForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); Object.assign(s.settings, d, { defaultNoticeDays: Number(d.defaultNoticeDays || 7) }); logAction('configuracoes', 'Configurações visuais atualizadas.'); saveStore(s); toast('Configurações salvas.'); renderApp('configuracoes'); });

    const cloudForm = document.getElementById('cloudForm');
    cloudForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); Object.assign(s.settings, d); logAction('configuracoes', `Nuvem configurada em modo ${d.cloudMode}.`); saveStore(s); toast('Configuração de nuvem salva.'); renderApp('configuracoes'); });

    const updateForm = document.getElementById('updateForm');
    updateForm?.addEventListener('submit', async ev => {
      ev.preventDefault(); const fd = new FormData(ev.currentTarget); const file = fd.get('updateZip'); const s = loadStore();
      s.settings.renderDeployHook = fd.get('renderDeployHook') || s.settings.renderDeployHook;
      const request = { id:id('update'), fileName:file && file.name ? file.name : 'sem arquivo', status:'registrado', version:VERSION_LABEL, createdAt:now() };
      s.updateRequests.unshift(request); logAction('atualizacoes', `Atualização registrada: ${request.fileName}.`); saveStore(s);
      try { await fetch('/api/admin/update/request', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(request) }); } catch (_) {}
      toast('Atualização registrada. Gere backup antes de aplicar no servidor.'); renderApp('configuracoes');
    });
  }

  function addNotification(store, title, body, apartment = 'Todos', image = null) {
    store.notifications.unshift({ id:id('notif'), title, body, apartment, image, read:false, createdAt:now() });
  }

  function notifyBrowser(title, body, image) {
    if (!('Notification' in window)) return;
    const options = { body: body || 'Novo aviso do condomínio.' };
    if (image && (image.url || image.dataUrl)) options.image = image.url || image.dataUrl;
    if (Notification.permission === 'granted') new Notification(title || 'Vitória Régia', options);
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title || 'Vitória Régia', options); });
  }

  function setEmergencyStatus(emergencyId, status, notifyResidents) {
    const s = loadStore(); const row = s.emergencies.find(e => e.id === emergencyId); if (!row) return;
    row.status = status; row.updatedAt = now();
    if (notifyResidents) addNotification(s, 'Emergência confirmada', `${row.type} - ${row.apartment}. Siga as orientações da administração.`, 'Todos');
    logAction('emergencias', `Emergência ${row.type} alterada para ${status}.`);
    saveStore(s); notifyBrowser('Emergência', `${row.type} • ${status}`); toast(`Emergência: ${status}.`); renderApp('emergencias');
  }

  function clearEmergencyFloat() {
    document.getElementById('emergencyFloat')?.remove();
    removeDuplicatePanicButtons();
  }

  function injectEmergencyFloat(user) {
    clearEmergencyFloat();
    const btn = document.createElement('button');
    btn.id = 'emergencyFloat';
    btn.className = 'emergency-float pulse';
    btn.title = 'Emergência';
    btn.setAttribute('aria-label', 'Abrir emergência');
    btn.innerHTML = '<span>🚨</span>';
    btn.addEventListener('click', () => openEmergencyModal(user));
    document.body.appendChild(btn);
  }

  function openEmergencyModal(user) {
    removeDuplicatePanicButtons();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal"><div class="modal-head"><h3>🚨 Emergência</h3><button class="close" type="button">×</button></div><p class="note">O alerta vai primeiro para síndico e portaria. Moradores só serão notificados depois da confirmação.</p><form id="emergencyForm" class="form-grid"><label class="field"><span>Tipo</span><select name="type"><option>Incêndio</option><option>Emergência médica</option><option>Violência ou invasão</option><option>Vazamento de gás</option><option>Pane elétrica</option><option>Outro risco</option></select></label><label class="field"><span>Unidade/local</span><input name="apartment" value="${escapeHtml(user.apartment || '')}" required></label><label class="field"><span>Descrição breve</span><textarea name="description" placeholder="Descreva o que está acontecendo"></textarea></label><button class="btn danger">Enviar para síndico e portaria</button><p class="note">Em risco imediato à vida, acione também os serviços oficiais de emergência.</p></form></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('.close').onclick = () => wrap.remove();
    wrap.addEventListener('click', ev => { if (ev.target === wrap) wrap.remove(); });
    wrap.querySelector('#emergencyForm').addEventListener('submit', ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore();
      const item = { id:id('panic'), reporter:user.name || user.username, reporterRole:user.role, status:'aguardando confirmação', ...d, createdAt:now() };
      s.emergencies.unshift(item); addNotification(s, 'Emergência aguardando confirmação', `${item.type} - ${item.apartment}.`, 'Portaria/Síndico'); logAction('emergencias', `Emergência acionada: ${item.type}.`); saveStore(s);
      fetch('/api/panic', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item) }).catch(() => {});
      notifyBrowser('Emergência acionada', `${item.type} - ${item.apartment}`); wrap.remove(); toast('Alerta enviado para síndico e portaria.'); renderApp('dashboard');
    });
  }

  function exportBackup() {
    const store = loadStore();
    const blob = new Blob([JSON.stringify(store, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `vitoriaregia_backup_${VERSION}_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    logAction('backup', 'Backup exportado.'); toast('Backup gerado.');
  }

  async function restoreBackup() {
    const input = document.getElementById('restoreBackupFile');
    const file = input && input.files && input.files[0];
    if (!file) return toast('Selecione um arquivo de backup.');
    if (!confirm('Deseja restaurar este backup? Os dados atuais serão substituídos.')) return;
    try {
      const text = await file.text(); const parsed = JSON.parse(text);
      const restored = saveStore(mergeStore(parsed));
      logAction('backup', `Backup restaurado: ${file.name}.`); saveStore(restored); toast('Backup restaurado.'); renderApp('dashboard');
    } catch (e) { toast('Backup inválido.'); }
  }

  async function triggerDeploy() {
    const s = loadStore();
    const hook = s.settings.renderDeployHook;
    if (!hook) return toast('Configure o Deploy Hook do Render primeiro.');
    if (!confirm('Acionar deploy no Render agora?')) return;
    try { await fetch(hook, { method:'POST', mode:'no-cors' }); logAction('atualizacoes', 'Deploy hook acionado.'); saveStore(s); toast('Deploy acionado.'); }
    catch (_) { toast('Não foi possível acionar o deploy.'); }
  }

  window.addEventListener('hashchange', () => renderApp(location.hash.replace('#','') || 'dashboard'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  getSession() ? renderApp(location.hash.replace('#','') || 'dashboard') : renderLogin();
})();
