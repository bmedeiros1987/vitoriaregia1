(function () {
  'use strict';

  const VERSION = '3.5.0-mysql';
  const VERSION_LABEL = `v${VERSION}`;
  const STORE_KEY = 'vitoriaRegiaStore.v350';
  const SESSION_KEY = 'currentUser';
  const LEGACY_KEYS = ['vitoriaRegiaStore.v340', 'vitoriaRegiaStore.v330', 'vitoriaRegiaStore.v320', 'vitoriaRegiaStore.v3'];
  const app = document.getElementById('app');

  const roleLabels = {
    morador: 'Morador',
    portaria: 'Portaria',
    porteiro: 'Portaria',
    sindico: 'Síndico',
    subsindico: 'Subsíndico',
    admin: 'Administrador',
    owner: 'Proprietário do sistema'
  };

  const pageMap = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'moradores', icon: '🏢', label: 'Moradores', roles: ['sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'usuarios', icon: '👥', label: 'Usuários', roles: ['sindico', 'admin', 'owner'] },
    { id: 'aprovacoes', icon: '✅', label: 'Aprovações', roles: ['sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'encomendas', icon: '📦', label: 'Encomendas', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'visitantes', icon: '🪪', label: 'Visitantes', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'reservas', icon: '📅', label: 'Reservas', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'comunicados', icon: '📣', label: 'Comunicados', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'financeiro', icon: '💳', label: 'Financeiro', roles: ['morador', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'ajuda', icon: '❔', label: 'Ajuda', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'aplicativos', icon: '📱', label: 'Aplicativos', roles: ['morador', 'portaria', 'sindico', 'subsindico', 'admin', 'owner'] },
    { id: 'emergencias', icon: '🛟', label: 'Emergências', roles: ['portaria', 'sindico', 'subsindico', 'admin'] },
    { id: 'premium', icon: '⭐', label: 'Central premium', roles: ['admin', 'owner'] },
    { id: 'configuracoes', icon: '⚙️', label: 'Configurações', roles: ['sindico', 'admin', 'owner'] },
    { id: 'backups', icon: '💾', label: 'Backup', roles: ['sindico', 'admin', 'owner'] }
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
      allowFirstAccessAdmin: true,
      systemEdition: 'Premium Condomínio',
      licenseOwner: 'Bruno Saraiva',
      temporaryPasswordLength: 6,
      supportContact: { email: 'bmedeiros1987@gmail.com', whatsapp: '5561996071663', showPublicData: false },
      systemCredit: 'Desenvolvido em parceria por Bruno Saraiva e ChatGPT.',
      finance: { defaultCondoFee: 0, dueDay: 10, currency: 'BRL', showResidentsOwnCharges: true },
      notificationChannels: {
        email: { enabled: true, senderName: 'Condomínio Vitória Régia', senderEmail: '', replyTo: '' },
        whatsapp: { enabled: false, defaultNumber: '', sendImages: true },
        telegram: { enabled: false, botToken: '', chatId: '', allowResidentReplies: true, emergencyButton: true, ifoodCodeButton: true, elevatorDeliveryButton: true }
      },
      autoUnits: { enabled: true, firstFloor: 1, lastFloor: 11, unitsPerFloor: 3, example: '101 a 1103' },
      profilePermissions: {
        morador: { dashboard:true, encomendas:true, visitantes:true, reservas:true, comunicados:true, financeiro:true, aplicativos:true },
        portaria: { dashboard:true, encomendas:true, visitantes:true, comunicados:true, aplicativos:true, emergencias:true },
        subsindico: { dashboard:true, moradores:true, encomendas:true, visitantes:true, reservas:true, comunicados:true, financeiro:true, aplicativos:true, emergencias:true, backups:true }
      }
    },
    users: [
      { id:'owner-default', name:'Proprietário do sistema', username:'admin', email:'', password:'admin123', role:'owner', active:true, forcePasswordChange:true, createdAt:new Date().toISOString() },
      { id:'sindico-default', name:'Síndico provisório', username:'sindico', email:'', password:'sindico123', role:'sindico', active:true, temporary:true, forcePasswordChange:true, createdAt:new Date().toISOString() }
    ],
    residents: [],
    packages: [],
    visitors: [],
    recurringVisitors: [],
    bookings: [],
    financeTransactions: [],
    financeCharges: [],
    financeCategories: [
      'Condomínio', 'Água', 'Energia', 'Funcionários', 'Manutenção', 'Obras', 'Reserva', 'Multa', 'Outros'
    ],
    notices: [],
    emergencies: [],
    notifications: [],
    cloudFiles: [],
    pendingRegistrations: [],
    passwordResetRequests: [],
    appInstallRequests: [],
    units: [],
    notificationOutbox: [],
    updateRequests: [],
    backups: [],
    supportTickets: [],
    logs: []
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function now() { return new Date().toISOString(); }
  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
  function normalizeRole(value) {
    const raw = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (raw.includes('owner') || raw.includes('dono') || raw.includes('proprietario')) return 'owner';
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
  function money(value) {
    const n = Number(value || 0);
    try { return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); } catch (_) { return 'R$ ' + n.toFixed(2).replace('.', ','); }
  }
  function monthKey(value) {
    if (!value) return new Date().toISOString().slice(0,7);
    return String(value).slice(0,7);
  }
  function financeTotals(store) {
    const tx = store.financeTransactions || [];
    const charges = store.financeCharges || [];
    const income = tx.filter(t => t.type === 'receita').reduce((a,t)=>a+Number(t.amount||0),0);
    const expense = tx.filter(t => t.type === 'despesa').reduce((a,t)=>a+Number(t.amount||0),0);
    const pending = charges.filter(c => c.status !== 'pago').reduce((a,c)=>a+Number(c.amount||0),0);
    const paid = charges.filter(c => c.status === 'pago').reduce((a,c)=>a+Number(c.amount||0),0);
    return { income, expense, balance: income - expense + paid, pending, paid };
  }
  function visibleChargesFor(user, charges) {
    if (user.role === 'morador') return (charges || []).filter(c => String(c.apartment || '').toLowerCase() === String(user.apartment || '').toLowerCase());
    return charges || [];
  }
  function todayInputPlus(days) {
    const d = new Date(); d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 16);
  }
  function generateTempPassword(length = 6) {
    const digits = '23456789';
    let out = '';
    for (let i = 0; i < Number(length || 6); i++) out += digits[Math.floor(Math.random() * digits.length)];
    return out;
  }
  function findResidentByApartment(store, apartment) {
    const ap = String(apartment || '').toLowerCase().trim();
    if (!ap) return null;
    return (store.residents || []).find(r => String(r.apartment || '').toLowerCase().trim() === ap) || null;
  }
  function notificationRecipients(store, apartment) {
    const resident = findResidentByApartment(store, apartment);
    return { email: resident && resident.email, phone: resident && resident.phone, telegram: resident && resident.telegram, resident };
  }
  function buildMessage(title, body, apartment) {
    return `${title || 'Aviso do condomínio'}\n${body || ''}${apartment ? '\nUnidade: ' + apartment : ''}`.trim();
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
    for (const key of ['users','residents','packages','visitors','recurringVisitors','bookings','financeTransactions','financeCharges','financeCategories','notices','emergencies','notifications','cloudFiles','pendingRegistrations','passwordResetRequests','appInstallRequests','units','notificationOutbox','updateRequests','backups','supportTickets','logs']) {
      merged[key] = Array.isArray(merged[key]) ? merged[key] : [];
    }
    if (!merged.users.length && !merged.residents.length) {
      merged.users.push(
        { id:'owner-default', name:'Proprietário do sistema', username:'admin', email:'', password:'admin123', role:'owner', active:true, forcePasswordChange:true, createdAt:now() },
        { id:'sindico-default', name:'Síndico provisório', username:'sindico', email:'', password:'sindico123', role:'sindico', active:true, temporary:true, forcePasswordChange:true, createdAt:now() }
      );
    }
    const hasOwner = merged.users.some(u => ['owner','admin'].includes(normalizeRole(u.role)));
    if (!hasOwner) {
      merged.users.unshift({ id:'owner-repair', name:'Proprietário do sistema', username:'admin', email:'', password:'admin123', role:'owner', active:true, forcePasswordChange:true, recovered:true, createdAt:now() });
    }
    const hasSyndic = merged.users.some(u => ['sindico','subsindico'].includes(normalizeRole(u.role)));
    if (!hasSyndic) {
      merged.users.push({ id:'sindico-default', name:'Síndico provisório', username:'sindico', email:'', password:'sindico123', role:'sindico', active:true, temporary:true, forcePasswordChange:true, createdAt:now() });
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

  function findAccountByIdentifier(store, identifier) {
    const ident = String(identifier || '').trim().toLowerCase();
    if (!ident) return null;
    const pools = [store.users || [], store.residents || []];
    for (const pool of pools) {
      const account = pool.find(u => {
        if (u.active === false) return false;
        const ids = [u.username, u.email, u.name, u.apartment].filter(Boolean).map(v => String(v).trim().toLowerCase());
        return ids.includes(ident);
      });
      if (account) return account;
    }
    return null;
  }

  async function requestTemporaryPassword() {
    const identifier = prompt('Digite seu usuário, e-mail ou unidade para solicitar uma senha temporária:');
    if (!identifier) return;
    const s = loadStore();
    const account = findAccountByIdentifier(s, identifier);
    if (!account) {
      toast('Não encontrei esse cadastro. Solicite ajuda ao síndico ou à portaria.');
      return;
    }
    const temp = generateTempPassword(s.settings.temporaryPasswordLength || 6);
    account.password = temp;
    account.forcePasswordChange = true;
    const reset = { id:id('reset'), username:account.username || '', name:account.name || '', email:account.email || '', apartment:account.apartment || '', status:'senha temporária gerada', createdAt:now() };
    s.passwordResetRequests = s.passwordResetRequests || [];
    s.passwordResetRequests.unshift(reset);
    dispatchChannelNotification(s, { kind:'password-reset', title:'Senha temporária do Vitória Régia', body:`Sua senha temporária é ${temp}. Entre no sistema e altere a senha assim que possível.`, apartment:account.apartment || 'Todos', email:account.email, phone:account.phone });
    logAction('senha', `Senha temporária gerada para ${account.username || account.name || identifier}.`);
    saveStore(s);
    try { await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ identifier }) }); } catch (_) {}
    toast('Senha temporária registrada e encaminhada pelos canais configurados.', 'ok');
  }

  function generateUnitList(firstFloor = 1, lastFloor = 11, unitsPerFloor = 3) {
    const out = [];
    const start = Number(firstFloor || 1), end = Number(lastFloor || 11), per = Number(unitsPerFloor || 3);
    for (let floor = start; floor <= end; floor += 1) {
      for (let unit = 1; unit <= per; unit += 1) {
        const number = `${floor}${String(unit).padStart(2, '0')}`;
        out.push({ id:`unit-${number}`, apartment:number, floor, active:true, createdAt:now() });
      }
    }
    return out;
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
          <div class="login-tabs">
            <button class="active" type="button" data-login-tab="entrar">Entrar</button>
            <button type="button" data-login-tab="cadastro">Ainda não é cadastrado?</button>
          </div>
          <form id="loginForm" class="form-grid login-pane active" autocomplete="on" data-pane="entrar">
            <label class="field"><span>Usuário ou e-mail</span><input name="username" autocomplete="username" placeholder="Digite seu usuário" required /></label>
            <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required /></label>
            <button class="btn primary full" type="submit">Entrar</button>
            <button class="btn ghost full" type="button" id="forgotPasswordBtn">Esqueci minha senha</button>
            <p class="note">A tela inicial não mostra nome, unidade ou perfil. O perfil é reconhecido automaticamente pelo usuário e senha cadastrados.</p>
          </form>
          <form id="signupForm" class="form-grid login-pane" autocomplete="on" data-pane="cadastro">
            <label class="field"><span>Nome completo</span><input name="name" placeholder="Seu nome" required /></label>
            <label class="field"><span>Unidade</span><input name="apartment" placeholder="Ex.: 305 Bloco B" required /></label>
            <label class="field"><span>E-mail para receber a senha temporária</span><input name="email" type="email" placeholder="seuemail@exemplo.com" required /></label>
            <label class="field"><span>Telefone / WhatsApp</span><input name="phone" placeholder="(00) 00000-0000" /></label>
            <label class="field"><span>Usuário desejado</span><input name="username" placeholder="Ex.: bruno305" required /></label>
            <button class="btn primary full" type="submit">Solicitar cadastro</button>
            <p class="note">O cadastro ficará pendente até confirmação do síndico. Após a aprovação, você recebe uma senha temporária simples e aleatória.</p>
          </form>
          <p class="note">${VERSION_LABEL} • Vitória Régia</p>
        </section>
      </main>`;

    document.querySelectorAll('[data-login-tab]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('[data-login-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.login-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === btn.dataset.loginTab));
    }));

    document.getElementById('forgotPasswordBtn')?.addEventListener('click', requestTemporaryPassword);

    document.getElementById('signupForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.currentTarget).entries());
      const s = loadStore();
      const request = { id:id('pending'), ...data, role:'morador', status:'aguardando aprovação', createdAt:now() };
      s.pendingRegistrations.unshift(request);
      addNotification(s, 'Novo cadastro pendente', `${data.name} solicitou acesso para a unidade ${data.apartment}.`, 'Síndico/Administração');
      logAction('cadastro', `Cadastro pendente recebido: ${data.name}.`);
      saveStore(s);
      try { await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(request) }); } catch (_) {}
      toast('Cadastro enviado ao síndico para aprovação.', 'ok');
      ev.currentTarget.reset();
      document.querySelector('[data-login-tab="entrar"]').click();
    });

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

  function visiblePages(user) {
    const s = loadStore();
    const perms = (s.settings && s.settings.profilePermissions) || {};
    return pageMap.filter(p => {
      if (!can(user, p.roles)) return false;
      if (user.role === 'owner' || user.role === 'admin' || user.role === 'sindico') return true;
      const rolePerms = perms[user.role] || {};
      if (Object.keys(rolePerms).length) return rolePerms[p.id] === true;
      return true;
    });
  }
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
          <div class="footer-version">Vitória Régia ${VERSION_LABEL} • Desenvolvido em parceria por Bruno Saraiva e ChatGPT • ${escapeHtml(store.settings.condominiumName || 'Condomínio')}</div>
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
    const renderers = { dashboard, moradores, usuarios, aprovacoes, encomendas, visitantes, reservas, comunicados, financeiro, ajuda, aplicativos, emergencias, premium, configuracoes, backups };
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
        action('financeiro','💳','Meu financeiro','Taxas, recibos e pendências'),
        action('emergencias','🛟','Emergência','Acionamento discreto'),
        action('ajuda','❔','Ajuda','Manual e suporte')
      ],
      portaria: [
        action('encomendas','📦','Registrar encomenda','Nova entrega com foto'),
        action('visitantes','🪪','Cadastrar visitante','Entrada, saída e imagem'),
        action('comunicados','📣','Avisar morador','Aviso por unidade'),
        action('emergencias','🛟','Emergências','Confirmar ou resetar'),
        action('dashboard','🔎','Consulta rápida','Painel operacional'),
        action('ajuda','❔','Ajuda','Manual da portaria')
      ],
      sindico: [
        action('moradores','🏢','Moradores','Cadastro e consulta'),
        action('usuarios','👥','Usuários','Perfis e senhas'),
        action('comunicados','📣','Novo comunicado','Prazo de visibilidade'),
        action('financeiro','💳','Financeiro','Receitas, despesas e cobranças'),
        action('emergencias','🛟','Emergências','Confirmar, avisar, resetar'),
        action('configuracoes','⚙️','Configurações','Atualização e nuvem'),
        action('backups','💾','Backup','Exportar e restaurar'),
        action('ajuda','❔','Ajuda','Manuais e suporte')
      ],
      subsindico: [
        action('moradores','🏢','Moradores','Cadastro e consulta'),
        action('comunicados','📣','Comunicados','Gerenciar avisos'),
        action('encomendas','📦','Encomendas','Acompanhar entregas'),
        action('financeiro','💳','Financeiro','Acompanhar cobranças'),
        action('emergencias','🛟','Emergências','Central de alarme'),
        action('backups','💾','Backup','Gerar cópia'),
        action('ajuda','❔','Ajuda','Manuais e suporte')
      ],
      owner: [
        action('premium','⭐','Licença e versão','Controle de edição adquirida'),
        action('configuracoes','⚙️','Configurações avançadas','Canais, atualização e nuvem'),
        action('aprovacoes','✅','Aprovações','Liberar cadastros pendentes'),
        action('usuarios','👥','Perfis e permissões','Controlar o que cada perfil vê'),
        action('financeiro','💳','Financeiro','Cobranças, caixa e relatórios'),
        action('backups','💾','Backup e rollback','Exportar/restaurar sistema'),
        action('emergencias','🚨','Emergências','Reset e auditoria'),
        action('ajuda','❔','Ajuda','Manuais e contato')
      ],
      admin: [
        action('premium','⭐','Central premium','Diagnóstico e prontidão'),
        action('configuracoes','⚙️','Configurações','Atualização do sistema'),
        action('backups','💾','Backup e rollback','Exportar/restaurar'),
        action('usuarios','👥','Usuários','Permissões e senhas'),
        action('moradores','🏢','Moradores','Base cadastral'),
        action('financeiro','💳','Financeiro','Receitas e despesas'),
        action('emergencias','🛟','Emergências','Reset e auditoria'),
        action('ajuda','❔','Ajuda','Manuais e contato')
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
        ${['morador','sindico','subsindico','admin','owner'].includes(user.role) ? kpi('financeiro', money(financeTotals(s).pending), user.role === 'morador' ? 'Minhas pendências' : 'Financeiro pendente', 'clicável') : ''}
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
        <label class="field"><span>Perfil</span><select name="role"><option value="portaria">Portaria</option><option value="sindico">Síndico</option><option value="subsindico">Subsíndico</option><option value="admin">Administrador</option><option value="owner">Proprietário do sistema</option><option value="morador">Morador</option></select></label>
        <button class="btn primary">Salvar usuário</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Consulta de usuários</h3><span class="badge">${s.users.length}</span></div>
        ${table(s.users, [{label:'Nome',value:'name'}, {label:'Usuário',value:'username'}, {label:'Perfil',value:r => roleLabels[normalizeRole(r.role)] || r.role}, {label:'Ativo',value:r => r.active === false ? 'Não' : 'Sim'}], row => `<div class="row-actions"><button class="btn ghost small" data-toggle-user="${row.id}">${row.active === false ? 'Ativar' : 'Desativar'}</button></div>`)}
      </section>
      <section class="card full-span"><div class="section-title"><h3>Gerenciar perfil de usuários</h3><span class="badge">Permissões visuais</span></div>${permissionsEditor(s)}</section>
    </div>`;
  }

  function permissionsEditor(s) {
    const roles = ['morador','portaria','subsindico'];
    const pages = ['dashboard','encomendas','visitantes','reservas','comunicados','financeiro','ajuda','aplicativos','emergencias','moradores','usuarios','backups'];
    const perms = s.settings.profilePermissions || {};
    return `<form id="permissionsForm" class="permissions-grid">${roles.map(role => `<div class="permission-card"><h4>${escapeHtml(roleLabels[role] || role)}</h4>${pages.map(page => `<label><input type="checkbox" name="${role}:${page}" ${((perms[role] || {})[page] !== false) ? 'checked' : ''}> ${escapeHtml(pageById(page).label || page)}</label>`).join('')}</div>`).join('')}<button class="btn primary">Salvar permissões</button></form>`;
  }

  function aprovacoes(user) {
    const s = loadStore();
    const rows = s.pendingRegistrations || [];
    return `<div class="grid cols-2">
      <section class="card"><div class="section-title"><h3>Cadastros pendentes</h3><span class="badge warn">${rows.filter(r => r.status !== 'aprovado').length}</span></div>
        <p class="note">Aprovar cadastro cria o morador, gera uma senha temporária simples e registra o envio por e-mail. A senha deve ser trocada no primeiro acesso.</p>
        ${table(rows, [{label:'Nome',value:'name'}, {label:'Unidade',value:'apartment'}, {label:'E-mail',value:'email'}, {label:'Status',value:'status'}, {label:'Data',value:r=>formatDate(r.createdAt)}], row => `<div class="row-actions"><button class="btn ok small" data-approve-pending="${row.id}">Aprovar</button><button class="btn danger small" data-reject-pending="${row.id}">Rejeitar</button></div>`)}
      </section>
      <section class="card"><div class="section-title"><h3>Caixa de envio</h3><span class="badge">${(s.notificationOutbox || []).length}</span></div>
        <p class="note">Aqui ficam os envios simulados/registrados por e-mail, WhatsApp e Telegram. Configure as plataformas em Configurações.</p>
        ${table((s.notificationOutbox || []).slice(0,12), [{label:'Canal',value:'channel'}, {label:'Destino',value:'to'}, {label:'Assunto',value:'title'}, {label:'Status',value:'status'}, {label:'Data',value:r=>formatDate(r.createdAt)}])}
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
        <label class="field"><span>Texto lido da etiqueta ou nota fiscal</span><textarea name="ocrText" placeholder="Cole ou digite o texto da etiqueta/nota. O sistema tenta sugerir morador e unidade."></textarea></label>
        <button class="btn secondary" type="button" id="recognizePackageOcr">Sugerir morador pela etiqueta/nota</button>
        <label class="field"><span>Foto da encomenda</span><input name="image" type="file" accept="image/*" capture="environment"></label>
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


  function financeiro(user) {
    const s = loadStore();
    const totals = financeTotals(s);
    const canManage = ['sindico','subsindico','admin','owner'].includes(user.role);
    const charges = visibleChargesFor(user, s.financeCharges || []);
    const tx = (s.financeTransactions || []).slice(0, 80);
    const categories = (s.financeCategories || defaultStore.financeCategories || ['Outros']);
    const pendingCharges = charges.filter(c => c.status !== 'pago');
    const paidCharges = charges.filter(c => c.status === 'pago');
    const chargeColumns = [
      {label:'Unidade',value:'apartment'},
      {label:'Descrição',value:'description'},
      {label:'Vencimento',value:r=>r.dueDate || '-'},
      {label:'Valor',value:r=>money(r.amount)},
      {label:'Status',value:r=>r.status || 'pendente'}
    ];
    const txColumns = [
      {label:'Tipo',value:r=>r.type === 'despesa' ? 'Despesa' : 'Receita'},
      {label:'Categoria',value:'category'},
      {label:'Descrição',value:'description'},
      {label:'Data',value:r=>r.date || '-'},
      {label:'Valor',value:r=>money(r.amount)}
    ];
    if (!canManage) {
      return `<div class="grid cols-2">
        <section class="card full-span"><div class="section-title"><h3>Meu financeiro</h3><span class="badge">Unidade ${escapeHtml(user.apartment || '-')}</span></div>
          <div class="grid cols-3">
            ${kpi('financeiro', money(pendingCharges.reduce((a,c)=>a+Number(c.amount||0),0)), 'Pendências da unidade')}
            ${kpi('financeiro', money(paidCharges.reduce((a,c)=>a+Number(c.amount||0),0)), 'Pagamentos registrados')}
            ${kpi('comunicados', charges.length, 'Lançamentos')}
          </div>
          <p class="note">Aqui aparecem as taxas e cobranças lançadas para sua unidade. Em caso de divergência, use a aba Ajuda para falar com a administração.</p>
        </section>
        <section class="card full-span"><div class="section-title"><h3>Cobranças da minha unidade</h3><span class="badge">${charges.length}</span></div>
          ${table(charges, chargeColumns, null)}
        </section>
      </div>`;
    }
    return `<div class="grid cols-2">
      <section class="card full-span"><div class="section-title"><h3>Financeiro do condomínio</h3><span class="badge ok">Recuperado na v3.5.0</span></div>
        <div class="grid cols-4">
          ${kpi('financeiro', money(totals.income), 'Receitas')}
          ${kpi('financeiro', money(totals.expense), 'Despesas')}
          ${kpi('financeiro', money(totals.balance), 'Saldo estimado')}
          ${kpi('financeiro', money(totals.pending), 'Cobranças pendentes')}
        </div>
      </section>
      <section class="card"><div class="section-title"><h3>Lançar receita ou despesa</h3><span class="badge">Caixa</span></div>
        <form id="financeEntryForm" class="form-grid">
          <label class="field"><span>Tipo</span><select name="type"><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label>
          <label class="field"><span>Categoria</span><select name="category">${categories.map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Valor</span><input name="amount" type="number" min="0" step="0.01" required></label>
          <label class="field"><span>Data</span><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
          <label class="field"><span>Descrição</span><textarea name="description" required placeholder="Ex.: Pagamento de limpeza, taxa de condomínio, manutenção..."></textarea></label>
          <button class="btn primary">Salvar lançamento</button>
        </form>
      </section>
      <section class="card"><div class="section-title"><h3>Gerar cobrança por unidade</h3><span class="badge">Condomínio</span></div>
        <form id="financeChargeForm" class="form-grid">
          <label class="field"><span>Unidade</span><input name="apartment" placeholder="Ex.: 305" required></label>
          <label class="field"><span>Valor</span><input name="amount" type="number" min="0" step="0.01" required></label>
          <label class="field"><span>Vencimento</span><input name="dueDate" type="date" required></label>
          <label class="field"><span>Descrição</span><textarea name="description" required placeholder="Ex.: Taxa de condomínio de ${new Date().toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}"></textarea></label>
          <button class="btn primary">Gerar cobrança e notificar</button>
        </form>
      </section>
      <section class="card full-span"><div class="section-title"><h3>Cobranças</h3><span class="badge">${charges.length}</span></div>
        ${table(charges, chargeColumns, row => `<div class="row-actions"><button class="btn ok small" data-pay-charge="${row.id}">Marcar pago</button><button class="btn ghost small" data-delete-charge="${row.id}">Excluir</button></div>`)}
      </section>
      <section class="card full-span"><div class="section-title"><h3>Livro caixa</h3><span class="badge">${tx.length}</span></div>
        ${table(tx, txColumns, row => `<div class="row-actions"><button class="btn ghost small" data-delete-finance="${row.id}">Excluir</button></div>`)}
      </section>
    </div>`;
  }

  function ajuda(user) {
    const s = loadStore();
    const docs = [
      ['📘', 'Funcionalidades do sistema', 'docs/Funcionalidades_do_Sistema_v3.3.0.pdf', 'Visão geral das funções disponíveis.'],
      ['🏢', 'Manual do síndico', 'docs/Manual_do_Sindico_v3.3.0.pdf', 'Gestão, aprovações, comunicados, emergências e backup.'],
      ['🛎️', 'Manual da portaria', 'docs/Manual_da_Portaria_v3.3.0.pdf', 'Visitantes, encomendas, fotos, avisos e emergências.'],
      ['🏠', 'Manual dos moradores', 'docs/Manual_dos_Moradores_v3.3.0.pdf', 'Cadastro, reservas, visitantes, comunicados e notificações.']
    ];
    const ticketCount = (s.supportTickets || []).length;
    return `<div class="grid cols-2">
      <section class="card full-span"><div class="section-title"><h3>Central de ajuda</h3><span class="badge ok">${VERSION_LABEL}</span></div>
        <p class="note">Aqui ficam os manuais do sistema, orientações simples por perfil e um canal de contato com o suporte. Os dados diretos de contato não aparecem na tela.</p>
        <div class="help-doc-grid">${docs.map(d => `<a class="help-doc" href="${d[2]}" target="_blank" rel="noopener"><span class="help-doc-icon">${d[0]}</span><strong>${escapeHtml(d[1])}</strong><small>${escapeHtml(d[3])}</small></a>`).join('')}</div>
      </section>
      <section class="card"><div class="section-title"><h3>Falar com o suporte</h3><span class="badge">Pelo sistema</span></div>
        <form id="supportForm" class="form-grid">
          <label class="field"><span>Assunto</span><select name="subject"><option>Dúvida de uso</option><option>Erro no sistema</option><option>Configuração de notificações</option><option>Atualização ou backup</option><option>Outro assunto</option></select></label>
          <label class="field"><span>Mensagem</span><textarea name="message" required placeholder="Descreva o que aconteceu ou o que precisa fazer."></textarea></label>
          <button class="btn primary" type="submit">Enviar mensagem pelo sistema</button>
          <button class="btn whatsapp" type="button" data-whatsapp-support>💬 Abrir WhatsApp</button>
        </form>
        <p class="note">A mensagem envia automaticamente a identificação do usuário, perfil, versão e nome do sistema para facilitar o atendimento.</p>
      </section>
      <section class="card"><div class="section-title"><h3>O que mudou nesta versão</h3><span class="badge">${ticketCount} chamados</span></div>
        <div class="notice-card"><strong>Leitura automática de etiquetas e notas</strong><p class="note">O sistema pode sugerir unidade e morador a partir do texto da etiqueta ou da nota fiscal, sem usar termos técnicos para o usuário.</p></div>
        <div class="notice-card"><strong>Contato sem expor dados</strong><p class="note">Os botões de contato usam e-mail ou WhatsApp por trás do sistema, sem exibir endereço ou telefone na interface.</p></div>
        <div class="notice-card"><strong>Créditos do projeto</strong><p class="note">${escapeHtml(s.settings.systemCredit || 'Desenvolvido em parceria por Bruno Saraiva e ChatGPT.')}</p></div>
      </section>
    </div>`;
  }

  function aplicativos(user) {
    const s = loadStore();
    const isPortaria = ['portaria','sindico','subsindico','admin','owner'].includes(user.role);
    return `<div class="grid cols-2">
      <section class="card full-span"><div class="section-title"><h3>Aplicativos e atalhos</h3><span class="badge ok">Instalação simples</span></div>
        <p class="note">O sistema pode ser instalado como atalho no celular, com aparência de aplicativo, sem Google Login. O acesso continua por usuário e senha.</p>
        <div class="action-grid">
          <button class="action-card" id="installPwaBtn"><span class="big">📲</span><strong>Instalar no celular</strong><small>Criar atalho do Vitória Régia</small></button>
          <button class="action-card" data-page="encomendas"><span class="big">📦</span><strong>App Morador</strong><small>Encomendas e notificações rápidas</small></button>
          ${isPortaria ? `<button class="action-card" data-page="visitantes"><span class="big">🪪</span><strong>App Portaria</strong><small>Visitantes recentes e entregas</small></button>` : ''}
          <button class="action-card" data-whatsapp-support><span class="big">💬</span><strong>Suporte</strong><small>Ajuda para instalar ou acessar</small></button>
        </div>
      </section>
      <section class="card"><div class="section-title"><h3>Orientação para moradores</h3><span class="badge">Android/iPhone</span></div>
        <ol class="simple-list"><li>Abra o site no navegador do celular.</li><li>Toque no menu do navegador.</li><li>Escolha “Adicionar à tela inicial” ou “Instalar app”.</li><li>Entre com usuário e senha.</li></ol>
      </section>
      <section class="card"><div class="section-title"><h3>Orientação para portaria</h3><span class="badge">Operação diária</span></div>
        <p class="note">A portaria deve manter o atalho na tela inicial para registrar visitante, encomenda, imagem da etiqueta e acionar o síndico em emergência.</p>
        <p class="note">Visitantes recorrentes e recentes ficam disponíveis para agilizar novos cadastros.</p>
      </section>
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
    return `<div class="grid cols-3"><section class="card kpi"><strong>${escapeHtml(s.settings.systemEdition || 'Premium')}</strong><span>Versão comprada</span></section><section class="card kpi"><strong>${VERSION_LABEL}</strong><span>Versão atual</span></section><section class="card kpi"><strong>${s.cloudFiles.length}</strong><span>Imagens salvas</span></section></div>
      <section class="card" style="margin-top:16px"><div class="section-title"><h3>Central premium do proprietário</h3><button class="btn primary small" id="runReadiness">Rodar diagnóstico</button></div><div id="readinessResult" class="note">Diagnóstico de mercado, arquivos críticos, backup, atualização, canais de notificação, MySQL e rotas principais.</div></section>
      <section class="card" style="margin-top:16px"><div class="section-title"><h3>Controle da licença</h3><span class="badge ok">Somente proprietário/admin</span></div><form id="licenseForm" class="form-grid"><label class="field"><span>Proprietário</span><input name="licenseOwner" value="${escapeHtml(s.settings.licenseOwner || '')}"></label><label class="field"><span>Plano/edição comprada</span><input name="systemEdition" value="${escapeHtml(s.settings.systemEdition || '')}"></label><button class="btn primary">Salvar licença</button></form></section>`;
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
      <section class="card"><div class="section-title"><h3>Unidades automáticas</h3><span class="badge">101 a 1103</span></div><form id="unitToolsForm" class="form-grid">
        <label class="field"><span>Primeiro andar</span><input name="firstFloor" type="number" min="1" value="${escapeHtml((s.settings.autoUnits && s.settings.autoUnits.firstFloor) || 1)}"></label>
        <label class="field"><span>Último andar</span><input name="lastFloor" type="number" min="1" value="${escapeHtml((s.settings.autoUnits && s.settings.autoUnits.lastFloor) || 11)}"></label>
        <label class="field"><span>Unidades por andar</span><input name="unitsPerFloor" type="number" min="1" max="20" value="${escapeHtml((s.settings.autoUnits && s.settings.autoUnits.unitsPerFloor) || 3)}"></label>
        <p class="note">Gera automaticamente unidades como 101, 102, 103 até 1101, 1102, 1103. Isso ajuda cadastros, encomendas e visitantes.</p>
        <button class="btn primary">Gerar/atualizar unidades</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Atualização do sistema</h3><span class="badge ok">Admin</span></div><p class="note">Para segurança, o navegador não substitui arquivos diretamente no servidor. A central registra a atualização, gera backup e pode acionar deploy se o hook de publicação estiver configurado.</p><form id="updateForm" class="form-grid">
        <label class="field"><span>Arquivo ZIP da atualização</span><input name="updateZip" type="file" accept=".zip"></label>
        <label class="field"><span>Hook de publicação, opcional</span><input name="renderDeployHook" value="${escapeHtml(s.settings.renderDeployHook)}" placeholder="URL segura de publicação" /></label>
        <button class="btn primary">Registrar atualização</button>
        <button class="btn secondary" type="button" id="triggerDeploy">Acionar publicação</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Nuvem de imagens</h3><span class="badge">${escapeHtml(s.settings.cloudMode)}</span></div><form id="cloudForm" class="form-grid">
        <label class="field"><span>Modo de armazenamento</span><select name="cloudMode"><option value="local" ${s.settings.cloudMode==='local'?'selected':''}>Local/backup do sistema</option><option value="cloudinary" ${s.settings.cloudMode==='cloudinary'?'selected':''}>Nuvem/API externa</option></select></label>
        <label class="field"><span>Nome/identificador da nuvem</span><input name="cloudName" value="${escapeHtml(s.settings.cloudName)}" placeholder="Ex.: vitoria-regia"></label>
        <p class="note">As fotos de encomendas e visitantes já são salvas no sistema e vinculadas às notificações. Para nuvem real, configure o provedor no backend.</p>
        <button class="btn primary">Salvar nuvem</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Plataformas de notificação</h3><span class="badge">E-mail • WhatsApp • Telegram</span></div><form id="channelsForm" class="form-grid">
        ${channelsFormFields(s)}
        <button class="btn primary">Salvar plataformas</button>
      </form></section>
      <section class="card"><div class="section-title"><h3>Segurança</h3><span class="badge warn">Acesso</span></div><p class="note">A tela inicial não exibe nome, unidade nem perfil. O proprietário do sistema controla versão, Central Premium, atualização, backup e permissões.</p><button class="btn ghost" id="lockFirstAccess">Bloquear criação automática de primeiro admin</button></section>
    </div>`;
  }

  function channelsFormFields(s) {
    const c = (s.settings && s.settings.notificationChannels) || defaultStore.settings.notificationChannels;
    return `<label class="check-line"><input type="checkbox" name="emailEnabled" ${c.email.enabled ? 'checked' : ''}> Ativar e-mail</label>
      <label class="field"><span>Remetente do e-mail</span><input name="senderEmail" value="${escapeHtml(c.email.senderEmail || '')}" placeholder="condominio@dominio.com"></label>
      <label class="field"><span>Nome do remetente</span><input name="senderName" value="${escapeHtml(c.email.senderName || '')}"></label>
      <label class="check-line"><input type="checkbox" name="whatsappEnabled" ${c.whatsapp.enabled ? 'checked' : ''}> Ativar WhatsApp</label>
      <label class="field"><span>Número padrão do WhatsApp</span><input name="whatsappNumber" value="${escapeHtml(c.whatsapp.defaultNumber || '')}" placeholder="5563999999999"></label>
      <label class="check-line"><input type="checkbox" name="telegramEnabled" ${c.telegram.enabled ? 'checked' : ''}> Ativar Telegram</label>
      <label class="field"><span>Token do bot Telegram</span><input name="telegramBotToken" type="password" value="${escapeHtml(c.telegram.botToken || '')}" placeholder="Configure no backend/sistema"></label>
      <label class="field"><span>Chat ID padrão</span><input name="telegramChatId" value="${escapeHtml(c.telegram.chatId || '')}"></label>
      <label class="check-line"><input type="checkbox" name="telegramIfood" ${c.telegram.ifoodCodeButton ? 'checked' : ''}> Botão para código iFood</label>
      <label class="check-line"><input type="checkbox" name="telegramElevator" ${c.telegram.elevatorDeliveryButton ? 'checked' : ''}> Botão para autorizar entrega pelo elevador</label>
      <label class="check-line"><input type="checkbox" name="telegramEmergency" ${c.telegram.emergencyButton ? 'checked' : ''}> Botão de emergência pelo Telegram</label>`;
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

  function dispatchChannelNotification(store, payload) {
    const channels = (store.settings && store.settings.notificationChannels) || defaultStore.settings.notificationChannels;
    const apartment = payload.apartment || 'Todos';
    const rec = notificationRecipients(store, apartment);
    const message = buildMessage(payload.title, payload.body, apartment);
    const out = [];
    if (channels.email && channels.email.enabled) out.push({ channel:'E-mail', to: rec.email || payload.email || 'sem e-mail cadastrado', title:payload.title, body:message, image:payload.image, status: rec.email || payload.email ? 'pronto para envio' : 'pendente - sem e-mail', createdAt:now() });
    if (channels.whatsapp && channels.whatsapp.enabled) out.push({ channel:'WhatsApp', to: rec.phone || payload.phone || channels.whatsapp.defaultNumber || 'sem número cadastrado', title:payload.title, body:message, image:payload.image, status: 'registrado', createdAt:now() });
    if (channels.telegram && channels.telegram.enabled) out.push({ channel:'Telegram', to: rec.telegram || channels.telegram.chatId || 'chat padrão', title:payload.title, body:message, image:payload.image, status: 'registrado', createdAt:now(), buttons: telegramButtonsFor(payload.kind, channels.telegram) });
    out.forEach(item => store.notificationOutbox.unshift({ id:id('outbox'), ...item }));
    try { fetch('/api/notify/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ payload, channels: out }) }); } catch (_) {}
    return out;
  }

  function telegramButtonsFor(kind, cfg) {
    const buttons = [];
    if (kind === 'package' && cfg.ifoodCodeButton) buttons.push('Enviar código iFood');
    if (kind === 'package' && cfg.elevatorDeliveryButton) buttons.push('Autorizar entrega pelo elevador');
    if (cfg.emergencyButton) buttons.push('Acionar emergência');
    return buttons;
  }

  function recognizePackageFormFromOcr() {
    const form = document.getElementById('packageForm');
    if (!form) return;
    const s = loadStore();
    const text = `${form.ocrText?.value || ''} ${form.description?.value || ''}`.toLowerCase();
    let match = null;
    for (const r of s.residents || []) {
      const unit = String(r.apartment || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      if ((unit && text.includes(unit)) || (name && text.includes(name.split(/\s+/)[0]))) { match = r; break; }
    }
    if (!match) {
      const unitRegex = text.match(/(?:apto|apartamento|unidade|bloco|ap)\s*[:#-]?\s*([a-z0-9\s-]{2,20})/i);
      if (unitRegex) form.apartment.value = unitRegex[1].trim();
      toast(unitRegex ? 'Unidade sugerida pelo texto da etiqueta/nota.' : 'Não localizei morador no texto da etiqueta/nota.');
      return;
    }
    form.apartment.value = match.apartment || form.apartment.value;
    form.recipient.value = match.name || form.recipient.value;
    toast(`Morador reconhecido: ${match.name} - unidade ${match.apartment}.`, 'ok');
  }

  function approvePendingRegistration(pendingId) {
    const s = loadStore();
    const row = (s.pendingRegistrations || []).find(r => r.id === pendingId);
    if (!row) return;
    if (row.status === 'aprovado') return toast('Cadastro já aprovado.');
    const temp = generateTempPassword(s.settings.temporaryPasswordLength || 6);
    const resident = { id:id('resident'), name:row.name, apartment:row.apartment, email:row.email, phone:row.phone, username:row.username, password:temp, role:'morador', active:true, forcePasswordChange:true, createdAt:now() };
    s.residents.unshift(resident);
    row.status = 'aprovado'; row.approvedAt = now(); row.temporaryPassword = temp;
    dispatchChannelNotification(s, { kind:'approval', title:'Cadastro aprovado', body:`Seu acesso foi aprovado. Usuário: ${row.username}. Senha temporária: ${temp}. Troque a senha no primeiro acesso.`, apartment:row.apartment, email:row.email, phone:row.phone });
    addNotification(s, 'Cadastro aprovado', `${row.name} aprovado para a unidade ${row.apartment}.`, row.apartment);
    logAction('cadastro', `Cadastro aprovado: ${row.name}.`);
    saveStore(s); toast(`Cadastro aprovado. Senha temporária: ${temp}`, 'ok'); renderApp('aprovacoes');
  }

  function rejectPendingRegistration(pendingId) {
    const s = loadStore(); const row = (s.pendingRegistrations || []).find(r => r.id === pendingId); if (!row) return;
    row.status = 'rejeitado'; row.rejectedAt = now(); logAction('cadastro', `Cadastro rejeitado: ${row.name}.`); saveStore(s); toast('Cadastro rejeitado.'); renderApp('aprovacoes');
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
      dispatchChannelNotification(s, { kind:'package', title:'Imagem da encomenda', body:`Imagem disponível para encomenda da unidade ${row.apartment}.`, apartment:row.apartment, image:row.image });
      notifyBrowser('Imagem da encomenda', `Unidade ${row.apartment}`, row.image); saveStore(s); toast('Imagem enviada pelos canais configurados.');
    }));

    document.querySelectorAll('[data-notify-visitor]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore(); const row = s.visitors.find(v => v.id === btn.dataset.notifyVisitor); if (!row) return;
      addNotification(s, 'Imagem de visitante', `Imagem disponível para visitante ${row.name}, unidade ${row.apartment}.`, row.apartment, row.image);
      dispatchChannelNotification(s, { kind:'visitor', title:'Imagem de visitante', body:`Imagem disponível para visitante ${row.name}.`, apartment:row.apartment, image:row.image });
      notifyBrowser('Imagem de visitante', `${row.name} • Unidade ${row.apartment}`, row.image); saveStore(s); toast('Imagem enviada pelos canais configurados.');
    }));

    document.querySelectorAll('[data-confirm-emergency]').forEach(btn => btn.addEventListener('click', () => setEmergencyStatus(btn.dataset.confirmEmergency, 'confirmado e moradores notificados', true)));
    document.querySelectorAll('[data-reset-emergency]').forEach(btn => btn.addEventListener('click', () => setEmergencyStatus(btn.dataset.resetEmergency, 'resetado', false)));
    document.querySelectorAll('[data-resolve-emergency]').forEach(btn => btn.addEventListener('click', () => setEmergencyStatus(btn.dataset.resolveEmergency, 'resolvido', false)));
    document.querySelectorAll('[data-approve-pending]').forEach(btn => btn.addEventListener('click', () => approvePendingRegistration(btn.dataset.approvePending)));
    document.querySelectorAll('[data-reject-pending]').forEach(btn => btn.addEventListener('click', () => rejectPendingRegistration(btn.dataset.rejectPending)));
    document.getElementById('recognizePackageOcr')?.addEventListener('click', recognizePackageFormFromOcr);

    document.querySelectorAll('[data-whatsapp-support]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore();
      const contact = (s.settings && s.settings.supportContact) || defaultStore.settings.supportContact;
      const target = contact.whatsapp || '5561996071663';
      const msg = encodeURIComponent(`Olá, preciso de suporte no sistema Vitória Régia ${VERSION_LABEL}. Usuário: ${user.name || user.username || 'não informado'}. Perfil: ${roleLabels[user.role] || user.role}. Unidade: ${user.apartment || '-'}.`);
      window.open(`https://wa.me/${target}?text=${msg}`, '_blank', 'noopener');
    }));



    document.querySelectorAll('[data-pay-charge]').forEach(btn => btn.addEventListener('click', () => {
      const s = loadStore(); const row = (s.financeCharges || []).find(c => c.id === btn.dataset.payCharge); if (!row) return;
      row.status = 'pago'; row.paidAt = now();
      s.financeTransactions = s.financeTransactions || [];
      s.financeTransactions.unshift({ id:id('fin'), type:'receita', category:'Condomínio', description:`Pagamento da cobrança da unidade ${row.apartment}: ${row.description}`, amount:Number(row.amount || 0), date:new Date().toISOString().slice(0,10), chargeId:row.id, createdAt:now() });
      addNotification(s, 'Pagamento registrado', `Pagamento registrado para a unidade ${row.apartment}.`, row.apartment);
      logAction('financeiro', `Cobrança marcada como paga: unidade ${row.apartment}.`);
      saveStore(s); toast('Cobrança marcada como paga.', 'ok'); renderApp('financeiro');
    }));

    document.querySelectorAll('[data-delete-charge]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirm('Excluir esta cobrança?')) return;
      const s = loadStore(); s.financeCharges = (s.financeCharges || []).filter(c => c.id !== btn.dataset.deleteCharge);
      logAction('financeiro', 'Cobrança excluída.'); saveStore(s); toast('Cobrança excluída.'); renderApp('financeiro');
    }));

    document.querySelectorAll('[data-delete-finance]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirm('Excluir este lançamento financeiro?')) return;
      const s = loadStore(); s.financeTransactions = (s.financeTransactions || []).filter(t => t.id !== btn.dataset.deleteFinance);
      logAction('financeiro', 'Lançamento financeiro excluído.'); saveStore(s); toast('Lançamento excluído.'); renderApp('financeiro');
    }));

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

    const financeEntryForm = document.getElementById('financeEntryForm');
    financeEntryForm?.addEventListener('submit', ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore();
      s.financeTransactions = s.financeTransactions || [];
      s.financeTransactions.unshift({ id:id('fin'), ...d, amount:Number(d.amount || 0), createdBy:user.name || user.username, createdAt:now() });
      logAction('financeiro', `${d.type === 'despesa' ? 'Despesa' : 'Receita'} lançada: ${d.description}.`);
      saveStore(s); toast('Lançamento financeiro salvo.', 'ok'); renderApp('financeiro');
    });

    const financeChargeForm = document.getElementById('financeChargeForm');
    financeChargeForm?.addEventListener('submit', ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore();
      s.financeCharges = s.financeCharges || [];
      const charge = { id:id('charge'), status:'pendente', ...d, amount:Number(d.amount || 0), createdBy:user.name || user.username, createdAt:now() };
      s.financeCharges.unshift(charge);
      addNotification(s, 'Nova cobrança', `${d.description} - ${money(d.amount)}. Vencimento: ${d.dueDate}.`, d.apartment);
      dispatchChannelNotification(s, { kind:'financeiro', title:'Nova cobrança', body:`${d.description} - ${money(d.amount)}. Vencimento: ${d.dueDate}.`, apartment:d.apartment });
      logAction('financeiro', `Cobrança gerada para unidade ${d.apartment}.`);
      saveStore(s); toast('Cobrança criada e notificada.', 'ok'); renderApp('financeiro');
    });

    const packageForm = document.getElementById('packageForm');
    packageForm?.addEventListener('submit', async ev => {
      ev.preventDefault(); const fd = new FormData(ev.currentTarget); const d = Object.fromEntries(fd.entries()); const s = loadStore(); const itemId = id('package');
      const image = await cloudSaveImage(fd.get('image'), 'package', itemId);
      const item = { id:itemId, status:'pendente', ...d, image, createdAt:now() };
      s.packages.unshift(item); addNotification(s, 'Nova encomenda', `Encomenda registrada para unidade ${d.apartment}.`, d.apartment, image); dispatchChannelNotification(s, { kind:'package', title:'Nova encomenda', body:`Encomenda registrada para unidade ${d.apartment}.`, apartment:d.apartment, image }); logAction('encomendas', `Encomenda registrada para unidade ${d.apartment}.`); saveStore(s); notifyBrowser('Nova encomenda', `Unidade ${d.apartment}`, image); toast('Encomenda registrada e notificada pelos canais configurados.'); renderApp('encomendas');
    });

    const visitorForm = document.getElementById('visitorForm');
    visitorForm?.addEventListener('submit', async ev => {
      ev.preventDefault(); const fd = new FormData(ev.currentTarget); const d = Object.fromEntries(fd.entries()); const s = loadStore(); const itemId = id('visitor');
      const image = await cloudSaveImage(fd.get('image'), 'visitor', itemId);
      const item = { id:itemId, ...d, image, createdAt:now() };
      s.visitors.unshift(item); if (d.recurring === 'Sim') s.recurringVisitors.unshift(item);
      addNotification(s, 'Visitante cadastrado', `${d.name} cadastrado para unidade ${d.apartment}.`, d.apartment, image); dispatchChannelNotification(s, { kind:'visitor', title:'Visitante cadastrado', body:`${d.name} cadastrado para unidade ${d.apartment}.`, apartment:d.apartment, image }); logAction('visitantes', `Visitante ${d.name} cadastrado.`); saveStore(s); notifyBrowser('Visitante cadastrado', `${d.name} • Unidade ${d.apartment}`, image); toast('Visitante salvo e notificado pelos canais configurados.'); renderApp('visitantes');
    });

    const bookingForm = document.getElementById('bookingForm');
    bookingForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); s.bookings.unshift({ id:id('booking'), status:'solicitada', requester:user.name, ...d, createdAt:now() }); addNotification(s, 'Reserva solicitada', `${d.space} para unidade ${d.apartment}.`, d.apartment); logAction('reservas', `Reserva solicitada para ${d.space}.`); saveStore(s); toast('Reserva solicitada.'); renderApp('reservas'); });

    const noticeForm = document.getElementById('noticeForm');
    noticeForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); s.notices.unshift({ id:id('notice'), author:user.name, ...d, createdAt:now() }); addNotification(s, d.title, d.body, d.apartment || 'Todos'); logAction('comunicados', `Comunicado publicado: ${d.title}.`); saveStore(s); notifyBrowser(d.title, d.body); toast('Comunicado publicado.'); renderApp('comunicados'); });


    const supportForm = document.getElementById('supportForm');
    supportForm?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.currentTarget).entries());
      const s = loadStore();
      const ticket = { id:id('support'), subject:d.subject, message:d.message, system:'Vitória Régia', version:VERSION_LABEL, userName:user.name || user.username || 'Usuário', username:user.username || '', userRole:user.role || '', apartment:user.apartment || '', createdAt:now() };
      s.supportTickets = s.supportTickets || [];
      s.supportTickets.unshift(ticket);
      s.notificationOutbox.unshift({ id:id('outbox'), channel:'E-mail', to:'suporte interno', title:`Suporte Vitória Régia - ${d.subject}`, body:`Usuário: ${ticket.userName}\nPerfil: ${ticket.userRole}\nUnidade: ${ticket.apartment || '-'}\nSistema: ${ticket.system} ${ticket.version}\n\n${d.message}`, status:'registrado para envio pelo sistema', createdAt:now() });
      logAction('ajuda', `Mensagem de suporte registrada: ${d.subject}.`);
      saveStore(s);
      try { await fetch('/api/support/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(ticket) }); } catch (_) {}
      toast('Mensagem enviada pelo sistema.');
      renderApp('ajuda');
    });

    const settingsForm = document.getElementById('settingsForm');
    settingsForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); Object.assign(s.settings, d, { defaultNoticeDays: Number(d.defaultNoticeDays || 7) }); logAction('configuracoes', 'Configurações visuais atualizadas.'); saveStore(s); toast('Configurações salvas.'); renderApp('configuracoes'); });

    const unitToolsForm = document.getElementById('unitToolsForm');
    unitToolsForm?.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.currentTarget).entries());
      const s = loadStore();
      const units = generateUnitList(d.firstFloor, d.lastFloor, d.unitsPerFloor);
      s.units = units;
      s.settings.autoUnits = { enabled:true, firstFloor:Number(d.firstFloor || 1), lastFloor:Number(d.lastFloor || 11), unitsPerFloor:Number(d.unitsPerFloor || 3), example:`${units[0]?.apartment || ''} a ${units[units.length-1]?.apartment || ''}` };
      logAction('unidades', `Unidades automáticas atualizadas: ${units.length} unidade(s).`);
      saveStore(s);
      toast(`${units.length} unidades geradas.`, 'ok');
      renderApp('configuracoes');
    });

    const installPwaBtn = document.getElementById('installPwaBtn');
    installPwaBtn?.addEventListener('click', () => {
      const s = loadStore();
      s.appInstallRequests = s.appInstallRequests || [];
      s.appInstallRequests.unshift({ id:id('app'), user:user.name || user.username, role:user.role, createdAt:now(), status:'orientação exibida' });
      logAction('aplicativos', `Orientação de instalação exibida para ${user.name || user.username}.`);
      saveStore(s);
      toast('Use o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar app”.');
    });

    const cloudForm = document.getElementById('cloudForm');
    cloudForm?.addEventListener('submit', ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore(); Object.assign(s.settings, d); logAction('configuracoes', `Nuvem configurada em modo ${d.cloudMode}.`); saveStore(s); toast('Configuração de nuvem salva.'); renderApp('configuracoes'); });

    const permissionsForm = document.getElementById('permissionsForm');
    permissionsForm?.addEventListener('submit', ev => {
      ev.preventDefault(); const s = loadStore(); const fd = new FormData(ev.currentTarget);
      const roles = ['morador','portaria','subsindico']; const pages = ['dashboard','encomendas','visitantes','reservas','comunicados','financeiro','ajuda','aplicativos','emergencias','moradores','usuarios','backups'];
      s.settings.profilePermissions = s.settings.profilePermissions || {};
      roles.forEach(role => { s.settings.profilePermissions[role] = s.settings.profilePermissions[role] || {}; pages.forEach(page => { s.settings.profilePermissions[role][page] = fd.has(`${role}:${page}`); }); });
      logAction('permissoes', 'Permissões por perfil atualizadas.'); saveStore(s); toast('Permissões salvas.'); renderApp('usuarios');
    });

    const channelsForm = document.getElementById('channelsForm');
    channelsForm?.addEventListener('submit', ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore();
      s.settings.notificationChannels = {
        email: { enabled: Boolean(d.emailEnabled), senderName: d.senderName || 'Condomínio Vitória Régia', senderEmail: d.senderEmail || '', replyTo: d.senderEmail || '' },
        whatsapp: { enabled: Boolean(d.whatsappEnabled), defaultNumber: d.whatsappNumber || '', sendImages: true },
        telegram: { enabled: Boolean(d.telegramEnabled), botToken: d.telegramBotToken || '', chatId: d.telegramChatId || '', allowResidentReplies: true, ifoodCodeButton: Boolean(d.telegramIfood), elevatorDeliveryButton: Boolean(d.telegramElevator), emergencyButton: Boolean(d.telegramEmergency) }
      };
      logAction('configuracoes', 'Plataformas de notificação atualizadas.'); saveStore(s); toast('Plataformas salvas.'); renderApp('configuracoes');
    });

    const licenseForm = document.getElementById('licenseForm');
    licenseForm?.addEventListener('submit', ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget).entries()); const s = loadStore();
      s.settings.licenseOwner = d.licenseOwner || s.settings.licenseOwner; s.settings.systemEdition = d.systemEdition || s.settings.systemEdition;
      logAction('premium', 'Licença do sistema atualizada.'); saveStore(s); toast('Licença salva.'); renderApp('premium');
    });

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
    if (notifyResidents) { addNotification(s, 'Emergência confirmada', `${row.type} - ${row.apartment}. Siga as orientações da administração.`, 'Todos'); dispatchChannelNotification(s, { kind:'emergency', title:'Emergência confirmada', body:`${row.type} - ${row.apartment}. Siga as orientações da administração.`, apartment:'Todos' }); }
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
      s.emergencies.unshift(item); addNotification(s, 'Emergência aguardando confirmação', `${item.type} - ${item.apartment}.`, 'Portaria/Síndico'); dispatchChannelNotification(s, { kind:'emergency', title:'Emergência aguardando confirmação', body:`${item.type} - ${item.apartment}.`, apartment:item.apartment }); logAction('emergencias', `Emergência acionada: ${item.type}.`); saveStore(s);
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
    if (!hook) return toast('Configure o hook de publicação primeiro.');
    if (!confirm('Acionar publicação no servidor agora?')) return;
    try { await fetch(hook, { method:'POST', mode:'no-cors' }); logAction('atualizacoes', 'Deploy hook acionado.'); saveStore(s); toast('Deploy acionado.'); }
    catch (_) { toast('Não foi possível acionar o deploy.'); }
  }

  window.addEventListener('hashchange', () => renderApp(location.hash.replace('#','') || 'dashboard'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  getSession() ? renderApp(location.hash.replace('#','') || 'dashboard') : renderLogin();
})();
