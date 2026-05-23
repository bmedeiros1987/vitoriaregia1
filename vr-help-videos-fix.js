(function () {
  const VERSION = 'v4.2.8-mysql-telegram-integrado';
  const videos = [
    ['morador', 'Morador', 'Primeiro acesso', 'Entrar no sistema, encontrar os atalhos e usar a ajuda.', 'morador_primeiro_acesso'],
    ['morador', 'Morador', 'Visitantes e encomendas', 'Autorizar visitas e acompanhar entregas com foto.', 'morador_visitantes_encomendas'],
    ['portaria', 'Portaria', 'Rotina rápida', 'Registrar visitantes, encomendas e ocorrências.', 'portaria_rotina'],
    ['sindico', 'Síndico/Administração', 'Administração simples', 'Aprovar usuários, gerenciar permissões e configurações.', 'sindico_administracao'],
    ['todos', 'Todos', 'Emergência segura', 'Como usar o botão com giroflex sem toque acidental.', 'emergencia_segura'],
    ['todos', 'Todos', 'Apps e ajuda', 'Baixar aplicativos, abrir manuais e pedir suporte.', 'apps_e_ajuda'],
  ];

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function allRoles() { return 'morador,sindico,portaria,subsindico,administrador,admin,proprietario,owner'; }

  function makeVideoCard(item) {
    const [profile, label, title, desc, file] = item;
    const src = `assets/help-videos/${file}.mp4`;
    const poster = `assets/help-posters/${file}.png`;
    return `
      <article class="vr-video-card" data-video-profile="${profile}">
        <video controls playsinline preload="metadata" poster="${poster}">
          <source src="${src}" type="video/mp4">
          Seu navegador não conseguiu abrir este vídeo. Use o botão "Abrir vídeo" abaixo.
        </video>
        <div>
          <span>${label}</span>
          <h4>${title}</h4>
          <p>${desc}</p>
          <a class="vr-video-open-link" href="${src}" target="_blank" rel="noopener">▶ Abrir vídeo</a>
        </div>
      </article>`;
  }

  function ensureHelpRoleVisibility() {
    const section = qs('#manual');
    if (section) {
      section.dataset.roles = allRoles();
      section.classList.remove('is-role-hidden');
      section.hidden = false;
    }
    qsa('a[href="#manual"], [data-shortcut="manual"]').forEach((el) => {
      el.dataset.roles = allRoles();
      el.classList.remove('is-role-hidden');
      el.hidden = false;
      el.style.removeProperty('display');
      if (el.matches('a[href="#manual"]') && !/vídeo|video/i.test(el.textContent)) {
        // Mantém o nome Ajuda, mas garante que o usuário saiba que há vídeos.
        el.setAttribute('title', 'Ajuda, vídeos rápidos e manuais');
      }
    });
  }

  function ensureHelpTabs(section) {
    let tabs = qs('.vr-help-tabs', section);
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'vr-help-tabs';
      tabs.setAttribute('aria-label', 'Áreas da ajuda');
      section.insertBefore(tabs, section.children[1] || section.firstChild);
    }
    const wanted = [
      ['#help-videos', '🎬 Vídeos rápidos'],
      ['#help-manuals', '📚 Manuais'],
      ['#help-apps', '📱 Apps'],
      ['#help-support', '💬 Suporte'],
    ];
    wanted.forEach(([href, text]) => {
      if (!qs(`a[href="${href}"]`, tabs)) {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        tabs.appendChild(a);
      }
    });
    qsa('a', tabs).forEach((a) => {
      a.addEventListener('click', () => setTimeout(() => markActiveTab(a.getAttribute('href')), 80), { passive: true });
    });
  }

  function markActiveTab(hash) {
    qsa('#manual .vr-help-tabs a').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === hash));
  }

  function ensureVideoBlock() {
    const section = qs('#manual');
    if (!section) return;
    ensureHelpTabs(section);
    let block = qs('#help-videos', section);
    if (!block) {
      block = document.createElement('article');
      block.id = 'help-videos';
      block.className = 'panel vr-help-section-block';
      const tabs = qs('.vr-help-tabs', section);
      tabs.insertAdjacentElement('afterend', block);
    }
    block.classList.remove('is-role-hidden');
    block.hidden = false;
    block.style.removeProperty('display');
    block.innerHTML = `
      <div class="panel-header">
        <div>
          <span class="eyebrow">Aprenda assistindo</span>
          <h3>Vídeos rápidos</h3>
          <p>Vídeos curtos, com instruções simples. Eles aparecem para todos os perfis dentro da aba Ajuda.</p>
        </div>
      </div>
      <div class="vr-help-video-alert">
        <strong>Vídeos disponíveis nesta página</strong>
        Toque em Play no card desejado. No celular, também é possível usar o botão “Abrir vídeo” para abrir em tela cheia.
      </div>
      <div class="vr-video-grid">
        ${videos.map(makeVideoCard).join('')}
      </div>`;
    markActiveTab('#help-videos');
  }

  function ensureFooterVersion() {
    const footer = qs('[data-system-version-footer] strong');
    if (footer) footer.textContent = VERSION;
  }

  function init() {
    ensureHelpRoleVisibility();
    ensureVideoBlock();
    ensureFooterVersion();
    if (location.hash === '#manual' || location.hash === '#help-videos') {
      setTimeout(() => qs('#help-videos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  window.addEventListener('hashchange', init);

  // Reaplica depois que o app principal renderiza permissões/menus.
  let attempts = 0;
  const timer = setInterval(() => {
    init();
    attempts += 1;
    if (attempts >= 8) clearInterval(timer);
  }, 600);
})();
