
// Vitória Régia v4.5.6 — versão fixa + notificação do que mudou
(function () {
  const VERSION = 'v4.5.6';
  const SUFFIX = 'rodape-notificacao-versao-sem-segredos';
  const DISPLAY_VERSION = VERSION + '-' + SUFFIX;
  const RELEASE_NOTES = ["Rodapé agora força a versão correta em todas as telas.", "Notificação de atualização mostra claramente o que mudou.", "Aviso de versão aparece no Início após login.", "Registro da última versão fica salvo no navegador para evitar oscilação.", "Mantidas as configurações mobile completas e o clima somente no Início.", "Sem tokens, senhas ou dados sensíveis."];
  const STORAGE_KEY = 'vitoriaRegia.lastSeenVersion';
  const VERSION_KEY = 'vitoriaRegia.currentVersion';
  let scheduled = false;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  function applyVersionEverywhere() {
    localStorage.setItem(VERSION_KEY, DISPLAY_VERSION);

    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      if (el.textContent !== DISPLAY_VERSION) el.textContent = DISPLAY_VERSION;
    });

    document.querySelectorAll('.system-version-footer, [data-system-version-footer]').forEach(el => {
      el.setAttribute('data-current-version', DISPLAY_VERSION);
    });

    // Remove variações antigas de versão na tela de login para não oscilar.
    document.querySelectorAll('.vr443-login-version,.vr446-login-version,.vr451-login-version,.vr452-login-version,.vr453-login-version,.vr454-login-version,.vr455-login-version').forEach(el => el.remove());

    if (!logged()) {
      document.body.classList.add('auth-locked');
      let loginVersion = document.querySelector('.vr456-login-version');
      if (!loginVersion) {
        loginVersion = document.createElement('div');
        loginVersion.className = 'vr452-login-version vr456-login-version';
        loginVersion.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(loginVersion);
      }
      const strong = loginVersion.querySelector('strong');
      if (strong) strong.textContent = DISPLAY_VERSION;
      loginVersion.style.display = 'block';
    } else {
      document.body.classList.remove('auth-locked');
      document.querySelectorAll('.vr456-login-version').forEach(el => el.style.display = 'none');
    }
  }

  function releaseListHTML() {
    return '<ul class="vr456-release-list">' + RELEASE_NOTES.map(item => '<li>' + escapeHTML(item) + '</li>').join('') + '</ul>';
  }

  function ensureReleaseCard() {
    if (!logged()) return;

    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"], #dashboard');
    if (!dash) return;

    let host = dash.querySelector('.vr455-inicio, .vr453-inicio, .vr452-dashboard, .vr450-home, .vr447-home') || dash;

    let card = dash.querySelector('[data-vr456-release-card]');
    if (!card) {
      card = document.createElement('section');
      card.className = 'vr456-release-card';
      card.setAttribute('data-vr456-release-card', 'true');
      card.innerHTML = `
        <h3>🔔 Atualização do sistema ${escapeHTML(VERSION)}</h3>
        <p>Veja o que foi atualizado nesta versão:</p>
        ${releaseListHTML()}
        <div class="vr456-release-actions">
          <button type="button" class="vr456-btn primary" data-vr456-open-config>Configurações</button>
          <button type="button" class="vr456-btn" data-vr456-dismiss>Entendi</button>
        </div>
      `;

      const shortcuts = host.querySelector('.vr455-shortcuts, .vr453-shortcuts, .vr452-grid, .vr450-actions, .vr447-actions');
      if (shortcuts) host.insertBefore(card, shortcuts);
      else host.appendChild(card);

      card.querySelector('[data-vr456-open-config]')?.addEventListener('click', () => {
        const nav = document.querySelector('[href="#configuracoes"][data-nav]');
        if (nav) nav.click();
        else {
          location.hash = 'configuracoes';
          document.querySelectorAll('[data-section], .section').forEach(sec => sec.classList.toggle('is-active', sec.id === 'configuracoes'));
        }
      });

      card.querySelector('[data-vr456-dismiss]')?.addEventListener('click', () => {
        localStorage.setItem(STORAGE_KEY, VERSION);
        card.remove();
      });
    }
  }

  function ensureToastOnce() {
    if (!logged()) return;
    if (localStorage.getItem(STORAGE_KEY) === VERSION) return;
    if (document.querySelector('.vr456-toast')) return;

    const toast = document.createElement('div');
    toast.className = 'vr456-toast';
    toast.innerHTML = `
      <h3>🔔 Sistema atualizado para ${escapeHTML(VERSION)}</h3>
      <p>${escapeHTML(RELEASE_NOTES.slice(0, 3).join(' • '))}</p>
      <div class="vr456-release-actions">
        <button type="button" class="vr456-btn primary" data-vr456-see-notes>Ver detalhes</button>
        <button type="button" class="vr456-btn" data-vr456-close-toast>Fechar</button>
      </div>
    `;
    document.body.appendChild(toast);

    toast.querySelector('[data-vr456-see-notes]')?.addEventListener('click', () => {
      toast.remove();
      ensureReleaseCard();
      const card = document.querySelector('[data-vr456-release-card]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    toast.querySelector('[data-vr456-close-toast]')?.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, VERSION);
      toast.remove();
    });

    setTimeout(() => {
      if (document.body.contains(toast)) {
        localStorage.setItem(STORAGE_KEY, VERSION);
        toast.remove();
      }
    }, 12000);
  }

  function injectNotificationState() {
    // Mantém um registro local para telas/ícones de notificação que leem localStorage.
    const key = 'vitoriaRegia.full.v1.notices';
    let notices = [];
    try {
      notices = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(notices)) notices = [];
    } catch (_) {
      notices = [];
    }

    const id = 'system-update-' + VERSION;
    if (!notices.some(n => n && n.id === id)) {
      notices.unshift({
        id,
        type: 'system-update',
        title: 'Sistema atualizado para ' + VERSION,
        message: RELEASE_NOTES.join(' '),
        public: false,
        createdAt: new Date().toISOString(),
        version: VERSION
      });
      localStorage.setItem(key, JSON.stringify(notices.slice(0, 20)));
    }
  }

  function runNow() {
    applyVersionEverywhere();
    injectNotificationState();
    if (logged()) {
      ensureReleaseCard();
      ensureToastOnce();
    }
    applyVersionEverywhere();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      runNow();
    }, 250);
  }

  document.addEventListener('DOMContentLoaded', runNow);
  window.addEventListener('load', runNow);
  window.addEventListener('hashchange', () => setTimeout(runNow, 120));
  setInterval(applyVersionEverywhere, 1500);
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
})();
