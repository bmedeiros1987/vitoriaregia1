(() => {
  'use strict';

  const NAV_SELECTORS = [
    '.subTabs',
    '.configTabs',
    '.vrReservaToolbar',
    '.vr-integrated-root .vr-suite-layout > nav',
    '[data-vr-sticky-tabs]'
  ];
  const CARD_SELECTORS = [
    '.cards article', '.appCards article', '.metric', '.panel', '.subpanel', '.settingsCard', '.logCard',
    '.vr-suite-card', '.vr-suite-metric', '.vr-suite-row', '.vr-suite-timeline', '.vr-suite-quick-actions button',
    '.vr-call-card', '.vr-setup-step', '.vr-apk-grid article', '.noticeBox'
  ];
  let timer = null;

  function nearestScrollHost(node) {
    let current = node?.parentElement || null;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) return current;
      current = current.parentElement;
    }
    return document.querySelector('.appShell > .content') || document.scrollingElement;
  }

  function centerActive(nav) {
    const active = nav.querySelector('button.active, button[aria-current="page"], [role="tab"][aria-selected="true"]');
    if (!active || nav.scrollWidth <= nav.clientWidth + 4) return;
    const left = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
    if (Math.abs(nav.scrollLeft - left) > 8) nav.scrollTo({ left, behavior:'smooth' });
  }

  function stabilizeNav(nav) {
    if (!(nav instanceof HTMLElement)) return;
    nav.classList.add('vr-stable-nav');
    nav.setAttribute('data-vr-stable-nav', 'true');
    const host = nearestScrollHost(nav);
    if (host instanceof HTMLElement) host.style.scrollPaddingTop = '84px';
    centerActive(nav);
  }

  function stabilizeCard(card) {
    if (!(card instanceof HTMLElement)) return;
    card.classList.add('vr-safe-card');
    card.style.minWidth = '0';
    card.querySelectorAll('h1,h2,h3,h4,h5,p,b,strong,small,span,em,label,dd,dt,button,a').forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      node.style.minWidth = '0';
      node.style.maxWidth = '100%';
    });
  }

  function sync() {
    NAV_SELECTORS.forEach(selector => document.querySelectorAll(selector).forEach(stabilizeNav));
    CARD_SELECTORS.forEach(selector => document.querySelectorAll(selector).forEach(stabilizeCard));

    const mobile = matchMedia('(max-width: 860px)').matches;
    document.documentElement.style.setProperty('--vr-stable-top', '0px');
    document.body.classList.toggle('vr-mobile-stability-active', mobile);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(sync, 40);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.subTabs button,.configTabs button,.vrReservaToolbar button,.vr-suite-layout>nav button,[role="tab"]');
    if (button) setTimeout(() => centerActive(button.parentElement), 30);
  }, true);

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class','aria-selected','aria-current'] });
  addEventListener('resize', schedule, { passive:true });
  addEventListener('orientationchange', schedule, { passive:true });
  addEventListener('pageshow', schedule, { passive:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once:true });
  else sync();
})();
