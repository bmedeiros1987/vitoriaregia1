/* Vitória Régia — Dashboard compacto e botões rápidos por perfil
   Mantém o sistema original, apenas reorganiza visualmente e cria atalhos seguros.
*/
(function () {
  'use strict';

  const STORAGE_PREFIX = 'vitoriaRegia.full.v1.';
  const SESSION_KEY = `${STORAGE_PREFIX}session`;
  const COMPACT_KEY = 'vr_dashboard_compact_enabled_v1';

  const ROLE_LABELS = {
    morador: 'Morador',
    sindico: 'Síndico / Administração',
    subsindico: 'Subsíndico',
    administrador: 'Administração',
    admin: 'Administração',
    portaria: 'Portaria',
    porteiro: 'Portaria',
    zelador: 'Zeladoria'
  };

  const ACTIONS = {
    morador: [
      { id: 'reservar', label: 'Solicitar reserva', hint: 'Salão, churrasqueira e áreas comuns', icon: '📅', tab: 'reservas', variant: 'primary' },
      { id: 'encomendas', label: 'Minhas encomendas', hint: 'Pendências da unidade', icon: '📦', tab: 'encomendas' },
      { id: 'visitante-recorrente', label: 'Visitante recorrente', hint: 'Pré-cadastrar prestador ou familiar', icon: '👤', tab: 'visitantes-recorrentes' },
      { id: 'comunicados', label: 'Comunicados', hint: 'Avisos do condomínio', icon: '📢', tab: 'comunicados' },
      { id: 'servicos', label: 'Solicitar serviço', hint: 'Tags, controle, compras e pedidos', icon: '🛠️', tab: 'servicos' },
      { id: 'contato', label: 'Falar com portaria/síndico', hint: 'Contato protegido pelo sistema', icon: '✉️', tab: 'contato' },
      { id: 'emergencia', label: 'Emergência', hint: 'Acionar portaria e síndico', icon: '🚨', custom: 'panic', variant: 'danger' }
    ],
    portaria: [
      { id: 'registrar-encomenda', label: 'Registrar encomenda', hint: 'Leitura de etiqueta e aviso ao morador', icon: '📦', tab: 'encomendas', variant: 'primary' },
      { id: 'registrar-visitante', label: 'Cadastrar visitante', hint: 'Entrada, documento e unidade', icon: '🪪', tab: 'portaria', variant: 'primary' },
      { id: 'recorrentes', label: 'Consultar recorrentes', hint: 'Prestadores e familiares autorizados', icon: '🔎', tab: 'visitantes-recorrentes' },
      { id: 'avisar-morador', label: 'Avisar morador', hint: 'WhatsApp/e-mail operacional', icon: '📲', tab: 'automacoes' },
      { id: 'comunicados', label: 'Comunicados', hint: 'Avisos importantes', icon: '📢', tab: 'comunicados' },
      { id: 'logs', label: 'Logs da portaria', hint: 'Histórico de ações', icon: '🧾', tab: 'atividades-portaria' },
      { id: 'emergencia-admin', label: 'Emergências', hint: 'Painel de confirmação', icon: '🚨', custom: 'panicAdmin', variant: 'warning' }
    ],
    sindico: [
      { id: 'aprovar', label: 'Aprovar cadastros', hint: 'Liberação de moradores', icon: '✅', tab: 'aprovacoes', variant: 'primary' },
      { id: 'moradores', label: 'Moradores', hint: 'Cadastro e consulta por unidade', icon: '🏢', tab: 'moradores' },
      { id: 'usuarios', label: 'Usuários internos', hint: 'Portaria, síndico e permissões', icon: '👥', tab: 'equipe' },
      { id: 'comunicado', label: 'Novo comunicado', hint: 'Geral ou por unidade', icon: '📢', tab: 'comunicados', variant: 'primary' },
      { id: 'financeiro', label: 'Financeiro', hint: 'Cobranças e prestação de contas', icon: '💳', tab: 'financeiro' },
      { id: 'encomendas', label: 'Encomendas', hint: 'Auditoria e pendências', icon: '📦', tab: 'encomendas' },
      { id: 'escala', label: 'Escala', hint: 'Turnos e equipe', icon: '🗓️', tab: 'escala' },
      { id: 'premium', label: 'Central premium', hint: 'Diagnóstico e produção', icon: '⭐', tab: 'excelencia' },
      { id: 'emergencias', label: 'Emergências', hint: 'Confirmar alertas críticos', icon: '🚨', custom: 'panicAdmin', variant: 'danger' }
    ]
  };

  const ADMIN_ALIASES = new Set(['sindico', 'subsíndico', 'subsindico', 'administrador', 'admin', 'gestor', 'gerente']);
  const PORTARIA_ALIASES = new Set(['portaria', 'porteiro', 'zelador', 'seguranca', 'segurança']);

  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function safeJson(value) {
    if (!value || typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function getGlobalSession() {
    try {
      // Top-level `let session` do app.js fica disponível como binding global em scripts clássicos.
      // eslint-disable-next-line no-undef
      if (typeof session !== 'undefined' && session) return session;
    } catch (_) {}
    return null;
  }

  function getStoredSession() {
    const direct = safeJson(localStorage.getItem(SESSION_KEY));
    if (direct) return direct;
    const candidates = ['currentUser', 'user', 'usuario', 'authUser', 'vr_user', 'loggedUser'];
    for (const key of candidates) {
      const parsed = safeJson(localStorage.getItem(key)) || safeJson(sessionStorage.getItem(key));
      if (parsed) return parsed.user || parsed.usuario || parsed.profile || parsed;
    }
    return null;
  }

  function getRole() {
    const source = getGlobalSession() || getStoredSession() || {};
    const raw = source.role || source.perfil || source.tipo || source.cargo || source.accessRole || source.userRole || '';
    let role = normalize(raw);
    if (!role) {
      const text = normalize(qs('[data-current-role]')?.textContent || qs('[data-role-label]')?.textContent || document.body?.textContent?.slice(0, 1200));
      if (text.includes('portaria') || text.includes('porteiro')) role = 'portaria';
      else if (text.includes('sindico') || text.includes('administracao')) role = 'sindico';
      else role = 'morador';
    }
    if (ADMIN_ALIASES.has(role)) return 'sindico';
    if (PORTARIA_ALIASES.has(role)) return 'portaria';
    return 'morador';
  }

  function roleDisplayName(role) {
    const source = getGlobalSession() || getStoredSession() || {};
    const raw = source.role || source.perfil || source.tipo || source.cargo || role;
    const key = normalize(raw);
    return ROLE_LABELS[key] || ROLE_LABELS[role] || 'Perfil atual';
  }

  function isTabAllowed(tabId) {
    if (!tabId) return true;
    try {
      // Se o app original expõe regra de permissão, respeita.
      // eslint-disable-next-line no-undef
      if (typeof tabAllowed === 'function') return Boolean(tabAllowed(tabId));
    } catch (_) {}
    const nav = findTabTrigger(tabId);
    if (!nav) return true;
    if (nav.hidden || nav.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(nav);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function cssEscape(value) {
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    } catch (_) {}
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function findTabTrigger(tabId) {
    const escaped = cssEscape(tabId);
    return qs(`[href="#${escaped}"]`)
      || qs(`[data-tab="${escaped}"]`)
      || qs(`[data-tab-id="${escaped}"]`)
      || qs(`[data-target="#${escaped}"]`)
      || qsa('a, button, [role="tab"]')
        .find((el) => normalize(el.textContent).includes(normalize(tabId.replace(/-/g, ' '))));
  }

  function navigateToTab(tabId) {
    const trigger = findTabTrigger(tabId);
    if (trigger) {
      trigger.click();
      setTimeout(() => {
        const target = document.getElementById(tabId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return;
    }
    const target = document.getElementById(tabId);
    if (target) {
      history.replaceState(null, '', `#${tabId}`);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    location.hash = tabId;
  }

  function openPanic() {
    const selectors = [
      '[data-vr-panic-open]',
      '.vr-panic-floating-button',
      '.vr-panic-button',
      'button[aria-label*="Emerg"]',
      'button[title*="Emerg"]'
    ];
    const found = selectors.map((selector) => qs(selector)).find(Boolean);
    if (found) {
      found.click();
      return;
    }
    alert('Central de emergência indisponível nesta tela. Verifique se o update do botão de pânico está instalado.');
  }

  function openPanicAdmin() {
    const selectors = [
      '[data-vr-panic-admin-open]',
      '.vr-panic-admin-button',
      '[data-vr-panic-open-admin]'
    ];
    const found = selectors.map((selector) => qs(selector)).find(Boolean);
    if (found) {
      found.click();
      return;
    }
    openPanic();
  }

  function handleAction(action) {
    if (action.custom === 'panic') return openPanic();
    if (action.custom === 'panicAdmin') return openPanicAdmin();
    if (action.tab) return navigateToTab(action.tab);
  }

  function getStateCount(name) {
    const parsed = safeJson(localStorage.getItem(`${STORAGE_PREFIX}${name}`));
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && Array.isArray(parsed.value)) return parsed.value.length;
    return 0;
  }

  function getMiniChips(role) {
    const chips = [];
    const packages = getStateCount('packages');
    const bookings = getStateCount('bookings');
    const pending = getStateCount('pendingResidents');
    const notices = getStateCount('notices');

    if (role === 'sindico') {
      chips.push(['✅', `${pending} cadastros pendentes`]);
      chips.push(['📅', `${bookings} reservas`]);
      chips.push(['📢', `${notices} comunicados`]);
    } else if (role === 'portaria') {
      chips.push(['📦', `${packages} encomendas`]);
      chips.push(['👤', `${getStateCount('visitors')} visitantes`]);
      chips.push(['📢', `${notices} comunicados`]);
    } else {
      chips.push(['📦', `${packages} encomendas registradas`]);
      chips.push(['📅', `${bookings} reservas`]);
      chips.push(['📢', `${notices} comunicados`]);
    }
    return chips;
  }

  function dashboardSection() {
    return document.getElementById('dashboard')
      || qs('[data-section="dashboard"]')
      || qs('[data-page="dashboard"]')
      || qsa('section, main > div, main > article').find((el) => normalize(el.textContent).startsWith('dashboard'))
      || qsa('section, main > div, main > article').find((el) => normalize(el.textContent).includes('gestao completa do condominio'));
  }

  function findHero(section) {
    if (!section) return null;
    const reserveLink = qsa('a, button', section).find((el) => normalize(el.textContent).includes('solicitar reserva'));
    if (reserveLink) {
      const container = reserveLink.closest('.hero, .hero-card, .dashboard-hero, .card, .panel, .panel-lite, .content-card')
        || reserveLink.parentElement?.parentElement
        || reserveLink.parentElement;
      if (container) {
        container.dataset.vrDashboardHero = 'true';
        return container;
      }
    }
    const img = qs('img[alt*="Fachada"], img[src*="fachada"], img[src*="predio"], img[src*="building"]', section);
    const container = img?.closest('.hero, .hero-card, .dashboard-hero, .card, .panel, .panel-lite, .content-card') || section.firstElementChild;
    if (container) container.dataset.vrDashboardHero = 'true';
    return container;
  }

  function actionButton(action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `vr-dashboard-action${action.variant ? ` is-${action.variant}` : ''}`;
    btn.dataset.vrDashboardAction = action.id;
    btn.innerHTML = `
      <span class="vr-dashboard-action-icon" aria-hidden="true">${action.icon || '•'}</span>
      <span class="vr-dashboard-action-text">
        <span class="vr-dashboard-action-label">${action.label}</span>
        <span class="vr-dashboard-action-hint">${action.hint || ''}</span>
      </span>
      <span class="vr-dashboard-action-arrow" aria-hidden="true">›</span>
    `;
    btn.addEventListener('click', () => handleAction(action));
    return btn;
  }

  function buildShell(role) {
    const shell = document.createElement('section');
    shell.className = 'vr-dashboard-actions-shell';
    shell.dataset.vrDashboardActions = 'true';

    const header = document.createElement('div');
    header.className = 'vr-dashboard-actions-header';

    const title = document.createElement('div');
    title.className = 'vr-dashboard-actions-title';
    title.innerHTML = `
      <span class="vr-dashboard-kicker">Atalhos inteligentes</span>
      <h3>Ações rápidas do seu perfil</h3>
      <p>Dashboard mais compacto, com os botões mais usados logo no início e permissões respeitadas por perfil.</p>
    `;

    const controls = document.createElement('div');
    controls.className = 'vr-dashboard-actions-header';
    controls.innerHTML = `<span class="vr-dashboard-role-pill">${roleDisplayName(role)}</span>`;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'vr-dashboard-compact-toggle';
    toggle.textContent = 'Modo compacto ativo';
    toggle.addEventListener('click', () => {
      const active = !document.body.classList.contains('vr-dashboard-compact');
      setCompactMode(active);
      toggle.textContent = active ? 'Modo compacto ativo' : 'Ativar compacto';
    });
    controls.appendChild(toggle);

    header.appendChild(title);
    header.appendChild(controls);

    const grid = document.createElement('div');
    grid.className = 'vr-dashboard-actions-grid';
    const actions = (ACTIONS[role] || ACTIONS.morador).filter((item) => !item.tab || isTabAllowed(item.tab));
    actions.forEach((action) => grid.appendChild(actionButton(action)));

    const strip = document.createElement('div');
    strip.className = 'vr-dashboard-mini-strip';
    getMiniChips(role).forEach(([icon, text]) => {
      const chip = document.createElement('span');
      chip.className = 'vr-dashboard-mini-chip';
      chip.textContent = `${icon} ${text}`;
      strip.appendChild(chip);
    });

    shell.appendChild(header);
    shell.appendChild(grid);
    shell.appendChild(strip);
    return shell;
  }

  function setCompactMode(active) {
    document.body.classList.toggle('vr-dashboard-compact', Boolean(active));
    try { localStorage.setItem(COMPACT_KEY, active ? '1' : '0'); } catch (_) {}
  }

  function condenseSecondaryPanels(section) {
    if (!section || section.dataset.vrDashboardCondensed) return;
    section.dataset.vrDashboardCondensed = 'true';
    const candidates = qsa('.card, .panel, .panel-lite, .content-card, article', section);
    candidates.slice(3).forEach((item) => {
      if (!item.contains(qs('[data-vr-dashboard-actions]'))) item.dataset.vrDashboardCondense = 'true';
    });
  }

  function apply() {
    const section = dashboardSection();
    if (!section) return;
    section.classList.add('vr-dashboard-enhanced');

    const compactPref = localStorage.getItem(COMPACT_KEY);
    setCompactMode(compactPref !== '0');

    const role = getRole();
    const existing = qs('[data-vr-dashboard-actions]', section);
    if (existing && existing.dataset.role === role) {
      condenseSecondaryPanels(section);
      return;
    }
    if (existing) existing.remove();

    const shell = buildShell(role);
    shell.dataset.role = role;

    const hero = findHero(section);
    if (hero && hero.parentElement) {
      hero.insertAdjacentElement('afterend', shell);
    } else {
      const h1 = qs('h1', section);
      if (h1) h1.insertAdjacentElement('afterend', shell);
      else section.insertBefore(shell, section.firstChild);
    }

    condenseSecondaryPanels(section);
  }

  let raf = null;
  function scheduleApply() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  }

  document.addEventListener('DOMContentLoaded', scheduleApply);
  window.addEventListener('hashchange', scheduleApply);
  window.addEventListener('storage', scheduleApply);
  document.addEventListener('click', (event) => {
    if (event.target.closest('a, button, [role="tab"]')) setTimeout(scheduleApply, 180);
  });

  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Reavalia após login/carregamento do backend.
  setTimeout(scheduleApply, 450);
  setTimeout(scheduleApply, 1500);
  setTimeout(scheduleApply, 3500);
})();
