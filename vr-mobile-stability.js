(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const NOTIFY_KEY = 'vitoriaRegia.inAppNotifications.v3';

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function isMobile() {
    return window.matchMedia('(max-width: 920px)').matches;
  }

  function sidebar() { return $('[data-sidebar]'); }
  function shadow() { return $('[data-sidebar-shadow]'); }

  function openMenu() {
    const side = sidebar();
    const shade = shadow();
    if (!side) return;
    document.body.classList.remove('sidebar-collapsed');
    side.classList.add('is-open');
    if (shade) shade.classList.add('is-open');
    if (isMobile()) document.body.classList.add('no-scroll');
    side.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    const side = sidebar();
    const shade = shadow();
    if (side) side.classList.remove('is-open');
    if (shade) shade.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    if (side && isMobile()) side.setAttribute('aria-hidden', 'true');
  }

  function ensureMobileCloseButton() {
    const side = sidebar();
    if (!side || $('[data-vr-mobile-menu-close]', side)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vr-mobile-menu-close';
    btn.dataset.vrMobileMenuClose = 'true';
    btn.innerHTML = '<span>Menu</span><strong>Fechar ×</strong>';
    btn.addEventListener('click', closeMenu);
    side.insertBefore(btn, side.firstChild);
  }

  function repairMenuEvents() {
    ensureMobileCloseButton();

    document.addEventListener('click', function (event) {
      const openBtn = event.target.closest('[data-menu-open]');
      if (openBtn) {
        event.preventDefault();
        event.stopPropagation();
        openMenu();
        return;
      }

      if (event.target.closest('[data-sidebar-shadow], [data-vr-mobile-menu-close]')) {
        event.preventDefault();
        closeMenu();
        return;
      }

      const navLink = event.target.closest('[data-sidebar] a[href^="#"], [data-sidebar] [data-nav]');
      if (navLink) {
        const href = navLink.getAttribute('href');
        if (href && href.startsWith('#')) {
          // deixa o app original trocar a seção; fecha a gaveta logo depois
          setTimeout(closeMenu, 60);
        }
      }
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', function () {
      if (!isMobile()) closeMenu();
    });
  }

  function repairNotificationCenter() {
    const panel = $('[data-vr-notification-panel]');
    const btn = $('[data-vr-notification-button]');
    if (!panel || !btn) return;

    const head = $('.vr-notification-head', panel);
    if (head && !$('[data-vr-close-notifications]', head)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'vr-notification-head-actions';
      const mark = $('[data-vr-mark-read]', head);
      if (mark) wrapper.appendChild(mark);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'icon-btn vr-notification-close';
      close.dataset.vrCloseNotifications = 'true';
      close.setAttribute('aria-label', 'Fechar notificações');
      close.textContent = '×';
      wrapper.appendChild(close);
      head.appendChild(wrapper);
    }

    if (!panel.dataset.vrStabilityBound) {
      panel.dataset.vrStabilityBound = 'true';
      panel.addEventListener('click', function (event) {
        if (event.target.closest('[data-vr-close-notifications]')) {
          panel.hidden = true;
          return;
        }
        if (event.target.closest('[data-vr-mark-read]')) {
          const list = readJSON(NOTIFY_KEY, []).map((item) => ({ ...item, read: true }));
          writeJSON(NOTIFY_KEY, list);
          panel.hidden = true;
          window.dispatchEvent(new Event('vr:notifications-updated'));
        }
      }, true);
    }
  }

  function watchNotificationRender() {
    window.addEventListener('vr:notifications-updated', function () {
      setTimeout(repairNotificationCenter, 30);
    });
    const obs = new MutationObserver(function () {
      repairNotificationCenter();
      ensureMobileCloseButton();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    repairMenuEvents();
    repairNotificationCenter();
    watchNotificationRender();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', init);
})();
