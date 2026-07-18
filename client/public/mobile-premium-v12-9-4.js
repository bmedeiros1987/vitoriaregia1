(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 860px)';
  let frame = 0;

  function viewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
    return Math.max(320, Math.round(height));
  }

  function forceFixed(node, rules) {
    if (!(node instanceof HTMLElement)) return;
    for (const [name, value] of Object.entries(rules)) node.style.setProperty(name, value, 'important');
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const mobile = matchMedia(MOBILE_QUERY).matches;
      document.documentElement.style.setProperty('--vr-mobile-height', mobile ? `${viewportHeight()}px` : '100dvh');
      document.body.classList.toggle('vr-mobile-premium-fixed', mobile);
      if (!mobile) return;

      forceFixed(document.querySelector('.bottomNav'), {
        position:'fixed',
        left:'10px',
        right:'10px',
        bottom:'calc(8px + env(safe-area-inset-bottom, 0px))',
        'z-index':'100500',
        transform:'none'
      });
      forceFixed(document.querySelector('.mobileMenu'), {
        position:'fixed',
        top:'calc(16px + env(safe-area-inset-top, 0px))',
        left:'18px',
        'z-index':'100700',
        transform:'none'
      });
      forceFixed(document.querySelector('.floatingEmergency'), {
        position:'fixed',
        right:'16px',
        bottom:'calc(120px + env(safe-area-inset-bottom, 0px))',
        'z-index':'100550',
        transform:'none'
      });

      document.querySelectorAll('.vrReservaViewBtns button,.bottomNav button,.subTabs button,.configTabs button').forEach(button => {
        button.style.setProperty('writing-mode', 'horizontal-tb', 'important');
        button.style.setProperty('text-orientation', 'mixed', 'important');
        button.style.setProperty('word-break', 'keep-all', 'important');
      });
    });
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style'] });
  addEventListener('resize', sync, { passive:true });
  addEventListener('orientationchange', sync, { passive:true });
  addEventListener('pageshow', sync, { passive:true });
  window.visualViewport?.addEventListener('resize', sync, { passive:true });
  window.visualViewport?.addEventListener('scroll', sync, { passive:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once:true });
  else sync();
})();
