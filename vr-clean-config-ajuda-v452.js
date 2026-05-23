
// Vitória Régia v4.5.2 — foco clean: configurações, ajuda, menu, update e testes
(function () {
  const VERSION = 'v4.5.2';
  let DISPLAY_VERSION = VERSION + '-clean-config-ajuda-sem-segredos';
  const EXPECTED_ZIP = 'vitoriaregia_update_' + VERSION + '.zip';
  const SUPPORT_EMAIL = 'bmedeiros1987@gmail.com';
  const SUPPORT_WA = '5561996071663';
  let appState = null;
  let channels = null;
  let asaas = null;
  let scheduled = false;

  const NAVS = {
    admin: [['dashboard','🏠','Início'],['cadastros','🗂️','Cadastros'],['operacao','🛡️','Operação'],['financeiro','💰','Financeiro'],['manual','❔','Ajuda'],['configuracoes','⚙️','Configurações']],
    morador: [['dashboard','🏠','Início'],['reservas','📅','Reservas'],['encomendas','📦','Encomendas'],['financeiro','💳','Financeiro'],['manual','❔','Ajuda']],
    portaria: [['dashboard','🏠','Início'],['operacao','🛡️','Operação'],['encomendas','📦','Encomendas'],['visitantes-recorrentes','👥','Visitantes'],['manual','❔','Ajuda']]
  };

  function parse(value, fallback) { if (!value) return fallback; try { return JSON.parse(value); } catch (_) { return fallback; } }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
  function norm(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function session() {
    const p = 'vitoriaRegia.full.v1.';
    return parse(localStorage.getItem(p + 'session'), null) || parse(localStorage.getItem('currentUser'), null) || parse(localStorage.getItem('user'), null) || {};
  }
  function role() {
    const s = session();
    const r = norm(s.role || s.staffRole || s.originalRole || s.perfil || s.tipo || '');
    if (r.includes('owner') || r.includes('propriet') || r.includes('dono') || r.includes('admin') || r.includes('sind')) return 'admin';
    if (r.includes('port')) return 'portaria';
    return 'morador';
  }
  function isAdmin() { return role() === 'admin'; }
  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }
  function firstName() { const s = session(); return String(s.name || s.nome || s.email || 'usuário').trim().split(/\s+/)[0] || 'usuário'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

  async function loadVersion() {
    try {
      const res = await fetch('VERSION.json?ts=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data && data.version) DISPLAY_VERSION = data.version + '-clean-config-ajuda-sem-segredos';
    } catch (_) {}
    updateVersionUI();
  }
  function updateVersionUI() {
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => { el.textContent = DISPLAY_VERSION; });
    document.querySelectorAll('.vr443-login-version,.vr446-login-version,.vr451-login-version').forEach(el => el.remove());
    if (!logged()) {
      document.body.classList.add('auth-locked');
      let el = document.querySelector('.vr452-login-version');
      if (!el) {
        el = document.createElement('div');
        el.className = 'vr452-login-version';
        el.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(el);
      }
      el.querySelector('strong').textContent = DISPLAY_VERSION;
      el.style.display = 'block';
    } else {
      document.body.classList.remove('auth-locked');
      document.querySelectorAll('.vr452-login-version').forEach(el => el.style.display = 'none');
    }
  }

  async function loadState() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const data = await res.json();
      if (data && data.state) appState = data.state;
    } catch (_) { appState = appState || {}; }
    return appState || {};
  }
  async function saveStatePatch(patch) {
    const res = await fetch('/api/state/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: patch }) });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha ao salvar.');
    appState = data.state || appState || {};
    return appState;
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open','no-scroll');
    document.querySelector('[data-sidebar]')?.classList.remove('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.remove('is-open');
  }
  function openMenu() {
    document.body.classList.add('sidebar-open','no-scroll');
    document.querySelector('[data-sidebar]')?.classList.add('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.add('is-open');
  }
  function go(target) {
    if (!target) return;
    if (target === 'cadastros') ensureCadastroHub();
    if (target === 'operacao') ensureOperacaoHub();
    const nav = document.querySelector(`[href="#${target}"][data-nav]`);
    if (nav) nav.click();
    else {
      document.querySelectorAll('[data-section], .section').forEach(sec => sec.classList.toggle('is-active', sec.id === target));
      location.hash = target;
    }
    closeMenu();
    setTimeout(runNow, 100);
  }

  function compactMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    const nav = sidebar && sidebar.querySelector('.nav, nav');
    if (!sidebar || !nav) return;
    sidebar.querySelectorAll('.vr440-menu-head,.vr441-menu-head,.vr442-menu-head,.vr447-menu-head,.vr450-menu-head,.vr451-menu-close-floating').forEach(el => el.remove());
    if (!sidebar.querySelector('[data-vr452-menu-close]')) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'vr452-menu-close';
      close.setAttribute('data-vr452-menu-close', 'true');
      close.setAttribute('aria-label', 'Fechar menu');
      close.textContent = '×';
      close.addEventListener('click', closeMenu);
      sidebar.insertBefore(close, sidebar.firstChild);
    }
    const openBtn = document.querySelector('[data-menu-open]');
    if (openBtn && !openBtn.dataset.vr452Bound) {
      openBtn.dataset.vr452Bound = '1';
      openBtn.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); openMenu(); }, true);
    }
    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.vr452Bound) {
      shadow.dataset.vr452Bound = '1';
      shadow.addEventListener('click', closeMenu);
    }
    if (nav.dataset.vr452Built === role()) return;
    nav.querySelectorAll('[data-vr452-nav], .vr452-nav-title').forEach(el => el.remove());
    nav.querySelectorAll('a[data-nav]').forEach(a => { if (!a.dataset.vr452Nav) a.style.display = 'none'; });
    const title = document.createElement('div');
    title.className = 'vr452-nav-title';
    title.textContent = 'Navegação';
    nav.appendChild(title);
    (NAVS[role()] || NAVS.morador).forEach(([target, icon, label]) => {
      const a = document.createElement('a');
      a.href = '#' + target;
      a.setAttribute('data-nav', '');
      a.setAttribute('data-vr452-nav', target);
      a.innerHTML = `<span>${icon}</span><span>${escapeHTML(label)}</span>`;
      a.addEventListener('click', event => { event.preventDefault(); go(target); });
      nav.appendChild(a);
    });
    nav.dataset.vr452Built = role();
  }

  function visibleNotices() {
    const state = appState || {};
    const notices = state.notices || [];
    if (role() === 'morador') return notices.filter(n => n.public || n.publico || n.visibleToResidents || n.type === 'public').slice(0, 2);
    return notices.slice(0, 2);
  }
  function action(icon, title, text, target) {
    return `<button class="vr452-action" type="button" data-vr452-go="${target}"><span>${icon}</span><b>${escapeHTML(title)}</b><small>${escapeHTML(text)}</small></button>`;
  }

  function renderDashboard() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"]');
    if (!dash) return;
    dash.classList.add('vr452-dashboard-ready');
    if (dash.querySelector('.vr452-dashboard')) return;
    let actions = '';
    let subtitle = '';
    if (role() === 'admin') {
      subtitle = 'Gestão organizada: cadastros, operação, financeiro, ajuda e configurações.';
      actions = [action('🗂️','Cadastros','Moradores, equipe, visitantes e encomendas.','cadastros'),action('🛡️','Operação','Portaria, entregas, reservas e emergências.','operacao'),action('💰','Financeiro','Administração e boletos.','financeiro'),action('⚙️','Configurações','Canais, boleto, espaços e atualização.','configuracoes')].join('');
    } else if (role() === 'portaria') {
      subtitle = 'Rotina da portaria com poucos botões e ações objetivas.';
      actions = [action('📦','Encomendas','Registrar e consultar entregas.','encomendas'),action('👥','Visitantes','Cadastro e controle de acesso.','visitantes-recorrentes'),action('🛡️','Operação','Ações da portaria.','operacao'),action('❔','Ajuda','Manuais rápidos.','manual')].join('');
    } else {
      subtitle = 'Veja somente suas informações: reservas, encomendas, financeiro da sua unidade e ajuda.';
      actions = [action('📅','Reservas','Solicitar ou consultar.','reservas'),action('📦','Encomendas','Suas entregas.','encomendas'),action('💳','Financeiro morador','Somente sua unidade.','financeiro'),action('❔','Ajuda','Manuais e suporte.','manual')].join('');
    }
    const notices = visibleNotices();
    dash.insertAdjacentHTML('afterbegin', `<section class="vr452-dashboard vr452-wrap"><div class="vr452-hero"><h2>${greeting()}, ${escapeHTML(firstName())}.</h2><p>${escapeHTML(subtitle)}</p></div><div class="vr452-card"><h3>🔔 Avisos do síndico</h3>${notices.length ? notices.map(n => `<p><b>${escapeHTML(n.title || 'Aviso')}</b><br>${escapeHTML(n.message || n.text || '')}</p>`).join('') : '<p>Nenhum aviso importante no momento.</p>'}</div><div class="vr452-grid">${actions}</div></section>`);
    dash.querySelectorAll('[data-vr452-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr452-go'))));
  }

  function ensureSection(id, roles) {
    let sec = document.getElementById(id);
    if (sec) return sec;
    const main = document.querySelector('main, [data-app], .app-main, .content');
    if (!main) return null;
    sec = document.createElement('section');
    sec.id = id;
    sec.className = 'section';
    sec.setAttribute('data-section', '');
    sec.setAttribute('data-roles', roles || 'morador,sindico,portaria,admin,owner');
    main.appendChild(sec);
    return sec;
  }

  function ensureCadastroHub() {
    if (!logged() || (!isAdmin() && role() !== 'portaria')) return;
    const sec = ensureSection('cadastros', 'sindico,admin,owner,portaria');
    if (!sec || sec.dataset.vr452Ready) return;
    sec.dataset.vr452Ready = '1';
    sec.classList.add('vr452-hub-ready');
    sec.innerHTML = `<div class="vr452-hub vr452-wrap"><div class="vr452-hero"><h2>Central de cadastros</h2><p>Tudo que é cadastro fica aqui. Configurações ficam separadas em Configurações.</p></div><div class="vr452-grid">${action('🏠','Moradores e unidades','Cadastro, aprovação e edição.','moradores')}${action('👷','Equipe e funcionários','Administração, portaria, limpeza e zeladoria.','equipe')}${action('👥','Visitantes','Autorização e recorrência.','visitantes-recorrentes')}${action('📦','Encomendas','Registro, foto e etiqueta.','encomendas')}${action('📣','Comunicados','Avisos do síndico.','comunicados')}${action('📁','Arquivos','Documentos do condomínio.','arquivos')}</div></div>`;
    sec.querySelectorAll('[data-vr452-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr452-go'))));
  }

  function ensureOperacaoHub() {
    if (!logged()) return;
    const sec = ensureSection('operacao', 'morador,sindico,admin,owner,portaria');
    if (!sec || sec.dataset.vr452Ready) return;
    sec.dataset.vr452Ready = '1';
    sec.classList.add('vr452-hub-ready');
    sec.innerHTML = `<div class="vr452-hub vr452-wrap"><div class="vr452-hero"><h2>Operação do condomínio</h2><p>Ações do dia a dia separadas de cadastros e configurações.</p></div><div class="vr452-grid">${action('📦','Encomendas','Registrar e consultar entregas.','encomendas')}${action('👥','Visitantes','Controle de acesso.','visitantes-recorrentes')}${action('🛡️','Portaria','Ocorrências e rotinas.','portaria')}${action('📅','Reservas','Solicitar e aprovar áreas comuns.','reservas')}${action('🧹','Serviços','Limpeza, zeladoria e solicitações.','servicos')}${action('🚨','Emergências','Botão seguro e rápido.','automacoes')}</div></div>`;
    sec.querySelectorAll('[data-vr452-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr452-go'))));
  }

  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr452-field"><span>${escapeHTML(label)}</span><input type="${type}" data-vr452-field="${key}" placeholder="${escapeHTML(placeholder)}"></div>`;
  }
  function checkbox(label, key) {
    return `<label class="vr452-check"><input type="checkbox" data-vr452-field="${key}"><span>${escapeHTML(label)}</span></label>`;
  }
  function updateBlock(source) {
    return `<h3>Atualização do sistema</h3><p>Envie aqui o ZIP limpo gerado pela conversa. O token fica no Render.</p><div class="vr452-grid"><div class="vr452-card"><h3>Enviar ZIP</h3><p>Esperado: <b>${EXPECTED_ZIP}</b></p><input type="file" accept=".zip,application/zip" data-vr452-update-file="${source}"><div class="vr452-progress"><span data-vr452-update-bar="${source}"></span></div><div class="vr452-status" data-vr452-update-status="${source}">Selecione o ZIP.</div><div class="vr452-row"><button class="vr452-btn primary" data-vr452-send-update="${source}">Enviar atualização</button><button class="vr452-btn" data-vr452-check-version>Conferir versão</button></div></div><div class="vr452-card"><h3>Pré-requisitos</h3><p>Render precisa ter GITHUB_UPDATE_TOKEN, GITHUB_REPOSITORY e GITHUB_BRANCH.</p><div class="vr452-note">Nenhum token fica no ZIP.</div></div></div>`;
  }

  function ensureConfig() {
    if (!logged() || !isAdmin()) return;
    const sec = document.getElementById('configuracoes');
    if (!sec || sec.dataset.vr452Ready) return;
    sec.dataset.vr452Ready = '1';
    sec.className = 'section vr452-config-ready';
    sec.setAttribute('data-section', '');
    sec.innerHTML = `<div class="vr452-config vr452-wrap"><div class="vr452-hero"><h2>Configurações</h2><p>Área limpa e separada por assunto. Cada aba tem apenas uma finalidade.</p></div><div class="vr452-tabs"><button class="vr452-tab is-active" data-vr452-tab="geral">Geral</button><button class="vr452-tab" data-vr452-tab="espacos">Valores dos espaços</button><button class="vr452-tab" data-vr452-tab="boleto">Boleto/Banco</button><button class="vr452-tab" data-vr452-tab="telegram">Telegram</button><button class="vr452-tab" data-vr452-tab="email">E-mail</button><button class="vr452-tab" data-vr452-tab="whatsapp">WhatsApp</button><button class="vr452-tab" data-vr452-tab="atualizacao">Atualização</button><button class="vr452-tab" data-vr452-tab="permissoes">Permissões</button><button class="vr452-tab" data-vr452-tab="emergencia">Emergência</button></div><div class="vr452-panel is-active" data-vr452-panel="geral"><h3>Geral</h3><div class="vr452-grid"><div class="vr452-card"><h3>Versão</h3><p><b data-vr452-version>${DISPLAY_VERSION}</b></p></div><div class="vr452-card"><h3>Organização</h3><p>Cadastros em Cadastros. Rotina em Operação. Configurações isoladas por aba.</p></div></div></div><div class="vr452-panel" data-vr452-panel="espacos"><h3>Valores dos espaços</h3><p>Cadastre os espaços e valores usados nas reservas.</p><div class="vr452-card"><div data-vr452-spaces-list></div><div class="vr452-row"><button class="vr452-btn" data-vr452-add-space>Adicionar espaço</button><button class="vr452-btn primary" data-vr452-save-spaces>Salvar valores</button></div><div class="vr452-status" data-vr452-spaces-status>Aguardando carregamento.</div></div></div><div class="vr452-panel" data-vr452-panel="boleto"><h3>Boleto/Banco</h3><div class="vr452-grid"><div class="vr452-card">${checkbox('Ativar emissão de boleto','asaasEnabled')}<div class="vr452-field"><span>Ambiente</span><select data-vr452-field="asaasEnvironment"><option value="sandbox">Sandbox/teste</option><option value="production">Produção</option></select></div>${field('API Key banco/Asaas','asaasApiKey','password','preencha apenas para alterar')}${field('Dias antes do vencimento','dueDaysBeforeReservation','number','2')}${field('Multa (%)','fineValue','number','2')}${field('Juros (%)','interestValue','number','1')}<div class="vr452-row"><button class="vr452-btn primary" data-vr452-save-asaas>Salvar boleto</button><button class="vr452-btn" data-vr452-test-asaas>Testar</button></div></div><div class="vr452-card"><h3>Status</h3><div class="vr452-status" data-vr452-asaas-status>Carregando...</div><div class="vr452-note">A chave não aparece depois de salva.</div></div></div></div><div class="vr452-panel" data-vr452-panel="telegram"><h3>Telegram</h3><div class="vr452-grid"><div class="vr452-card">${checkbox('Ativar Telegram','telegramEnabled')}${field('Usuário do bot','telegramBotUsername','text','vitoriaregia_bot')}${field('Token do bot','telegramBotToken','password','preencha apenas para alterar')}${field('Chat ID teste','telegramTestChatId','text','opcional')}<div class="vr452-row"><button class="vr452-btn primary" data-vr452-save-channels>Salvar Telegram</button><button class="vr452-btn" data-vr452-test-channel="telegram">Testar</button></div></div><div class="vr452-card"><h3>Status</h3><div class="vr452-status" data-vr452-channel-status>Carregando...</div></div></div></div><div class="vr452-panel" data-vr452-panel="email"><h3>E-mail</h3><div class="vr452-grid"><div class="vr452-card">${checkbox('Ativar e-mail','emailEnabled')}${field('Host SMTP','smtpHost','text','smtp.mailersend.net')}${field('Porta','smtpPort','text','587')}${field('Usuário SMTP','smtpUser','text','usuário')}${field('Senha SMTP','smtpPassword','password','preencha apenas para alterar')}${field('Remetente','emailFrom','text','Nome <email@dominio.com>')}${field('E-mail teste','emailTestTo','email','destino')}<div class="vr452-row"><button class="vr452-btn primary" data-vr452-save-channels>Salvar e-mail</button><button class="vr452-btn" data-vr452-test-channel="email">Testar</button></div></div><div class="vr452-card"><h3>Status</h3><div class="vr452-status" data-vr452-email-status>Carregando...</div></div></div></div><div class="vr452-panel" data-vr452-panel="whatsapp"><h3>WhatsApp</h3><div class="vr452-grid"><div class="vr452-card">${checkbox('Ativar WhatsApp','whatsappEnabled')}${field('Provedor','whatsappProvider','text','Periskope')}${field('Periskope ID','periskopeId','text','ID')}${field('URL API','periskopeApiUrl','text','URL')}${field('Token/API Key','periskopeToken','password','preencha apenas para alterar')}${field('WhatsApp teste','whatsappTestTo','text','5561999999999')}<div class="vr452-row"><button class="vr452-btn primary" data-vr452-save-channels>Salvar WhatsApp</button><button class="vr452-btn" data-vr452-test-channel="whatsapp">Testar</button></div></div><div class="vr452-card"><h3>Status</h3><div class="vr452-status" data-vr452-whatsapp-status>Carregando...</div></div></div></div><div class="vr452-panel" data-vr452-panel="atualizacao">${updateBlock('config')}</div><div class="vr452-panel" data-vr452-panel="permissoes"><h3>Permissões</h3><div class="vr452-grid"><div class="vr452-card"><h3>Morador</h3><p>Somente suas reservas, encomendas e financeiro da unidade.</p></div><div class="vr452-card"><h3>Admin/Síndico</h3><p>Configurações, financeiro administrativo, cadastros e atualização.</p></div><div class="vr452-card"><h3>Portaria</h3><p>Operação, visitantes e encomendas sem unidade vinculada.</p></div><div class="vr452-card"><h3>Financeiro morador</h3><p>Permissão separada do financeiro do prédio.</p></div></div></div><div class="vr452-panel" data-vr452-panel="emergencia"><h3>Emergência</h3><div class="vr452-grid"><div class="vr452-card"><h3>Interface segura</h3><p>Sem checkbox visível e sem mostrar usuário/perfil/unidade.</p></div><div class="vr452-card">${field('Assistência elevador','elevatorCompany','text','empresa')}${field('Telefone elevador','elevatorPhone','text','telefone')}<button class="vr452-btn primary" data-vr452-save-emergency>Salvar emergência</button></div></div></div></div>`;
    bindConfig(sec);
    loadAllConfig();
  }

  function bindTabs(root) {
    root.querySelectorAll('[data-vr452-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-vr452-tab');
        root.querySelectorAll('[data-vr452-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
        root.querySelectorAll('[data-vr452-panel]').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-vr452-panel') === name));
      });
    });
  }

  function bindConfig(sec) {
    bindTabs(sec);
    sec.querySelectorAll('[data-vr452-add-space]').forEach(btn => btn.addEventListener('click', () => addSpaceRow({ name:'', price:0, deposit:0 })));
    sec.querySelectorAll('[data-vr452-save-spaces]').forEach(btn => btn.addEventListener('click', saveSpaces));
    sec.querySelectorAll('[data-vr452-save-channels]').forEach(btn => btn.addEventListener('click', saveChannels));
    sec.querySelectorAll('[data-vr452-test-channel]').forEach(btn => btn.addEventListener('click', () => testChannel(btn.getAttribute('data-vr452-test-channel'))));
    sec.querySelectorAll('[data-vr452-save-asaas]').forEach(btn => btn.addEventListener('click', saveAsaas));
    sec.querySelectorAll('[data-vr452-test-asaas]').forEach(btn => btn.addEventListener('click', testAsaas));
    sec.querySelectorAll('[data-vr452-save-emergency]').forEach(btn => btn.addEventListener('click', saveEmergency));
    bindUpdate(sec);
    sec.querySelectorAll('[data-vr452-check-version]').forEach(btn => btn.addEventListener('click', updateVersionUI));
  }

  function setField(key, value, sensitive) {
    document.querySelectorAll(`[data-vr452-field="${key}"]`).forEach(el => {
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else if (sensitive) { el.value = ''; el.placeholder = value ? 'já configurado — preencha apenas para alterar' : 'preencha para configurar'; }
      else el.value = value ?? '';
    });
  }
  function getField(key) {
    const el = document.querySelector(`[data-vr452-field="${key}"]`);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  async function loadAllConfig() { await loadState(); loadSpaces(); loadChannels(); loadAsaas(); loadEmergency(); }

  function loadSpaces() {
    const settings = (appState && appState.settings) || {};
    const spaces = Array.isArray(settings.spaces) ? settings.spaces : [];
    const list = document.querySelector('[data-vr452-spaces-list]');
    if (!list) return;
    list.innerHTML = '';
    if (!spaces.length) addSpaceRow({ name:'Salão de festas', price:0, deposit:0 });
    else spaces.forEach(addSpaceRow);
    setText('[data-vr452-spaces-status]', 'Valores carregados.');
  }
  function addSpaceRow(space) {
    const list = document.querySelector('[data-vr452-spaces-list]');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'vr452-space-row';
    row.innerHTML = `<div class="vr452-field"><span>Espaço</span><input data-space-name value="${escapeHTML(space.name || space.label || '')}"></div><div class="vr452-field"><span>Taxa</span><input type="number" min="0" step="0.01" data-space-price value="${Number(space.price || space.value || 0)}"></div><div class="vr452-field"><span>Caução</span><input type="number" min="0" step="0.01" data-space-deposit value="${Number(space.deposit || 0)}"></div><button class="vr452-btn warn" type="button">Remover</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }
  async function saveSpaces() {
    try {
      const rows = Array.from(document.querySelectorAll('.vr452-space-row'));
      const spaces = rows.map((row, index) => ({ id: row.querySelector('[data-space-name]').value.trim().toLowerCase().replace(/\W+/g,'-') || 'espaco-' + index, name: row.querySelector('[data-space-name]').value.trim() || 'Espaço', price: Number(row.querySelector('[data-space-price]').value || 0), deposit: Number(row.querySelector('[data-space-deposit]').value || 0) }));
      const nextSettings = { ...((appState && appState.settings) || {}), spaces };
      await saveStatePatch({ settings: nextSettings });
      setText('[data-vr452-spaces-status]', '✅ Valores dos espaços salvos.');
    } catch (error) { setText('[data-vr452-spaces-status]', '⚠️ ' + error.message); }
  }

  async function loadChannels() {
    try {
      const res = await fetch('/api/admin/channels/settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar canais.');
      channels = data.settings || {};
      ['telegramEnabled','telegramBotUsername','telegramTestChatId','emailEnabled','smtpHost','smtpPort','smtpUser','emailFrom','emailTestTo','whatsappEnabled','whatsappProvider','periskopeId','periskopeApiUrl','whatsappTestTo'].forEach(k => setField(k, channels[k]));
      ['telegramBotToken','smtpPassword','periskopeToken'].forEach(k => setField(k, channels[k], true));
      setChannelStatus('✅ Canais carregados.');
    } catch (error) { setChannelStatus('⚠️ ' + error.message); }
  }
  async function saveChannels() {
    try {
      const next = { ...(channels || {}) };
      ['telegramEnabled','telegramBotUsername','telegramTestChatId','emailEnabled','smtpHost','smtpPort','smtpUser','emailFrom','emailTestTo','whatsappEnabled','whatsappProvider','periskopeId','periskopeApiUrl','whatsappTestTo'].forEach(k => { const v = getField(k); if (v !== undefined) next[k] = v; });
      ['telegramBotToken','smtpPassword','periskopeToken'].forEach(k => { const v = getField(k); if (v) next[k] = v; });
      const res = await fetch('/api/admin/channels/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha ao salvar.');
      channels = data.settings || next;
      await loadChannels();
      setChannelStatus('✅ Configuração salva.');
    } catch (error) { setChannelStatus('⚠️ ' + error.message); }
  }
  async function testChannel(channel) {
    try {
      setChannelStatus('Testando ' + channel + '...');
      const body = { ...(channels || {}) };
      ['telegramTestChatId','emailTestTo','whatsappTestTo','telegramBotUsername'].forEach(k => { const v = getField(k); if (v) body[k] = v; });
      const res = await fetch('/api/admin/channels/test/' + channel, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha no teste.');
      setChannelStatus('✅ ' + (data.message || 'Teste concluído.'));
    } catch (error) { setChannelStatus('⚠️ ' + error.message); }
  }
  function setChannelStatus(text) { setText('[data-vr452-channel-status], [data-vr452-email-status], [data-vr452-whatsapp-status]', text); }

  async function loadAsaas() {
    try {
      const res = await fetch('/api/integrations/asaas', { cache:'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar boleto.');
      asaas = data.config || {};
      setField('asaasEnabled', asaas.enabled);
      setField('asaasEnvironment', asaas.environment || 'sandbox');
      setField('asaasApiKey', asaas.apiKeySaved || asaas.apiKey, true);
      setField('dueDaysBeforeReservation', asaas.dueDaysBeforeReservation);
      setField('fineValue', asaas.fineValue);
      setField('interestValue', asaas.interestValue);
      setText('[data-vr452-asaas-status]', '✅ Boleto carregado. Chave: ' + (asaas.apiKeySaved ? 'configurada' : 'não configurada') + '.');
    } catch (error) { setText('[data-vr452-asaas-status]', '⚠️ ' + error.message); }
  }
  async function saveAsaas() {
    try {
      const next = { enabled: Boolean(getField('asaasEnabled')), environment: getField('asaasEnvironment') || 'sandbox', dueDaysBeforeReservation: Number(getField('dueDaysBeforeReservation') || 2), fineValue: Number(getField('fineValue') || 0), interestValue: Number(getField('interestValue') || 0) };
      const key = getField('asaasApiKey');
      if (key) next.apiKey = key;
      const res = await fetch('/api/integrations/asaas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha ao salvar boleto.');
      await loadAsaas();
      setText('[data-vr452-asaas-status]', '✅ Boleto/Banco salvo.');
    } catch (error) { setText('[data-vr452-asaas-status]', '⚠️ ' + error.message); }
  }
  async function testAsaas() {
    try {
      setText('[data-vr452-asaas-status]', 'Testando boleto/banco...');
      const res = await fetch('/api/integrations/test-asaas', { method:'POST' });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha no teste.');
      setText('[data-vr452-asaas-status]', '✅ Integração respondeu. Ambiente: ' + (data.environment || 'configurado') + '.');
    } catch (error) { setText('[data-vr452-asaas-status]', '⚠️ ' + error.message); }
  }
  function loadEmergency() {
    const e = (appState && appState.emergencySettings) || {};
    setField('elevatorCompany', e.elevatorCompany);
    setField('elevatorPhone', e.elevatorPhone);
  }
  async function saveEmergency() {
    try {
      const emergencySettings = { ...((appState && appState.emergencySettings) || {}), elevatorCompany: getField('elevatorCompany') || '', elevatorPhone: getField('elevatorPhone') || '' };
      await saveStatePatch({ emergencySettings });
      alert('Configuração de emergência salva.');
    } catch (error) { alert('Erro: ' + error.message); }
  }

  function bindUpdate(root) {
    root.querySelectorAll('[data-vr452-send-update]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => sendUpdate(btn.getAttribute('data-vr452-send-update') || 'config'));
    });
    root.querySelectorAll('[data-vr452-update-file]').forEach(input => {
      if (input.dataset.bound) return;
      input.dataset.bound = '1';
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-vr452-update-file') || 'config';
        const selected = input.files && input.files[0];
        updateProgress(key, selected && selected.name === EXPECTED_ZIP ? 5 : 0, selected ? ('Arquivo selecionado: ' + escapeHTML(selected.name)) : 'Nenhum arquivo selecionado.');
      });
    });
  }
  function sendUpdate(key) {
    const input = document.querySelector(`[data-vr452-update-file="${key}"]`);
    const file = input && input.files && input.files[0];
    if (!file) return updateProgress(key, 0, 'Selecione o ZIP antes de enviar.');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/system/upload-update?filename=' + encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.upload.onprogress = event => { if (event.lengthComputable) { const pct = Math.round((event.loaded / event.total) * 35); updateProgress(key, pct, 'Enviando ZIP... ' + pct + '%'); } };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 2) updateProgress(key, 45, 'Validando ZIP no servidor...');
      if (xhr.readyState === 3) updateProgress(key, 78, 'Atualizando GitHub e preparando deploy...');
      if (xhr.readyState === 4) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) updateProgress(key, 100, '✅ Atualização enviada. ' + (data.deployTriggered ? 'Deploy acionado.' : 'Faça Clear build cache & deploy no Render, se necessário.'));
          else updateProgress(key, 0, '❌ ' + (data.error || 'Falha na atualização.'));
        } catch (_) { updateProgress(key, 0, '❌ Resposta inválida do servidor.'); }
      }
    };
    xhr.onerror = () => updateProgress(key, 0, '❌ Erro de conexão.');
    updateProgress(key, 10, 'Iniciando atualização...');
    xhr.send(file);
  }
  function updateProgress(key, pct, msg) {
    const bar = document.querySelector(`[data-vr452-update-bar="${key}"]`);
    const status = document.querySelector(`[data-vr452-update-status="${key}"]`);
    if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (status) status.innerHTML = msg;
  }

  function ensureHelp() {
    if (!logged()) return;
    const sec = document.getElementById('manual');
    if (!sec || sec.dataset.vr452Ready) return;
    sec.dataset.vr452Ready = '1';
    sec.className = 'section vr452-help-ready';
    sec.setAttribute('data-section', '');
    sec.innerHTML = `<div class="vr452-help vr452-wrap"><div class="vr452-hero"><h2>Ajuda e suporte</h2><p>Manuais, vídeos simples, aplicativos, contato e atualização do sistema.</p></div><div class="vr452-tabs"><button class="vr452-tab is-active" data-vr452-tab="manuals">Manuais</button><button class="vr452-tab" data-vr452-tab="videos">Vídeos</button><button class="vr452-tab" data-vr452-tab="apps">Apps</button><button class="vr452-tab" data-vr452-tab="suporte">Suporte</button>${isAdmin() ? '<button class="vr452-tab" data-vr452-tab="updateHelp">Atualizar</button>' : ''}</div><div class="vr452-panel is-active" data-vr452-panel="manuals"><h3>Manuais por perfil</h3><div class="vr452-grid three"><button class="vr452-action" data-vr452-open-manual="morador"><span>🏠</span><b>Morador</b><small>Reservas, encomendas, financeiro e emergência.</small></button><button class="vr452-action" data-vr452-open-manual="portaria"><span>🛡️</span><b>Portaria</b><small>Visitantes, encomendas e ocorrências.</small></button><button class="vr452-action" data-vr452-open-manual="sindico"><span>👤</span><b>Síndico</b><small>Cadastros, financeiro, boletos e configurações.</small></button></div><div class="vr452-manual-body" data-vr452-manual-body>Escolha um manual para abrir aqui mesmo.</div></div><div class="vr452-panel" data-vr452-panel="videos"><h3>Vídeos explicativos</h3><div class="vr452-grid three"><button class="vr452-action" data-vr452-video="primeiro-acesso"><span>▶️</span><b>Primeiro acesso</b><small>Login, senha e perfil.</small></button><button class="vr452-action" data-vr452-video="encomendas"><span>▶️</span><b>Encomendas</b><small>Como registrar e retirar.</small></button><button class="vr452-action" data-vr452-video="financeiro"><span>▶️</span><b>Financeiro</b><small>Morador e síndico.</small></button></div><div class="vr452-manual-body" data-vr452-video-body>Clique em um vídeo para abrir o roteiro visual.</div></div><div class="vr452-panel" data-vr452-panel="apps"><h3>Aplicativos</h3><div class="vr452-grid"><div class="vr452-card"><h3>Android</h3><p>Baixe o APK conforme seu perfil.</p><button class="vr452-btn primary" data-vr452-go="app-android">Abrir área de apps</button></div><div class="vr452-card"><h3>iOS/PWA</h3><p>No iPhone, abra o site e use “Adicionar à Tela de Início”.</p></div></div></div><div class="vr452-panel" data-vr452-panel="suporte"><h3>Fale com o suporte</h3><div class="vr452-grid"><div class="vr452-card"><h3>Enviar mensagem pelo sistema</h3>${field('Seu assunto','supportSubject','text','Ex.: Dúvida sobre cadastro')}${field('Mensagem','supportMessage','text','Descreva o problema')}<button class="vr452-btn primary" data-vr452-send-support>Enviar mensagem</button><div class="vr452-status" data-vr452-support-status>Aguardando mensagem.</div></div><div class="vr452-card"><h3>WhatsApp</h3><p>Abre uma conversa com mensagem padrão e identificação do sistema.</p><a class="vr452-btn primary" target="_blank" rel="noopener" href="https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent('Olá, preciso de suporte no Sistema Vitória Régia.')}">Abrir WhatsApp</a></div></div></div>${isAdmin() ? `<div class="vr452-panel" data-vr452-panel="updateHelp">${updateBlock('help')}</div>` : ''}</div>`;
    bindTabs(sec);
    sec.querySelectorAll('[data-vr452-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr452-go'))));
    sec.querySelectorAll('[data-vr452-open-manual]').forEach(btn => btn.addEventListener('click', () => openManual(btn.getAttribute('data-vr452-open-manual'))));
    sec.querySelectorAll('[data-vr452-video]').forEach(btn => btn.addEventListener('click', () => openVideo(btn.getAttribute('data-vr452-video'))));
    sec.querySelector('[data-vr452-send-support]')?.addEventListener('click', sendSupport);
    bindUpdate(sec);
  }

  function openManual(type) {
    const body = document.querySelector('[data-vr452-manual-body]');
    const texts = {
      morador: '<h4>Manual do morador</h4><ol><li>Entre com usuário e senha.</li><li>Use Reservas para solicitar área comum.</li><li>Use Encomendas para acompanhar entregas.</li><li>Use Financeiro morador para ver somente dados da sua unidade.</li><li>Use Emergência apenas quando necessário.</li></ol>',
      portaria: '<h4>Manual da portaria</h4><ol><li>Registre visitantes em Visitantes.</li><li>Registre encomendas com foto e etiqueta.</li><li>Use Operação para rotinas rápidas.</li><li>Em emergência, escolha o tipo e confirme.</li></ol>',
      sindico: '<h4>Manual do síndico</h4><ol><li>Use Cadastros para moradores, equipe e visitantes.</li><li>Use Financeiro para receitas, despesas e boletos.</li><li>Use Configurações para Telegram, e-mail, WhatsApp, boleto e atualização.</li><li>Use Ajuda → Atualizar para enviar novo ZIP.</li></ol>'
    };
    if (body) body.innerHTML = texts[type] || 'Manual não encontrado.';
  }
  function openVideo(type) {
    const body = document.querySelector('[data-vr452-video-body]');
    const texts = {
      'primeiro-acesso': '<h4>Vídeo: Primeiro acesso</h4><p>1. Abrir o sistema. 2. Digitar usuário e senha. 3. Conferir saudação. 4. Usar os atalhos principais.</p>',
      encomendas: '<h4>Vídeo: Encomendas</h4><p>1. Portaria registra a entrega. 2. Sistema analisa etiqueta/foto. 3. Morador recebe aviso. 4. Retirada é confirmada.</p>',
      financeiro: '<h4>Vídeo: Financeiro</h4><p>Morador vê apenas sua unidade. Síndico vê administração, boletos, despesas e relatórios.</p>'
    };
    if (body) body.innerHTML = texts[type] || 'Vídeo não encontrado.';
  }
  async function sendSupport() {
    const subject = getField('supportSubject') || 'Suporte Sistema Vitória Régia';
    const msg = getField('supportMessage') || '';
    const user = session();
    const text = `Sistema Vitória Régia\nUsuário: ${user.name || user.nome || user.email || 'não identificado'}\nPerfil: ${role()}\n\n${msg}`;
    setText('[data-vr452-support-status]', 'Enviando...');
    try {
      const res = await fetch('/api/notifications/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ channels:['email'], email: SUPPORT_EMAIL, subject, message: text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha ao enviar.');
      setText('[data-vr452-support-status]', '✅ Mensagem enviada.');
    } catch (error) {
      const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      setText('[data-vr452-support-status]', '⚠️ Envio pelo sistema falhou. Abrindo e-mail...');
      location.href = mail;
    }
  }

  function fixEmergency() {
    document.querySelectorAll('.vr-emergency-user-card').forEach(el => el.remove());
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length > 8) return;
      const txt = el.textContent || '';
      if (txt.includes('Usuário identificado') && txt.includes('Perfil') && txt.includes('Unidade')) el.classList.add('vr452-emergency-hidden');
    });
    document.querySelectorAll('.vr-emergency-type').forEach(card => {
      const input = card.querySelector('input[type="radio"], input[type="checkbox"]');
      if (!input) return;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      function refresh() {
        document.querySelectorAll('.vr-emergency-type').forEach(c => c.classList.remove('is-selected'));
        if (input.checked) card.classList.add('is-selected');
      }
      if (!card.dataset.vr452Bound) {
        card.dataset.vr452Bound = '1';
        card.addEventListener('click', event => {
          if (event.target !== input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          refresh();
        });
        card.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
        });
        input.addEventListener('change', refresh);
      }
      refresh();
    });
  }

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(el => {
      el.textContent = text;
    });
  }

  function runNow() {
    updateVersionUI();
    if (!logged()) return;
    compactMenu();
    renderDashboard();
    ensureCadastroHub();
    ensureOperacaoHub();
    ensureConfig();
    ensureHelp();
    fixEmergency();
    updateVersionUI();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; runNow(); }, 200);
  }
  document.addEventListener('DOMContentLoaded', async () => { await loadVersion(); await loadState(); runNow(); });
  window.addEventListener('load', async () => { await loadVersion(); await loadState(); runNow(); });
  window.addEventListener('hashchange', () => setTimeout(runNow, 100));
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
