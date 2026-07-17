(() => {
  'use strict';

  const DEMO_KEY = 'vr_suite_demo_mode';
  const REOPEN_KEY = 'vr_suite_reopen_tab';
  const LOGIN_RELOAD_KEY = 'vr_suite_login_reloaded';
  let previousUser = localStorage.getItem('vr_user') || '';

  function reopenSuiteWhenReady() {
    const tab = sessionStorage.getItem(REOPEN_KEY);
    if (!tab) return;
    sessionStorage.removeItem(REOPEN_KEY);
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const api = window.VitoriaRegiaPremiumSuite;
      if (api?.open) {
        clearInterval(timer);
        api.open(tab).catch?.(() => null);
      } else if (attempts > 40) clearInterval(timer);
    }, 150);
  }

  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-suite-demo-toggle]');
    if (!toggle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const activeTab = document.querySelector('[data-suite-tab].active')?.getAttribute('data-suite-tab') || 'demonstracao';
    const next = localStorage.getItem(DEMO_KEY) !== 'true';
    localStorage.setItem(DEMO_KEY, String(next));
    sessionStorage.setItem(REOPEN_KEY, activeTab);
    location.reload();
  }, true);

  const loginWatcher = setInterval(() => {
    const currentUser = localStorage.getItem('vr_user') || '';
    if (!previousUser && currentUser && sessionStorage.getItem(LOGIN_RELOAD_KEY) !== 'true') {
      sessionStorage.setItem(LOGIN_RELOAD_KEY, 'true');
      location.reload();
      return;
    }
    if (!currentUser) sessionStorage.removeItem(LOGIN_RELOAD_KEY);
    previousUser = currentUser;
  }, 700);

  window.addEventListener('beforeunload', () => clearInterval(loginWatcher));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reopenSuiteWhenReady, { once:true });
  else reopenSuiteWhenReady();
})();
