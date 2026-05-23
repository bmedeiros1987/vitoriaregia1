
// Vitória Régia v4.4.6 — login fix sem observers pesados
(function () {
  const VERSION = 'v4.4.6-mysql-login-fix';
  let installed = false;

  function isAuthenticated() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(
      document.body.classList.contains('vr-authenticated') ||
      (app && !app.hidden && (!login || login.hidden))
    );
  }

  function ensureVersionFooter() {
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      if (el.textContent !== VERSION) el.textContent = VERSION;
    });

    const logged = isAuthenticated();
    document.body.classList.toggle('auth-locked', !logged);

    let el = document.querySelector('.vr446-login-version');
    if (!logged) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'vr446-login-version';
        el.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(el);
      }
      const strong = el.querySelector('strong');
      if (strong && strong.textContent !== VERSION) strong.textContent = VERSION;
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  function removeOldFloatingLoginVersions() {
    document.querySelectorAll('.vr443-login-version').forEach(el => el.remove());
  }

  function protectLoginButtons() {
    const login = document.querySelector('[data-login-screen], .login-screen, .auth-card, .login-card');
    if (!login) return;
    login.style.pointerEvents = 'auto';
    login.querySelectorAll('button,input,select,textarea,a').forEach(el => {
      el.style.pointerEvents = 'auto';
      el.disabled = false;
    });
  }

  function run() {
    removeOldFloatingLoginVersions();
    ensureVersionFooter();
    protectLoginButtons();
  }

  function start() {
    if (installed) return;
    installed = true;

    run();
    window.addEventListener('load', run);
    window.addEventListener('hashchange', () => setTimeout(run, 80));

    // Observer leve e debounced, sem loop.
    let timer = null;
    const obs = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        run();
      }, 350);
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: false });

    // Reforço curto apenas no início, depois para.
    let count = 0;
    const int = setInterval(() => {
      run();
      count += 1;
      if (count >= 8 || isAuthenticated()) clearInterval(int);
    }, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
