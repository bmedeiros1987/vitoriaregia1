(() => {
  'use strict';

  const MODULES = {
    executivo: { label:'Visão executiva', icon:'▦' },
    resultados: { label:'Resultados', icon:'↗' },
    convites: { label:'Convites QR', icon:'⌁' },
    manutencao: { label:'Manutenção', icon:'⚙' },
    livro: { label:'Livro digital', icon:'▤' },
    auditoria: { label:'Auditoria', icon:'◎' },
    governanca: { label:'Governança', icon:'⚖' },
    servicos: { label:'Serviços', icon:'◇' },
    financeiro: { label:'Conselho e PIX', icon:'R$' },
    demonstracao: { label:'Demonstração', icon:'▶' },
    comercial: { label:'Planos e proposta', icon:'★' }
  };

  const ROLE_TABS = {
    master: Object.keys(MODULES),
    admin: Object.keys(MODULES),
    sindico: Object.keys(MODULES),
    subsindico: ['executivo','resultados','convites','manutencao','livro','auditoria','governanca','servicos','financeiro','demonstracao'],
    portaria: ['executivo','convites','manutencao','livro'],
    financeiro: ['executivo','resultados','financeiro'],
    funcionario: ['executivo','manutencao','livro','servicos'],
    morador: ['convites','servicos']
  };

  let activeTab = '';
  let syncTimer = null;

  function currentUser() {
    try { return JSON.parse(localStorage.getItem('vr_user') || 'null'); } catch { return null; }
  }

  function currentRole() { return String(currentUser()?.role || 'morador').toLowerCase(); }
  function allowedTabs() { return ROLE_TABS[currentRole()] || ROLE_TABS.morador; }

  function defaultTab() {
    const allowed = allowedTabs();
    return allowed.includes('executivo') ? 'executivo' : allowed[0] || 'convites';
  }

  function suiteApi() { return window.VitoriaRegiaPremiumSuite || null; }

  function openModule(tab = defaultTab()) {
    const allowed = allowedTabs();
    const target = allowed.includes(tab) ? tab : defaultTab();
    const api = suiteApi();
    if (!api?.open) {
      window.setTimeout(() => openModule(target), 120);
      return;
    }
    activeTab = target;
    api.open(target);
    document.body.dataset.vrIntegratedTab = target;
    window.setTimeout(() => { decorateShell(); syncActiveMenu(); }, 40);
  }

  function closeIntegrated() {
    activeTab = '';
    delete document.body.dataset.vrIntegratedTab;
    syncActiveMenu();
  }

  function createMenuButton(tab, compact = false) {
    const item = MODULES[tab];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = compact ? 'vr-integrated-subbutton' : 'vr-integrated-mainbutton';
    button.dataset.vrIntegratedTab = tab;
    button.innerHTML = `<i aria-hidden="true">${item.icon}</i><span>${item.label}</span>`;
    button.addEventListener('click', () => openModule(tab));
    return button;
  }

  function ensureIntegratedMenu() {
    const user = currentUser();
    const host = document.querySelector('.appShell aside nav');
    if (!user || !host) return;

    let section = document.getElementById('vr-integrated-menu');
    if (!section) {
      section = document.createElement('section');
      section.id = 'vr-integrated-menu';
      section.className = 'vr-integrated-menu';
      const configButton = [...host.querySelectorAll(':scope > button')].find(button => /configura/i.test(button.textContent || ''));
      if (configButton) host.insertBefore(section, configButton);
      else host.appendChild(section);
    }

    const allowed = allowedTabs();
    const primary = defaultTab();
    const signature = `${currentRole()}:${allowed.join(',')}:${primary}`;
    if (section.dataset.signature === signature && section.children.length) {
      syncActiveMenu();
      return;
    }
    section.dataset.signature = signature;
    section.replaceChildren();

    const title = document.createElement('small');
    title.className = 'vr-integrated-menu-title';
    title.textContent = 'GESTÃO INTEGRADA';
    section.appendChild(title);

    const main = createMenuButton(primary, false);
    main.querySelector('span').textContent = 'Gestão';
    section.appendChild(main);

    const shortcuts = document.createElement('div');
    shortcuts.className = 'vr-integrated-shortcuts';
    const preferred = ['convites','manutencao','governanca','servicos','financeiro','demonstracao'];
    preferred.filter(tab => allowed.includes(tab) && tab !== primary).slice(0,5).forEach(tab => shortcuts.appendChild(createMenuButton(tab, true)));
    if (shortcuts.children.length) section.appendChild(shortcuts);
    syncActiveMenu();
  }

  function syncActiveMenu() {
    document.querySelectorAll('[data-vr-integrated-tab]').forEach(button => {
      const shouldBeActive = Boolean(activeTab) && (button.dataset.vrIntegratedTab === activeTab || button.classList.contains('vr-integrated-mainbutton'));
      button.classList.toggle('active', shouldBeActive);
    });
  }

  function hideLegacyLauncher() {
    const launcher = document.getElementById('vr-premium-suite-launcher');
    if (launcher && launcher.getAttribute('aria-hidden') !== 'true') launcher.setAttribute('aria-hidden','true');
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function decorateShell() {
    const root = document.getElementById('vr-premium-suite-root');
    if (!root) return;
    root.classList.add('vr-integrated-root');
    root.setAttribute('aria-label','Gestão integrada do condomínio');

    const header = root.querySelector('.vr-suite-header');
    setText(header?.querySelector('h2'), 'Gestão Integrada');
    setText(header?.querySelector('small'), 'Visão executiva, operação, governança e transparência dentro do Vitória Régia.');
    setText(root.querySelector('.vr-suite-nav-footer small'), 'Vitória Régia Pro');

    const allowed = allowedTabs();
    root.querySelectorAll('[data-suite-tab]').forEach(button => {
      const shouldHide = !allowed.includes(button.dataset.suiteTab);
      if (button.hidden !== shouldHide) button.hidden = shouldHide;
    });

    const closeButton = root.querySelector('[data-suite-close].vr-suite-icon-button');
    if (closeButton && !closeButton.dataset.vrIntegratedBound) {
      closeButton.dataset.vrIntegratedBound = 'true';
      closeButton.addEventListener('click', closeIntegrated);
    }

    const backdrop = root.querySelector('.vr-suite-backdrop');
    if (backdrop && !backdrop.dataset.vrIntegratedBound) {
      backdrop.dataset.vrIntegratedBound = 'true';
      backdrop.addEventListener('click', closeIntegrated);
    }

    syncShellPosition();
  }

  function syncShellPosition() {
    const root = document.getElementById('vr-premium-suite-root');
    if (!root) return;
    const shell = document.querySelector('.appShell');
    root.classList.toggle('vr-menu-closed', Boolean(shell?.classList.contains('menu-closed')));
    root.classList.toggle('vr-menu-horizontal', Boolean(shell?.classList.contains('menu-horizontal')));
    root.classList.toggle('vr-menu-floating', Boolean(shell?.classList.contains('menu-floating')));
  }

  function sync() {
    hideLegacyLauncher();
    ensureIntegratedMenu();
    decorateShell();
    const root = document.getElementById('vr-premium-suite-root');
    if (root?.hidden && activeTab) closeIntegrated();
  }

  function scheduleSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, 30);
  }

  document.addEventListener('click', event => {
    const suiteTab = event.target.closest('[data-suite-tab]');
    if (suiteTab) {
      activeTab = suiteTab.dataset.suiteTab || activeTab;
      document.body.dataset.vrIntegratedTab = activeTab;
      window.setTimeout(() => { decorateShell(); syncActiveMenu(); }, 10);
    }
    if (event.target.closest('[data-suite-close]')) closeIntegrated();
  }, true);

  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('resize', syncShellPosition);
  window.addEventListener('storage', scheduleSync);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class','hidden'] });

  function boot() {
    sync();
    window.VitoriaRegiaGestao = { open:openModule, close:closeIntegrated, modules:MODULES };
    document.dispatchEvent(new CustomEvent('vitoria-regia-gestao-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
