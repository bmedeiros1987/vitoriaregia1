(function () {
  const VERSION = 'v3.9.0-mysql-premium-clean';
  const UI_KEY = 'vitoriaRegia.ui.preferences.v3';
  const NOTIFY_KEY = 'vitoriaRegia.inAppNotifications.v3';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
  function getSessionUser() {
    const keys = Object.keys(localStorage).filter((key) => /session|user|usuario|profile/i.test(key));
    for (const key of keys) {
      const value = readJSON(key, null);
      if (value && typeof value === 'object' && (value.name || value.nome || value.email || value.role)) return value;
    }
    return {};
  }
  function firstName(user = {}) {
    const raw = user.name || user.nome || user.fullName || user.email || 'Usuário';
    return String(raw).trim().split(/\s+/)[0] || 'Usuário';
  }

  function applyAccessibility() {
    const prefs = readJSON(UI_KEY, { size: 'normal', contrast: false, reducedMotion: false });
    document.body.classList.toggle('vr-ui-large', prefs.size === 'large');
    document.body.classList.toggle('vr-ui-extra-large', prefs.size === 'extra');
    document.body.classList.toggle('vr-high-contrast', Boolean(prefs.contrast));
    document.body.classList.toggle('vr-reduced-motion', Boolean(prefs.reducedMotion));
  }

  function buildAccessibilityPanel() {
    const settings = $('#configuracoes');
    if (!settings || $('[data-vr-accessibility-panel]')) return;
    const panel = document.createElement('article');
    panel.className = 'panel vr-settings-page';
    panel.dataset.settingsPage = 'acessibilidade';
    panel.dataset.vrAccessibilityPanel = 'true';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="panel-header">
        <div><span class="eyebrow">Acessibilidade</span><h2>Deixar mais fácil de usar</h2><p>Por padrão o sistema fica compacto. Aqui o usuário pode aumentar texto, aumentar contraste ou reduzir movimentos.</p></div>
      </div>
      <div class="vr-accessibility-grid">
        <label class="vr-option-card"><strong>Tamanho normal</strong><small>Visual premium compacto.</small><input type="radio" name="vrTextSize" value="normal"></label>
        <label class="vr-option-card"><strong>Texto maior</strong><small>Melhor para quem prefere leitura confortável.</small><input type="radio" name="vrTextSize" value="large"></label>
        <label class="vr-option-card"><strong>Texto bem grande</strong><small>Indicado para idosos ou baixa visão.</small><input type="radio" name="vrTextSize" value="extra"></label>
        <label class="vr-option-card"><strong>Mais contraste</strong><small>Aumenta contraste das bordas e textos.</small><input type="checkbox" name="vrContrast"></label>
        <label class="vr-option-card"><strong>Menos movimento</strong><small>Remove animações para maior conforto.</small><input type="checkbox" name="vrReducedMotion"></label>
      </div>
      <p class="form-hint" data-vr-accessibility-message></p>
    `;
    settings.appendChild(panel);

    const prefs = readJSON(UI_KEY, { size: 'normal', contrast: false, reducedMotion: false });
    const size = panel.querySelector(`[name="vrTextSize"][value="${prefs.size || 'normal'}"]`) || panel.querySelector('[name="vrTextSize"][value="normal"]');
    if (size) size.checked = true;
    panel.querySelector('[name="vrContrast"]').checked = Boolean(prefs.contrast);
    panel.querySelector('[name="vrReducedMotion"]').checked = Boolean(prefs.reducedMotion);
    panel.addEventListener('change', () => {
      const next = {
        size: panel.querySelector('[name="vrTextSize"]:checked')?.value || 'normal',
        contrast: panel.querySelector('[name="vrContrast"]')?.checked || false,
        reducedMotion: panel.querySelector('[name="vrReducedMotion"]')?.checked || false,
      };
      writeJSON(UI_KEY, next);
      applyAccessibility();
      const msg = $('[data-vr-accessibility-message]');
      if (msg) msg.textContent = 'Preferência salva neste aparelho.';
    });
  }

  function setupSettingsTabs() {
    const settings = $('#configuracoes');
    if (!settings || $('[data-vr-settings-tabs]')) return;
    buildAccessibilityPanel();
    const grids = $$('.content-grid', settings);
    if (grids[0]) { grids[0].classList.add('vr-settings-page'); grids[0].dataset.settingsPage = 'geral'; }
    if (grids[1]) { grids[1].classList.add('vr-settings-page'); grids[1].dataset.settingsPage = 'notificacoes'; grids[1].hidden = true; }
    const appsPanel = document.createElement('article');
    appsPanel.className = 'panel vr-settings-page';
    appsPanel.dataset.settingsPage = 'apps';
    appsPanel.hidden = true;
    appsPanel.innerHTML = `
      <div class="panel-header"><div><span class="eyebrow">Aplicativos</span><h2>Baixar apps para celular</h2><p>Use o app correspondente ao seu perfil. O login identifica automaticamente o que cada usuário pode acessar.</p></div></div>
      <div class="app-download-grid-premium">
        <article class="app-download-panel panel"><div class="app-download-hero"><div class="app-phone-icon">🏠</div><div><h2>Morador</h2><p>Reservas, encomendas, comunicados, financeiro e emergência.</p></div></div><a class="btn btn--primary" href="https://github.com/bmedeiros1987/vitoriaregia1/releases/download/android-morador-latest/vitoria-regia-morador.apk" target="_blank" rel="noopener">Baixar APK Morador</a></article>
        <article class="app-download-panel panel"><div class="app-download-hero"><div class="app-phone-icon">👤</div><div><h2>Síndico</h2><p>Gestão completa, aprovações, financeiro, equipe e permissões.</p></div></div><a class="btn btn--primary" href="https://github.com/bmedeiros1987/vitoriaregia1/releases/download/android-sindico-latest/vitoria-regia-sindico.apk" target="_blank" rel="noopener">Baixar APK Síndico</a></article>
        <article class="app-download-panel panel"><div class="app-download-hero"><div class="app-phone-icon">🛡️</div><div><h2>Portaria</h2><p>Visitantes, encomendas, ocorrências e avisos rápidos.</p></div></div><a class="btn btn--primary" href="https://github.com/bmedeiros1987/vitoriaregia1/releases/download/android-portaria-latest/vitoria-regia-portaria.apk" target="_blank" rel="noopener">Baixar APK Portaria</a></article>
      </div>
    `;
    settings.appendChild(appsPanel);

    const tabs = document.createElement('div');
    tabs.className = 'vr-settings-tabs';
    tabs.dataset.vrSettingsTabs = 'true';
    tabs.innerHTML = `
      <button class="vr-settings-tab is-active" type="button" data-settings-tab="geral">Geral</button>
      <button class="vr-settings-tab" type="button" data-settings-tab="notificacoes">Notificações</button>
      <button class="vr-settings-tab" type="button" data-settings-tab="apps">Apps</button>
      <button class="vr-settings-tab" type="button" data-settings-tab="acessibilidade">Acessibilidade</button>
    `;
    const head = $('.section-head', settings);
    if (head) head.insertAdjacentElement('afterend', tabs); else settings.prepend(tabs);

    tabs.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-settings-tab]');
      if (!btn) return;
      const tab = btn.dataset.settingsTab;
      $$('.vr-settings-tab', tabs).forEach((item) => item.classList.toggle('is-active', item === btn));
      $$('[data-settings-page]', settings).forEach((page) => { page.hidden = page.dataset.settingsPage !== tab; });
    });
  }

  function notificationList() {
    return readJSON(NOTIFY_KEY, []);
  }
  function saveNotificationList(list) {
    writeJSON(NOTIFY_KEY, list.slice(0, 80));
  }
  function pushNotification(title, text, type = 'info') {
    const list = notificationList();
    list.unshift({ id: Date.now() + '-' + Math.random().toString(16).slice(2), title, text, type, date: new Date().toISOString(), read: false });
    saveNotificationList(list);
    renderNotificationCenter();
  }
  window.VRNotifyApp = { push: pushNotification, list: notificationList };

  function ensureNotificationCenter() {
    if ($('[data-vr-notification-button]')) return;
    const topbarActions = $('.topbar-actions') || $('.topbar');
    if (!topbarActions) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn vr-notification-btn';
    btn.dataset.vrNotificationButton = 'true';
    btn.title = 'Notificações do app';
    btn.setAttribute('aria-label', 'Abrir notificações do app');
    btn.innerHTML = '🔔<span class="vr-notification-count" data-vr-notification-count hidden>0</span>';
    topbarActions.prepend(btn);

    const panel = document.createElement('div');
    panel.className = 'vr-notification-panel';
    panel.dataset.vrNotificationPanel = 'true';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="vr-notification-head">
        <div><h3>Notificações</h3><small>Central interna do aplicativo</small></div>
        <div class="vr-notification-head-actions">
          <button class="btn btn--outline btn--sm" type="button" data-vr-mark-read>Marcar lidas</button>
          <button class="icon-btn vr-notification-close" type="button" data-vr-close-notifications aria-label="Fechar notificações">×</button>
        </div>
      </div>
      <div data-vr-notification-list></div>
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', () => { panel.hidden = !panel.hidden; renderNotificationCenter(); });
    panel.querySelector('[data-vr-close-notifications]')?.addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('[data-vr-mark-read]')?.addEventListener('click', () => {
      saveNotificationList(notificationList().map((item) => ({ ...item, read: true })));
      renderNotificationCenter();
      panel.hidden = true;
    });
    panel.addEventListener('click', (event) => {
      const readBtn = event.target.closest('[data-vr-notification-read]');
      const removeBtn = event.target.closest('[data-vr-notification-remove]');
      const itemNode = event.target.closest('[data-vr-notification-id]');
      if (!itemNode) return;
      const id = itemNode.dataset.vrNotificationId;
      if (readBtn) {
        saveNotificationList(notificationList().map((item) => item.id === id ? { ...item, read: true } : item));
        renderNotificationCenter();
        return;
      }
      if (removeBtn) {
        saveNotificationList(notificationList().filter((item) => item.id !== id));
        renderNotificationCenter();
        return;
      }
      if (!event.target.closest('button,a')) {
        saveNotificationList(notificationList().map((item) => item.id === id ? { ...item, read: true } : item));
        renderNotificationCenter();
      }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') panel.hidden = true; });
    document.addEventListener('click', (event) => {
      if (panel.hidden) return;
      if (panel.contains(event.target) || btn.contains(event.target)) return;
      panel.hidden = true;
    }, true);
  }
  function renderNotificationCenter() {
    ensureNotificationCenter();
    const list = notificationList();
    const unread = list.filter((item) => !item.read).length;
    const count = $('[data-vr-notification-count]');
    if (count) { count.hidden = unread === 0; count.textContent = unread > 9 ? '9+' : String(unread); }
    const box = $('[data-vr-notification-list]');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="vr-notification-empty">Nenhuma notificação interna por enquanto.</div>'; return; }
    box.innerHTML = list.slice(0, 12).map((item) => `
      <div class="vr-notification-item ${item.read ? 'is-read' : 'is-unread'}" data-type="${escapeHTML(item.type)}" data-vr-notification-id="${escapeHTML(item.id)}">
        <strong>${item.read ? '' : '• '}${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.text || '')}</span>
        <small>${new Date(item.date).toLocaleString('pt-BR')}</small>
        <div class="vr-notification-item-actions">
          ${item.read ? '' : '<button class="btn btn--outline btn--sm" type="button" data-vr-notification-read>Lida</button>'}
          <button class="btn btn--ghost btn--sm" type="button" data-vr-notification-remove>Remover</button>
        </div>
      </div>
    `).join('');
  }
  function seedNotificationOnce() {
    const key = 'vitoriaRegia.notification.seed.v390';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    pushNotification('Sistema atualizado', 'Visual premium clean ativado. Notificações internas, WhatsApp, Telegram e e-mail ficam em Configurações.', 'success');
  }

  function ensureEmergencyButton() {
    // remove duplicações geradas por versões antigas
    $$('.vr-global-panic, .panic-button-floating, .vr-panic-floating').forEach((el) => el.remove());
    if ($('[data-vr-floating-emergency]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vr-floating-emergency';
    btn.dataset.vrFloatingEmergency = 'true';
    btn.title = 'Emergência';
    btn.setAttribute('aria-label', 'Abrir emergência');
    btn.innerHTML = '🚨';
    btn.addEventListener('click', () => {
      const user = getSessionUser();
      const ok = confirm('Acionar emergência? O aviso vai primeiro para síndico e portaria. Eles confirmam antes de avisar os demais moradores.');
      if (!ok) return;
      pushNotification('Emergência acionada', `${firstName(user)} solicitou atendimento. Síndico e portaria devem confirmar ou resetar o alarme.`, 'emergency');
      const payload = { type: 'emergency', user: firstName(user), role: user.role || '', apartment: user.apartment || '', date: new Date().toISOString() };
      if (navigator.sendBeacon) {
        try { navigator.sendBeacon('/api/panic', new Blob([JSON.stringify(payload)], { type: 'application/json' })); } catch (_) {}
      }
      alert('Emergência registrada. Síndico e portaria serão os primeiros avisados.');
    });
    document.body.appendChild(btn);
  }

  function improveHelpSection() {
    const section = $('#manual');
    if (!section || section.dataset.vrImproved === 'true') return;
    section.dataset.roles = 'morador,sindico,portaria';
    section.dataset.vrImproved = 'true';
    section.innerHTML = `
      <div class="section-head">
        <div><span class="eyebrow">Ajuda simples</span><h2>Manuais e suporte</h2><p>Guias objetivos, feitos para qualquer pessoa usar: criança, adulto ou idoso. Clique no manual do seu perfil.</p></div>
      </div>
      <div class="vr-help-grid">
        <article class="vr-help-card"><span>📚</span><h3>Manual completo</h3><p>Guia detalhado com todas as abas, cadastros, financeiro, administração e emergência.</p><a class="btn btn--primary" href="docs/Manual_Completo_do_Sistema_v4.2.8.pdf" target="_blank">Abrir manual completo</a></article>
        <article class="vr-help-card"><span>👨‍👩‍👧</span><h3>Moradores</h3><p>Aprenda a ver comunicados, reservas, encomendas, visitantes, financeiro e emergência.</p><a class="btn btn--primary" href="docs/Manual_dos_Moradores_v4.2.8.pdf" target="_blank">Abrir manual</a></article>
        <article class="vr-help-card"><span>🛡️</span><h3>Portaria</h3><p>Passo a passo para registrar visitantes, encomendas, fotos e avisos.</p><a class="btn btn--primary" href="docs/Manual_da_Portaria_v4.2.8.pdf" target="_blank">Abrir manual</a></article>
        <article class="vr-help-card"><span>👤</span><h3>Síndico/Administração</h3><p>Cadastros, permissões, financeiro, notificações e configurações.</p><a class="btn btn--primary" href="docs/Manual_do_Sindico_v4.2.8.pdf" target="_blank">Abrir manual</a></article>
        <article class="vr-help-card"><span>📘</span><h3>Funcionalidades</h3><p>Visão geral do sistema e de todos os módulos disponíveis.</p><a class="btn btn--outline" href="docs/Funcionalidades_do_Sistema_v4.2.8.pdf" target="_blank">Ver funcionalidades</a></article>
      </div>
    `;
  }

  function cleanLoginCopy() {
    const h1 = $('[data-login-form] h1');
    const p = $('[data-login-form] p');
    if (h1) h1.textContent = 'Entrar no sistema';
    if (p) p.textContent = 'Use apenas seu usuário e senha. O perfil é identificado automaticamente.';
    const signupTab = $('[data-auth-tab="signup"]');
    if (signupTab) signupTab.textContent = 'Ainda não é cadastrado?';
  }

  function updateVersionFooter() {
    const footer = $('[data-system-version-footer] strong');
    if (footer) footer.textContent = VERSION;
    document.title = 'Vitória Régia | Sistema Premium';
  }

  function defaultSidebarCollapsed() {
    try {
      if (localStorage.getItem('vr_sidebar_collapsed') === null && window.matchMedia('(min-width: 921px)').matches) {
        localStorage.setItem('vr_sidebar_collapsed', '1');
        document.body.classList.add('sidebar-collapsed');
      }
    } catch (_) {}
  }

  function init() {
    applyAccessibility();
    defaultSidebarCollapsed();
    cleanLoginCopy();
    setupSettingsTabs();
    improveHelpSection();
    ensureNotificationCenter();
    ensureEmergencyButton();
    updateVersionFooter();
    seedNotificationOnce();
    renderNotificationCenter();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav], [data-shortcut]');
    if (nav) setTimeout(() => { improveHelpSection(); setupSettingsTabs(); ensureNotificationCenter(); ensureEmergencyButton(); }, 80);
  });
})();
