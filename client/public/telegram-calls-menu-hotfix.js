(() => {
  'use strict';

  const BUTTON_ID = 'vr-telegram-call-native-entry';
  const FALLBACK_ID = 'vr-telegram-call-fallback-entry';
  let enginePromise = null;
  let syncTimer = null;

  function hasSession() {
    return Boolean(localStorage.getItem('vr_token') && localStorage.getItem('vr_user'));
  }

  async function ensureEngine() {
    if (window.VitoriaRegiaTelegramCalls?.open) return window.VitoriaRegiaTelegramCalls;
    if (!enginePromise) {
      enginePromise = import('/telegram-calls.js?v=20260718-menu-hotfix')
        .then(() => window.VitoriaRegiaTelegramCalls || null)
        .catch(error => {
          console.error('[telegram-calls-menu] Falha ao carregar central:', error);
          enginePromise = null;
          return null;
        });
    }
    return enginePromise;
  }

  async function openCalls() {
    const api = await ensureEngine();
    if (api?.open) return api.open();
    alert('A central de chamadas não foi carregada. Atualize a página e tente novamente.');
  }

  function findMenuHost() {
    const selectors = [
      '.appShell > aside > nav',
      '.appShell aside nav',
      'aside nav',
      'nav[aria-label*="menu" i]',
      'nav[aria-label*="navega" i]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return null;
  }

  function createNativeButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'vr-call-native-entry';
    button.setAttribute('aria-label', 'Abrir chamadas pelo Telegram');
    button.innerHTML = '<span class="vr-call-native-icon" aria-hidden="true">☎</span><span class="vr-call-native-label">Chamadas Telegram</span>';
    button.addEventListener('click', openCalls);
    return button;
  }

  function removeFallback() {
    document.getElementById(FALLBACK_ID)?.remove();
  }

  function ensureFallback() {
    if (!hasSession() || !document.querySelector('.appShell')) return;
    if (document.getElementById(FALLBACK_ID)) return;
    const button = document.createElement('button');
    button.id = FALLBACK_ID;
    button.type = 'button';
    button.className = 'vr-call-fallback-entry';
    button.innerHTML = '<span aria-hidden="true">☎</span><b>Chamadas Telegram</b>';
    button.addEventListener('click', openCalls);
    document.body.appendChild(button);
  }

  function ensureMenuEntry() {
    const legacy = document.getElementById('vr-telegram-call-menu');
    if (legacy) {
      legacy.hidden = true;
      legacy.setAttribute('aria-hidden', 'true');
    }

    if (!hasSession()) {
      document.getElementById(BUTTON_ID)?.remove();
      removeFallback();
      return;
    }

    const host = findMenuHost();
    if (!host) {
      ensureFallback();
      return;
    }

    let button = document.getElementById(BUTTON_ID);
    if (button && button.parentElement !== host) {
      button.remove();
      button = null;
    }
    if (!button) button = createNativeButton();

    const configButton = [...host.children].find(node =>
      node !== button && node.matches?.('button') && /configura/i.test(node.textContent || '')
    );
    if (!button.isConnected) host.insertBefore(button, configButton || null);
    else if (configButton && button.nextElementSibling !== configButton) host.insertBefore(button, configButton);

    removeFallback();
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(ensureMenuEntry, 30);
  }

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  window.addEventListener('storage', scheduleSync);
  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });

  function boot() {
    ensureMenuEntry();
    let attempts = 0;
    const interval = setInterval(() => {
      ensureMenuEntry();
      attempts += 1;
      if (attempts >= 30 || document.getElementById(BUTTON_ID)) clearInterval(interval);
    }, 500);
    window.VitoriaRegiaOpenTelegramCalls = openCalls;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
