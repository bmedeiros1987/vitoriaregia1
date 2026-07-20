(() => {
  'use strict';

  const staleLockClasses = [
    'vr-mobile-menu-lock',
    'vr-sidebar-drawer-open',
    'vr-presentation-modal-open',
    'vr-focus-layer',
    'vr-deletion-open',
    'vr-scanner-open'
  ];

  let scheduled = false;
  let observing = false;

  function isVisible(node) {
    if (!node || !node.isConnected || node.hidden) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function realBlockingLayer() {
    const selectors = [
      '.cameraReaderOverlay',
      '.vrDeletionOverlay',
      '#vr-presentation-modal:not([hidden])',
      '#vr-telegram-call-root:not([hidden])',
      '.criticalEmergencyOverlay',
      '.visitorQrModalOverlay',
      '.reservationRsvpOverlay'
    ];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (isVisible(node)) return node;
      }
    }
    return null;
  }

  function setImportant(node, property, value) {
    if (!node) return;
    if (node.style.getPropertyValue(property) === value && node.style.getPropertyPriority(property) === 'important') return;
    node.style.setProperty(property, value, 'important');
  }

  function unlockDocument() {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const shell = document.querySelector('.appShell');
    const content = document.querySelector('main.content');

    body.classList.remove('vr-scroll-lock-active');
    for (const className of staleLockClasses) body.classList.remove(className);

    setImportant(html, 'overflow-x', 'hidden');
    setImportant(html, 'overflow-y', 'scroll');
    setImportant(html, 'height', 'auto');
    setImportant(html, 'max-height', 'none');

    setImportant(body, 'overflow-x', 'hidden');
    setImportant(body, 'overflow-y', 'visible');
    setImportant(body, 'height', 'auto');
    setImportant(body, 'max-height', 'none');
    setImportant(body, 'position', 'static');
    setImportant(body, 'top', 'auto');
    setImportant(body, 'right', 'auto');
    setImportant(body, 'bottom', 'auto');
    setImportant(body, 'left', 'auto');
    setImportant(body, 'touch-action', 'pan-x pan-y');
    setImportant(body, 'overscroll-behavior', 'auto');

    for (const node of [root, shell, content]) {
      setImportant(node, 'height', 'auto');
      setImportant(node, 'max-height', 'none');
      setImportant(node, 'overflow-y', 'visible');
      setImportant(node, 'touch-action', 'pan-x pan-y');
      setImportant(node, 'overscroll-behavior-y', 'auto');
    }
    if (root) setImportant(root, 'min-height', '100vh');
    if (shell) {
      setImportant(shell, 'min-height', '100vh');
      setImportant(shell, 'position', 'relative');
    }
    if (content) {
      setImportant(content, 'min-height', '100vh');
      setImportant(content, 'position', 'relative');
      setImportant(content, 'contain', 'none');
    }
  }

  function lockDocument() {
    if (!document.body.classList.contains('vr-scroll-lock-active')) document.body.classList.add('vr-scroll-lock-active');
  }

  function synchronize() {
    scheduled = false;
    if (!document.body) return;
    if (realBlockingLayer()) lockDocument();
    else unlockDocument();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(synchronize);
  }

  function start() {
    if (observing || !document.body) return;
    observing = true;
    synchronize();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });

    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pageshow', schedule, { passive: true });
    window.addEventListener('focus', schedule, { passive: true });
    window.addEventListener('hashchange', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule, { passive: true });

    window.setTimeout(synchronize, 250);
    window.setTimeout(synchronize, 1200);
    window.setTimeout(synchronize, 3500);
  }

  window.__vrEnsurePageScroll = synchronize;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
