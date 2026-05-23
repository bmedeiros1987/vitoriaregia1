
// Vitória Régia v4.5.0 — sistema premium organizado e sem dados sensíveis
(function () {
  const VERSION = 'v4.5.0-premium-organizado-sem-segredos';
  const EXPECTED_ZIP = 'vitoriaregia_update_v4.5.0.zip';
  let scheduled = false;

  const ROUTES = {
    dashboard: { label:'Início', icon:'🏠', group:'principal', roles:['morador','sindico','admin','owner','portaria'] },
    cadastros: { label:'Cadastros', icon:'🗂️', group:'principal', roles:['sindico','admin','owner','portaria'] },
    aprovacoes: { label:'Aprovações', icon:'✅', group:'principal', roles:['sindico','admin','owner'] },
    financeiro: { label:'Financeiro', icon:'💰', group:'principal', roles:['morador','sindico','admin','owner'] },
    comunicados: { label:'Comunicados', icon:'📣', group:'principal', roles:['morador','sindico','admin','owner','portaria'] },
    encomendas: { label:'Encomendas', icon:'📦', group:'operacao', roles:['morador','sindico','admin','owner','portaria'] },
    visitantes: { label:'Visitantes', icon:'👥', group:'operacao', roles:['morador','sindico','admin','owner','portaria'], target:'visitantes-recorrentes' },
    portaria: { label:'Portaria', icon:'🛡️', group:'operacao', roles:['sindico','admin','owner','portaria'] },
    reservas: { label:'Reservas', icon:'📅', group:'morador', roles:['morador','sindico','admin','owner','portaria'] },
    calendario: { label:'Calendário', icon:'🗓️', group:'morador', roles:['morador','sindico','admin','owner'] },
    servicos: { label:'Serviços', icon:'🧹', group:'morador', roles:['morador','sindico','admin','owner'] },
    arquivos: { label:'Arquivos', icon:'📁', group:'documentos', roles:['morador','sindico','admin','owner','portaria'] },
    manual: { label:'Ajuda', icon:'❔', group:'documentos', roles:['morador','sindico','admin','owner','portaria'] },
    apps: { label:'Apps', icon:'📲', group:'documentos', roles:['morador','sindico','admin','owner','portaria'], target:'app-android' },
    configuracoes: { label:'Configurações', icon:'⚙️', group:'sistema', roles:['sindico','admin','owner'] },
    excelencia: { label:'Central Premium', icon:'💎', group:'sistema', roles:['sindico','admin','owner'] }
  };

  const GROUP_LABELS = {
    principal:'Principal',
    operacao:'Operação',
    morador:'Morador',
    documentos:'Documentos e ajuda',
    sistema:'Sistema'
  };

  function parse(value, fallback) { if (!value) return fallback; try { return JSON.parse(value); } catch (_) { return fallback; } }
  function norm(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function session() {
    const prefix = 'vitoriaRegia.full.v1.';
    return parse(localStorage.getItem(prefix + 'session'), null) || parse(localStorage.getItem('currentUser'), null) || parse(localStorage.getItem('user'), null) || {};
  }
  function role() {
    const s = session();
    const r = norm(s.role || s.staffRole || s.originalRole || s.perfil || s.tipo || '');
    if (r.includes('owner') || r.includes('propriet') || r.includes('dono')) return 'owner';
    if (r.includes('admin')) return 'admin';
    if (r.includes('sind')) return 'sindico';
    if (r.includes('port')) return 'portaria';
    if (r.includes('limp')) return 'limpeza';
    if (r.includes('zel')) return 'zeladoria';
    return 'morador';
  }
  function allowed(route) {
    const r = role();
    return !route.roles || route.roles.includes(r);
  }
  function allowedAdmin() { return ['owner','admin','sindico'].includes(role()); }
  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }
  function firstName() { const s = session(); return String(s.name || s.nome || s.email || 'usuário').trim().split(/\s+/)[0] || 'usuário'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
  function setRoleClass() {
    document.body.classList.remove('vr-role-morador','vr-role-portaria','vr-role-limpeza','vr-role-zeladoria','vr-role-sindico','vr-role-admin','vr-role-owner');
    document.body.classList.add('vr-role-' + role());
  }
  function sectionExists(id) { return Boolean(document.getElementById(id)); }
  function routeTarget(key) { const r = ROUTES[key]; return (r && r.target) || key; }

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
    if (target === 'cadastros') ensureCadastros();
    const real = routeTarget(target);
    const nav = document.querySelector(`[href="#${real}"][data-nav]`);
    if (nav) nav.click();
    else {
      document.querySelectorAll('[data-section], .section').forEach(sec => sec.classList.toggle('is-active', sec.id === real));
      location.hash = real;
    }
    closeMenu();
    setTimeout(runNow, 120);
  }

  function ensureMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    const nav = sidebar?.querySelector('.nav, nav');
    if (!sidebar || !nav) return;

    sidebar.querySelectorAll('.vr440-menu-head,.vr441-menu-head,.vr442-menu-head,.vr447-menu-head,.vr450-menu-head').forEach((el, idx) => { if (!el.classList.contains('vr450-menu-head') || idx > 0) el.remove(); });
    if (!sidebar.querySelector('.vr450-menu-head')) {
      const head = document.createElement('div');
      head.className = 'vr450-menu-head';
      head.innerHTML = '<strong>Menu</strong><button type="button" class="vr450-menu-close" data-vr450-menu-close>Fechar ×</button>';
      sidebar.insertBefore(head, sidebar.firstChild);
    }
    const close = sidebar.querySelector('[data-vr450-menu-close]');
    if (close && !close.dataset.bound450) { close.dataset.bound450 = '1'; close.addEventListener('click', closeMenu); }

    const open = document.querySelector('[data-menu-open]');
    if (open && !open.dataset.bound450) {
      open.dataset.bound450 = '1';
      open.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); openMenu(); }, true);
    }
    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.bound450) { shadow.dataset.bound450 = '1'; shadow.addEventListener('click', closeMenu); }

    if (!nav.dataset.vr450Built) {
      const oldLinks = Array.from(nav.querySelectorAll('a[data-nav]'));
      oldLinks.forEach(a => a.style.display = 'none');

      Object.keys(GROUP_LABELS).forEach(group => {
        const items = Object.entries(ROUTES).filter(([key, cfg]) => cfg.group === group && allowed(cfg) && (sectionExists(routeTarget(key)) || key === 'cadastros'));
        if (!items.length) return;

        const title = document.createElement('div');
        title.className = 'vr450-nav-group';
        title.textContent = GROUP_LABELS[group];
        nav.appendChild(title);

        items.forEach(([key, cfg]) => {
          const a = document.createElement('a');
          a.href = '#' + routeTarget(key);
          a.dataset.nav = '';
          a.dataset.vr450Route = key;
          a.innerHTML = `<span>${cfg.icon}</span><span>${escapeHTML(cfg.label)}</span>`;
          if (key === 'configuracoes' || key === 'cadastros') a.classList.add('vr450-nav-quick');
          a.addEventListener('click', event => { event.preventDefault(); go(key); });
          nav.appendChild(a);
        });
      });
      nav.dataset.vr450Built = '1';
    }
  }

  function visibleNotices() {
    const notices = parse(localStorage.getItem('vitoriaRegia.full.v1.notices'), []);
    const r = role();
    return notices.filter(n => {
      if (!n) return false;
      if (r === 'morador') return n.public === true || n.publico === true || n.fromSyndic || /s[ií]ndico|aviso|comunicado/i.test(String(n.title || n.type || ''));
      return true;
    }).slice(0, 3);
  }
  function action(icon, title, text, target) {
    return `<button class="vr450-action" type="button" data-vr450-go="${target}"><span>${icon}</span><b>${escapeHTML(title)}</b><small>${escapeHTML(text)}</small></button>`;
  }
  function kpi(title, value, note) {
    return `<div class="vr450-kpi"><small>${escapeHTML(title)}</small><b>${escapeHTML(value)}</b><small>${escapeHTML(note)}</small></div>`;
  }

  function renderDashboard() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"]');
    if (!dash) return;
    dash.classList.add('vr450-dashboard-ready');
    let home = dash.querySelector('.vr450-home');
    if (home) return;

    const r = role();
    let subtitle = 'Acesso rápido às principais funções do condomínio.';
    let actions = '';
    if (r === 'morador') {
      subtitle = 'Veja somente o que pertence a você: reservas, encomendas, financeiro da sua unidade e avisos públicos.';
      actions = [
        action('📅','Nova reserva','Solicitar área comum.','reservas'),
        action('💳','Financeiro morador','Boletos e cobranças da sua unidade.','financeiro'),
        action('📦','Minhas encomendas','Consultar entregas.','encomendas'),
        action('👤','Meu perfil','Atualizar dados e senha.','meu-cadastro')
      ].join('');
    } else if (r === 'portaria') {
      subtitle = 'Rotina operacional clara: encomendas, visitantes, ocorrências e comunicação.';
      actions = [
        action('📦','Registrar encomenda','Entrega com foto e leitura da etiqueta.','encomendas'),
        action('👥','Cadastrar visitante','Entrada, recorrência e histórico.','visitantes'),
        action('🛡️','Portaria','Acessos e ocorrências.','portaria'),
        action('❔','Ajuda','Manuais rápidos por perfil.','manual')
      ].join('');
    } else {
      subtitle = 'Painel administrativo limpo para síndico/administração: cadastros, financeiro, canais e atualização.';
      actions = [
        action('🗂️','Cadastros','Moradores, equipe, visitantes e encomendas.','cadastros'),
        action('💰','Financeiro','Administração e financeiro morador.','financeiro'),
        action('⚙️','Configurações','Canais, permissões e sistema.','configuracoes'),
        action('⬆️','Atualização','Enviar ZIP limpo pelo sistema.','configuracoes'),
        action('📣','Comunicados','Avisos públicos e internos.','comunicados'),
        action('❔','Ajuda e apps','Manuais, vídeos e downloads.','manual')
      ].join('');
    }
    const notices = visibleNotices();
    const noticeHtml = `<div class="vr450-alerts"><div class="vr450-section-title"><h3>🔔 Avisos do síndico</h3><small>${notices.length} aviso(s)</small></div>${notices.length ? notices.map(n => `<div class="vr450-alert"><b>${escapeHTML(n.title || 'Aviso')}</b><br>${escapeHTML(n.message || n.text || '')}</div>`).join('') : '<div class="vr450-alert is-empty">Nenhum aviso importante no momento.</div>'}</div>`;

    home = document.createElement('section');
    home.className = 'vr450-home';
    home.innerHTML = `
      <div class="vr450-hero"><div><h2>${greeting()}, ${escapeHTML(firstName())}.</h2><p>${escapeHTML(subtitle)}</p></div><div class="vr450-hero-badge"><b>${VERSION.split('-')[0]}</b><small>versão</small></div></div>
      ${noticeHtml}
      <div class="vr450-section-title"><h3>Ações rápidas</h3><small>botões vinculados</small></div>
      <div class="vr450-actions">${actions}</div>
      <div class="vr450-kpis">${kpi('Perfil', role(), 'acesso detectado pelo login')}${kpi('Privacidade', r === 'morador' ? 'restrita' : 'admin', r === 'morador' ? 'sem dados do prédio' : 'visão administrativa')}${kpi('Canais', 'Render', 'tokens fora do GitHub')}</div>
    `;
    dash.insertBefore(home, dash.firstChild);
    home.querySelectorAll('[data-vr450-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr450-go'))));
  }

  function createButton(label, target, icon, text) {
    return `<button class="vr450-action" type="button" data-vr450-go="${target}"><span>${icon}</span><b>${escapeHTML(label)}</b><small>${escapeHTML(text)}</small></button>`;
  }
  function ensureCadastros() {
    if (!logged()) return;
    let sec = document.getElementById('cadastros');
    if (sec) return sec;
    const main = document.querySelector('main, [data-app], .app-main, .content');
    if (!main) return null;
    sec = document.createElement('section');
    sec.id = 'cadastros';
    sec.className = 'section';
    sec.setAttribute('data-section','');
    sec.setAttribute('data-roles','sindico,admin,owner,portaria');
    sec.innerHTML = `
      <div class="vr450-hub">
        <div class="vr450-hub-hero"><h2>Central de cadastros</h2><p>Tudo que é cadastro fica aqui: pessoas, unidades, equipe, visitantes, encomendas e registros operacionais.</p></div>
        <div class="vr450-grid">
          <div class="vr450-card"><h3>Moradores e unidades</h3><p>Cadastre, aprove e edite moradores. Permite usuário sem unidade para funções administrativas.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="moradores">Abrir moradores</button><button class="vr450-btn" data-vr450-go="aprovacoes">Aprovações</button></div></div>
          <div class="vr450-card"><h3>Equipe e funcionários</h3><p>Administração, portaria, zeladoria e limpeza sem vínculo obrigatório com unidade residencial.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="equipe">Abrir equipe</button><button class="vr450-btn" data-vr450-go="escala">Escalas</button></div></div>
          <div class="vr450-card"><h3>Visitantes</h3><p>Visitantes recorrentes, autorizações e histórico da portaria.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="visitantes">Abrir visitantes</button><button class="vr450-btn" data-vr450-go="portaria">Portaria</button></div></div>
          <div class="vr450-card"><h3>Encomendas</h3><p>Registro de encomendas com foto, leitura da etiqueta e avisos pelos canais configurados.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="encomendas">Abrir encomendas</button></div></div>
          <div class="vr450-card"><h3>Comunicados</h3><p>Avisos do síndico com controle de visibilidade e público.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="comunicados">Abrir comunicados</button></div></div>
          <div class="vr450-card"><h3>Arquivos e documentos</h3><p>Documentos, anexos e materiais do condomínio.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="arquivos">Abrir arquivos</button></div></div>
        </div>
      </div>`;
    main.appendChild(sec);
    sec.querySelectorAll('[data-vr450-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr450-go'))));
    return sec;
  }

  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr450-field"><span>${escapeHTML(label)}</span><input type="${type}" data-vr450-setting="${key}" placeholder="${escapeHTML(placeholder)}"></div>`;
  }
  function ensureConfig() {
    if (!logged() || !allowedAdmin()) return;
    const section = document.querySelector('#configuracoes[data-section], [data-section="configuracoes"], [data-page="configuracoes"]');
    if (!section) return;
    section.classList.add('vr450-config-ready');
    if (!section.querySelector('.vr450-settings')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = configHtml();
      section.insertBefore(wrap.firstElementChild, section.firstChild);
      bindConfig(section.querySelector('.vr450-settings'));
    }
  }
  function configHtml() {
    return `
    <div class="vr450-settings" id="vr450-settings">
      <div class="vr450-settings-hero"><h2>Configurações premium</h2><p>Organizado por setor: sistema, canais, atualização, permissões, financeiro, emergências, apps e ajuda.</p></div>
      <div class="vr450-tabs">
        <button class="vr450-tab is-active" data-vr450-tab="geral">Geral</button>
        <button class="vr450-tab" data-vr450-tab="canais">Canais</button>
        <button class="vr450-tab" data-vr450-tab="atualizacao">Atualização</button>
        <button class="vr450-tab" data-vr450-tab="permissoes">Permissões</button>
        <button class="vr450-tab" data-vr450-tab="financeiro">Financeiro</button>
        <button class="vr450-tab" data-vr450-tab="emergencias">Emergências</button>
        <button class="vr450-tab" data-vr450-tab="apps">Apps/Ajuda</button>
      </div>
      <div class="vr450-panel is-active" data-vr450-panel="geral"><h3>Geral</h3><div class="vr450-grid"><div class="vr450-card"><h3>Versão</h3><p><b>${VERSION}</b></p></div><div class="vr450-card"><h3>Segurança</h3><p>GitHub recebe só código. Tokens e senhas ficam no Render.</p></div><div class="vr450-card"><h3>Organização</h3><p>Cadastros ficam na Central de Cadastros. Configurações ficam setorizadas aqui.</p></div><div class="vr450-card"><h3>Interface</h3><p>Dashboard com uma saudação, avisos e atalhos reais.</p></div></div></div>
      <div class="vr450-panel" data-vr450-panel="canais"><h3>Canais de comunicação</h3><p>Teste canais sem exibir senhas no frontend.</p><div class="vr450-grid"><div class="vr450-card"><h3>Telegram</h3>${field('Usuário do bot','telegramBotUsername','text','ex.: vitoriaregia_bot')}${field('Chat ID de teste','telegramTestChatId','text','opcional')}<div class="vr450-note">TELEGRAM_BOT_TOKEN fica no Render.</div><button class="vr450-btn" type="button" data-vr450-test="telegram">Testar Telegram</button></div><div class="vr450-card"><h3>E-mail</h3>${field('E-mail de teste','emailTestTo','email','ex.: email@dominio.com')}<div class="vr450-note">SMTP/MailerSend ficam no Render.</div><button class="vr450-btn" type="button" data-vr450-test="email">Testar e-mail</button></div><div class="vr450-card"><h3>WhatsApp / Periskope</h3>${field('WhatsApp de teste','whatsappTestTo','text','ex.: 5561999999999')}<div class="vr450-note">PERISKOPE_ID/API_KEY ficam no Render.</div><button class="vr450-btn" type="button" data-vr450-test="whatsapp">Testar WhatsApp</button></div><div class="vr450-card"><h3>Diagnóstico</h3><div class="vr450-status" data-vr450-channel-status>Selecione um teste.</div></div></div></div>
      <div class="vr450-panel" data-vr450-panel="atualizacao"><h3>Atualização do sistema</h3><p>Envie o ZIP limpo diretamente pelo sistema.</p><div class="vr450-grid"><div class="vr450-card"><h3>Enviar ZIP</h3><p>Esperado: <b>${EXPECTED_ZIP}</b></p><input type="file" accept=".zip,application/zip" data-vr450-update-file><div class="vr450-progress"><span data-vr450-progress></span></div><div class="vr450-status" data-vr450-update-status>Selecione o ZIP.</div><div class="vr450-card-actions"><button class="vr450-btn primary" type="button" data-vr450-send-update>Enviar atualização</button><button class="vr450-btn" type="button" data-vr450-check-version>Conferir versão</button></div></div><div class="vr450-card"><h3>Pré-requisitos</h3><p>Configure no Render: GITHUB_UPDATE_TOKEN, GITHUB_REPOSITORY, GITHUB_BRANCH e opcionalmente RENDER_DEPLOY_HOOK_URL.</p><div class="vr450-note">O ZIP é validado pelo backend e enviado ao GitHub sem expor o token no navegador.</div></div></div></div>
      <div class="vr450-panel" data-vr450-panel="permissoes"><h3>Permissões</h3><div class="vr450-grid"><div class="vr450-card"><h3>Morador</h3><p>Reservas, encomendas, perfil, avisos públicos e financeiro da própria unidade.</p></div><div class="vr450-card"><h3>Financeiro morador</h3><p>Permissão separada. Não abre financeiro administrativo.</p></div><div class="vr450-card"><h3>Síndico/Admin</h3><p>Cadastros, financeiro, canais, atualização e configurações.</p></div><div class="vr450-card"><h3>Portaria/Funcionários</h3><p>Operação sem precisar de unidade vinculada.</p></div></div></div>
      <div class="vr450-panel" data-vr450-panel="financeiro"><h3>Financeiro</h3><div class="vr450-grid"><div class="vr450-card"><h3>Administrativo</h3><p>Receitas, despesas, inadimplência e boletos gerais.</p></div><div class="vr450-card"><h3>Morador</h3><p>Boletos e cobranças da unidade do usuário.</p></div><div class="vr450-card"><h3>Banco/Asaas</h3><p>Credenciais ficam no Render.</p></div><div class="vr450-card"><h3>Relatórios</h3><p>Despesas fixas, emergenciais e mensagens no boleto.</p></div></div></div>
      <div class="vr450-panel" data-vr450-panel="emergencias"><h3>Emergências</h3><div class="vr450-grid"><div class="vr450-card"><h3>Botões rápidos</h3><p>Médica, gás, água, energia, elevador e segurança.</p></div><div class="vr450-card"><h3>Idosos e crianças</h3><p>Sem checkbox confuso; ações diretas e visuais.</p></div><div class="vr450-card"><h3>Escala de portaria</h3><p>Alertas devem priorizar porteiros do turno configurado.</p></div><div class="vr450-card"><h3>Canais</h3><p>App, Telegram, e-mail e WhatsApp conforme configuração.</p></div></div></div>
      <div class="vr450-panel" data-vr450-panel="apps"><h3>Apps e ajuda</h3><div class="vr450-grid"><div class="vr450-card"><h3>Downloads</h3><p>APK, PWA/iOS e QR codes ficam em Apps/Ajuda.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="app-android">Abrir apps</button></div></div><div class="vr450-card"><h3>Manuais</h3><p>Manuais e vídeos por perfil.</p><div class="vr450-card-actions"><button class="vr450-btn primary" data-vr450-go="manual">Abrir ajuda</button></div></div></div></div>
    </div>`;
  }
  function bindConfig(root) {
    if (!root) return;
    root.querySelectorAll('[data-vr450-tab]').forEach(tab => tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-vr450-tab');
      root.querySelectorAll('[data-vr450-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
      root.querySelectorAll('[data-vr450-panel]').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-vr450-panel') === name));
    }));
    root.querySelectorAll('[data-vr450-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr450-go'))));
    root.querySelectorAll('[data-vr450-test]').forEach(btn => btn.addEventListener('click', async () => {
      const channel = btn.getAttribute('data-vr450-test');
      const status = root.querySelector('[data-vr450-channel-status]');
      const body = {};
      root.querySelectorAll('[data-vr450-setting]').forEach(input => { if (input.value) body[input.getAttribute('data-vr450-setting')] = input.value; });
      status.textContent = 'Testando ' + channel + '...';
      try {
        const res = await fetch('/api/admin/channels/test/' + channel, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha no teste.');
        status.textContent = '✅ ' + (data.message || 'Teste concluído.');
      } catch (error) { status.textContent = '⚠️ ' + error.message; }
    }));
    bindUpdate(root);
  }
  function bindUpdate(root) {
    const file = root.querySelector('[data-vr450-update-file]');
    const send = root.querySelector('[data-vr450-send-update]');
    const bar = root.querySelector('[data-vr450-progress]');
    const status = root.querySelector('[data-vr450-update-status]');
    function progress(p, msg) { if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%'; if (msg && status) status.innerHTML = msg; }
    file?.addEventListener('change', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Nenhum arquivo selecionado.');
      progress(selected.name === EXPECTED_ZIP ? 5 : 0, selected.name === EXPECTED_ZIP ? '✅ Arquivo correto selecionado.' : '⚠️ Nome diferente do esperado: ' + escapeHTML(selected.name));
    });
    send?.addEventListener('click', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Selecione o ZIP antes de enviar.');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/system/upload-update?filename=' + encodeURIComponent(selected.name));
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 35); progress(p, 'Enviando ZIP... ' + p + '%'); } };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) progress(45, 'Validando no servidor...');
        if (xhr.readyState === 3) progress(78, 'Atualizando GitHub...');
        if (xhr.readyState === 4) {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) progress(100, '✅ Atualização enviada. ' + (data.deployTriggered ? 'Deploy acionado.' : 'Faça Clear build cache & deploy no Render, se necessário.'));
            else progress(0, '❌ ' + (data.error || 'Falha na atualização.'));
          } catch (_) { progress(0, '❌ Resposta inválida do servidor.'); }
        }
      };
      xhr.onerror = () => progress(0, '❌ Erro de conexão.');
      progress(10, 'Iniciando atualização...');
      xhr.send(selected);
    });
    root.querySelector('[data-vr450-check-version]')?.addEventListener('click', () => {
      updateFooter();
      progress(0, 'Versão no rodapé: <b>' + VERSION + '</b>.');
    });
  }
  function updateFooter() { document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => { if (el.textContent !== VERSION) el.textContent = VERSION; }); }
  function runNow() {
    if (!logged()) { updateFooter(); return; }
    setRoleClass();
    ensureCadastros();
    ensureMenu();
    renderDashboard();
    ensureConfig();
    updateFooter();
  }
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; runNow(); }, 250); }
  document.addEventListener('DOMContentLoaded', runNow);
  window.addEventListener('load', runNow);
  window.addEventListener('hashchange', () => setTimeout(runNow, 100));
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
