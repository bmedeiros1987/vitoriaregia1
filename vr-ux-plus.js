(function () {
  const STORAGE_KEYS = [
    'currentUser', 'user', 'loggedUser', 'authUser', 'profile', 'residentUser', 'moradorAtual'
  ];

  function safeParse(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  function capitalizeName(name) {
    if (!name) return 'Usuário';
    const first = String(name).trim().split(/\s+/)[0] || 'Usuário';
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  function getUserName() {
    const candidates = [];

    for (const key of STORAGE_KEYS) {
      const parsed = safeParse(localStorage.getItem(key));
      if (!parsed) continue;
      if (typeof parsed === 'string') candidates.push(parsed);
      if (typeof parsed === 'object') {
        candidates.push(parsed.name, parsed.nome, parsed.fullName, parsed.full_name, parsed.username, parsed.userName);
      }
    }

    const domCandidates = Array.from(document.querySelectorAll('[data-user-name], .user-name, .profile-name, .welcome-name'))
      .map(el => el.getAttribute('data-user-name') || el.textContent)
      .filter(Boolean);

    candidates.push(...domCandidates);

    const chosen = candidates.find(v => v && String(v).trim() && String(v).trim().length <= 60);
    return capitalizeName(chosen || 'Usuário');
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function getProfileLabel() {
    const candidates = [
      localStorage.getItem('userRole'),
      localStorage.getItem('role'),
      localStorage.getItem('perfil')
    ].map(safeParse).filter(Boolean);

    const role = String(candidates[0] || '').toLowerCase();
    if (role.includes('sind')) return 'Síndico';
    if (role.includes('port')) return 'Portaria';
    if (role.includes('admin')) return 'Administração';
    if (role.includes('morad')) return 'Morador';
    return 'Acesso autorizado';
  }

  function resolveBuildingBackground() {
    const explicit = localStorage.getItem('vrBuildingBackground');
    if (explicit) return `url("${explicit}")`;

    const scoreImage = (img) => {
      const clues = [img.alt, img.title, img.className, img.src].join(' ').toLowerCase();
      let score = 0;
      if (/pred|pr[eé]dio|condom|fachada|building|resid/.test(clues)) score += 4;
      if (img.naturalWidth >= 600) score += 2;
      if (img.naturalHeight >= 300) score += 1;
      return score;
    };

    const images = Array.from(document.images || [])
      .map(img => ({ img, score: scoreImage(img) }))
      .sort((a, b) => b.score - a.score);

    if (images.length && images[0].score > 0 && images[0].img.src) {
      return `url("${images[0].img.src}")`;
    }

    return null;
  }

  function findDashboardMount() {
    const selectors = [
      '[data-page="dashboard"]', '#dashboard', '.dashboard', '.dashboard-page', '.page-dashboard', '.content', 'main'
    ];
    return selectors.map(sel => document.querySelector(sel)).find(Boolean) || document.body;
  }

  function injectHero() {
    if (document.querySelector('.vr-dashboard-hero')) return;

    const mount = findDashboardMount();
    if (!mount) return;

    const name = getUserName();
    const greeting = getGreeting();
    const profile = getProfileLabel();
    const background = resolveBuildingBackground();
    if (background) {
      document.documentElement.style.setProperty('--vr-building-bg', background);
    }

    const hero = document.createElement('section');
    hero.className = 'vr-dashboard-hero';
    hero.innerHTML = `
      <div class="vr-dashboard-hero__content">
        <div class="vr-dashboard-hero__copy">
          <div class="vr-dashboard-hero__eyebrow">🏢 Vitória Régia • Área do condomínio</div>
          <h1 class="vr-dashboard-hero__title">${greeting}, ${name}.</h1>
          <p class="vr-dashboard-hero__subtitle">Acompanhe suas ações mais importantes em um painel mais leve, com a imagem do prédio ao fundo e acesso rápido às funções essenciais do seu perfil.</p>
          <div class="vr-dashboard-hero__chips">
            <span class="vr-dashboard-hero__chip">👤 ${profile}</span>
            <span class="vr-dashboard-hero__chip">📣 Comunicados em destaque</span>
            <span class="vr-dashboard-hero__chip">🛡️ Emergência disponível em qualquer página</span>
          </div>
        </div>
        <div class="vr-dashboard-hero__meta">
          <div class="vr-dashboard-hero__meta-card">
            <div class="vr-dashboard-hero__meta-label">Saudação automática</div>
            <div class="vr-dashboard-hero__meta-value">${greeting}</div>
          </div>
          <div class="vr-dashboard-hero__meta-card">
            <div class="vr-dashboard-hero__meta-label">Usuário ativo</div>
            <div class="vr-dashboard-hero__meta-value">${name}</div>
          </div>
        </div>
      </div>
    `;

    mount.insertBefore(hero, mount.firstChild);
  }

  function clickExistingPanic() {
    const selectors = [
      '[data-action="panic"]',
      '[data-open="panic"]',
      '.vr-panic-trigger',
      '.panic-button',
      '#panicButton',
      '#vr-panic-button',
      'button[title*="Pânico"]',
      'button[aria-label*="Pânico"]',
      'button[title*="Emerg"]',
      'button[aria-label*="Emerg"]'
    ];
    const existing = selectors.map(sel => document.querySelector(sel)).find(Boolean);
    if (existing) {
      existing.click();
      return true;
    }
    if (window.VRPanic && typeof window.VRPanic.open === 'function') {
      window.VRPanic.open();
      return true;
    }
    if (window.vrPanicCenter && typeof window.vrPanicCenter.open === 'function') {
      window.vrPanicCenter.open();
      return true;
    }
    return false;
  }

  function injectPanicButton() {
    if (document.querySelector('.vr-global-panic')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vr-global-panic';
    button.setAttribute('aria-label', 'Abrir botão de pânico');
    button.title = 'Emergência';
    button.innerHTML = '<span class="vr-global-panic__icon" aria-hidden="true">🚨</span><span class="vr-global-panic__label">Emergência</span>';
    button.addEventListener('click', function () {
      if (clickExistingPanic()) return;
      const confirmed = window.confirm('Deseja abrir a central de emergência? O aviso seguirá primeiro para síndico e portaria.');
      if (!confirmed) return;
      window.location.hash = '#emergencia';
    });
    document.body.appendChild(button);
  }

  function init() {
    injectHero();
    injectPanicButton();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  const observer = new MutationObserver(() => {
    if (!document.querySelector('.vr-dashboard-hero')) injectHero();
    if (!document.querySelector('.vr-global-panic')) injectPanicButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
