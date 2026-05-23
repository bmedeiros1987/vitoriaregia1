
// Vitória Régia v4.4.0 — correção geral de menu, financeiro e emergência
(function () {
  const VERSION = 'v4.4.0';
  const P = 'vitoriaRegia.full.v1.';
  const K = {
    session: P + 'session',
    packages: P + 'packages',
    bookings: P + 'bookings',
    notices: P + 'notices',
    requests: P + 'serviceRequests',
    finance: P + 'financeRecords',
    staff: P + 'staff',
    residents: P + 'residents'
  };

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function norm(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function session() {
    return parse(localStorage.getItem(K.session), null)
      || parse(localStorage.getItem('currentUser'), null)
      || parse(localStorage.getItem('user'), null)
      || {};
  }

  function role() {
    const s = session();
    const r = norm(s.role || s.staffRole || s.originalRole || s.perfil || s.tipo || '');
    if (r.includes('owner') || r.includes('propriet') || r.includes('dono')) return 'owner';
    if (r.includes('admin')) return 'admin';
    if (r.includes('sind')) return 'sindico';
    if (r.includes('port')) return 'portaria';
    if (r.includes('limp')) return 'limpeza';
    if (r.includes('zel')) return 'zeladoria';
    return 'morador';
  }

  function roleLabel(r) {
    return { owner:'Administrador', admin:'Administração', sindico:'Síndico', portaria:'Portaria', limpeza:'Limpeza', zeladoria:'Zeladoria', morador:'Morador' }[r] || 'Usuário';
  }

  function isAdminRole() {
    return ['owner', 'admin', 'sindico'].includes(role());
  }

  function unit() {
    const s = session();
    return s.apartment || s.unit || s.unidade || '';
  }

  function firstName() {
    const s = session();
    return String(s.name || s.nome || s.email || 'usuário').trim().split(/\s+/)[0] || 'usuário';
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  function arr(key) {
    return parse(localStorage.getItem(key), []);
  }

  function belongsToUnit(item) {
    const u = String(unit() || '');
    if (!u) return false;
    return [item.apartment, item.unit, item.unidade, item.residentApartment, item.bookingApartment, item.moradorUnidade].some(v => String(v || '') === u);
  }

  function setRoleClass() {
    document.body.classList.remove('vr-role-morador','vr-role-portaria','vr-role-limpeza','vr-role-zeladoria','vr-role-sindico','vr-role-admin','vr-role-owner');
    document.body.classList.add('vr-role-' + role());
  }

  function go(target) {
    if (!target) return;
    const aliases = {
      'financeiro-publico': 'financeiro',
      'financeiro-admin': 'financeiro',
      'financeiro-morador': 'financeiro',
      'boletos': 'financeiro',
      'perfil': 'meu-perfil'
    };
    const t = aliases[target] || target;
    const candidates = [
      `[data-nav][href="#${t}"]`,
      `[href="#${t}"]`,
      `[data-route="${t}"]`,
      `[data-section="${t}"]`,
      `[data-target="${t}"]`
    ];
    const el = candidates.map(sel => document.querySelector(sel)).find(Boolean);
    if (el && el !== document.querySelector(`#${t}`)) {
      el.click();
    } else {
      location.hash = t;
      if (typeof window.updateActiveSection === 'function') {
        try { window.updateActiveSection(); } catch (_) {}
      }
    }
    if (t === 'financeiro') setTimeout(renderFinance, 120);
    closeMenu();
  }

  function toast(msg) {
    let el = document.querySelector('.vr440-emergency-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'vr440-emergency-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-open');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-open'), 3400);
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open', 'no-scroll');
    document.querySelector('[data-sidebar]')?.classList.remove('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.remove('is-open');
  }

  function openMenu() {
    document.body.classList.add('sidebar-open', 'no-scroll');
    document.querySelector('[data-sidebar]')?.classList.add('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.add('is-open');
  }

  function fixMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    if (!sidebar) return;

    sidebar.querySelectorAll('.vr440-menu-head').forEach((el, idx) => { if (idx > 0) el.remove(); });
    if (!sidebar.querySelector('.vr440-menu-head')) {
      const head = document.createElement('div');
      head.className = 'vr440-menu-head';
      head.innerHTML = '<strong>Menu</strong><button type="button" class="vr440-menu-close" data-vr440-menu-close>Fechar ×</button>';
      sidebar.insertBefore(head, sidebar.firstChild);
    }

    const openBtn = document.querySelector('[data-menu-open]');
    if (openBtn && !openBtn.dataset.vr440) {
      openBtn.dataset.vr440 = '1';
      openBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMenu();
      }, true);
    }

    const closeBtn = sidebar.querySelector('[data-vr440-menu-close]');
    if (closeBtn && !closeBtn.dataset.vr440) {
      closeBtn.dataset.vr440 = '1';
      closeBtn.addEventListener('click', function (event) {
        event.preventDefault();
        closeMenu();
      });
    }

    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.vr440) {
      shadow.dataset.vr440 = '1';
      shadow.addEventListener('click', closeMenu);
    }

    sidebar.querySelectorAll('a[data-nav]').forEach(a => {
      if (!a.dataset.vr440) {
        a.dataset.vr440 = '1';
        a.addEventListener('click', () => setTimeout(closeMenu, 80));
      }
    });
  }

  function action(icon, title, text, target) {
    return `<button class="vr440-action" type="button" data-vr440-go="${target}">
      <span>${icon}</span><b>${title}</b><small>${text}</small>
    </button>`;
  }

  function renderHome() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-page="dashboard"], [data-section="dashboard"]');
    if (!dash || dash.querySelector('.vr440-home')) return;

    setRoleClass();

    const r = role();
    document.querySelectorAll('.vr-home-objective,.vr-home-438,.vr-profile-home,.vr-safe-dashboard-strip,.vr-dashboard-hero').forEach(el => el.remove());

    let actions = '';
    let subtitle = '';

    if (r === 'morador') {
      subtitle = 'Acesso rápido às suas principais informações.';
      actions = [
        action('📅', 'Reservas', 'Solicitar ou consultar.', 'reservas'),
        action('💳', 'Financeiro morador', 'Somente sua unidade.', 'financeiro-morador'),
        action('📦', 'Encomendas', 'Suas entregas.', 'encomendas'),
        action('👤', 'Meu perfil', 'Dados e senha.', 'perfil')
      ].join('');
    } else if (r === 'portaria') {
      subtitle = 'Rotina rápida da portaria.';
      actions = [
        action('📦', 'Encomendas', 'Registrar entrega.', 'encomendas'),
        action('👥', 'Visitantes', 'Controle de acesso.', 'visitantes-recorrentes'),
        action('🚨', 'Emergências', 'Ações rápidas.', 'emergencias'),
        action('👤', 'Meu perfil', 'Dados e senha.', 'perfil')
      ].join('');
    } else {
      subtitle = 'Acessos principais da administração.';
      actions = [
        action('🔔', 'Pendências', 'Aprovações e avisos.', 'aprovacoes'),
        action('💰', 'Financeiro admin', 'Restrito ao síndico.', 'financeiro-admin'),
        action('👁️', 'Financeiro morador', 'Liberar informações.', 'financeiro-morador'),
        action('⬆️', 'Atualização', 'Versão do sistema.', 'configuracoes'),
        action('👤', 'Meu perfil', 'Dados e senha.', 'perfil')
      ].join('');
    }

    const notices = visibleNotices(r);
    const noticeHtml = notices.length
      ? `<div class="vr440-notices">${notices.map(n => `<div class="vr440-notice"><b>${escapeHTML(n.title || 'Aviso')}</b><br>${escapeHTML(n.message || n.text || '')}</div>`).join('')}</div>`
      : '';

    dash.insertAdjacentHTML('afterbegin', `
      <section class="vr440-home">
        <div class="vr440-greeting">
          <h2>${greeting()}, ${escapeHTML(firstName())}.</h2>
          <p>${subtitle}</p>
        </div>
        <div class="vr440-actions">${actions}</div>
        ${noticeHtml}
      </section>
    `);

    dash.querySelectorAll('[data-vr440-go]').forEach(btn => {
      btn.addEventListener('click', () => go(btn.getAttribute('data-vr440-go')));
    });
  }

  function visibleNotices(r) {
    const notices = arr(K.notices);
    if (r === 'morador') {
      return notices.filter(n => n.public === true || n.publico === true || belongsToUnit(n)).slice(0, 2);
    }
    if (r === 'portaria') {
      return notices.filter(n => /portaria|porteiro|turno/i.test(String(n.target || n.role || n.title || ''))).slice(0, 2);
    }
    return notices.slice(0, 2);
  }

  function renderFinance() {
    if (!logged()) return;
    const section = document.querySelector('#financeiro[data-section], [data-section="financeiro"], [data-page="financeiro"]');
    if (!section) return;

    setRoleClass();

    if (!section.querySelector('.vr440-finance')) {
      Array.from(section.children).forEach(child => {
        if (!child.classList.contains('vr440-finance')) child.style.display = 'none';
      });

      section.insertAdjacentHTML('afterbegin', financeHtml());
      section.querySelectorAll('[data-vr440-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr440-go'))));
    }
  }

  function financeHtml() {
    const r = role();
    const records = arr(K.finance);
    const mine = records.filter(belongsToUnit);
    if (r === 'morador') {
      const list = mine.length
        ? mine.slice(0, 6).map(f => `<div class="vr440-finance-card"><h3>${escapeHTML(f.title || f.description || 'Cobrança')}</h3><p>${escapeHTML(f.amount || f.valor || 'Valor não informado')} • ${escapeHTML(f.status || 'Disponível')}</p><span class="vr440-finance-badge">Sua unidade</span></div>`).join('')
        : `<div class="vr440-finance-card"><h3>Nenhum boleto liberado</h3><p>Quando houver boleto, cobrança ou informação financeira da sua unidade, ela aparecerá aqui.</p><span class="vr440-finance-badge">Financeiro morador</span></div>`;
      return `<div class="vr440-finance"><div class="vr440-finance-head"><h2>Financeiro do morador</h2><p>Você vê somente boletos, cobranças da sua unidade e informações financeiras que o síndico liberar como públicas.</p></div><div class="vr440-finance-grid">${list}</div></div>`;
    }

    return `<div class="vr440-finance">
      <div class="vr440-finance-head"><h2>Financeiro administrativo</h2><p>Área restrita para síndico/administração. Separe o que é interno do que pode ser liberado aos moradores.</p></div>
      <div class="vr440-finance-grid">
        <div class="vr440-finance-card"><h3>Inadimplências</h3><p>Acompanhe unidades em atraso e histórico de cobrança.</p><span class="vr440-finance-badge">Restrito</span></div>
        <div class="vr440-finance-card"><h3>Banco e boletos</h3><p>Configure banco/intermediador, boletos novos e boletos recorrentes por unidade.</p><span class="vr440-finance-badge">Admin</span></div>
        <div class="vr440-finance-card"><h3>Financeiro morador</h3><p>Libere somente o que moradores podem ver: boletos da própria unidade e prestação de contas pública.</p><span class="vr440-finance-badge">Permissão separada</span></div>
        <div class="vr440-finance-card"><h3>Relatório no boleto</h3><p>Inclua despesas fixas, emergenciais e observações relevantes do síndico.</p><span class="vr440-finance-badge">Boleto</span></div>
      </div>
    </div>`;
  }

  function injectPermissions() {
    if (!logged() || !isAdminRole()) return;
    const section = document.querySelector('#equipe[data-section], #usuarios[data-section], [data-section="equipe"], [data-page="usuarios"]');
    if (!section || section.querySelector('.vr440-permission-note')) return;
    section.insertAdjacentHTML('afterbegin', `
      <div class="vr440-permission-note">
        <b>Permissão financeira separada:</b> use <b>Financeiro morador</b> para permitir que o morador veja apenas boletos, cobranças da própria unidade e informações financeiras publicadas pelo síndico. 
        Não libera acesso ao financeiro administrativo do prédio.
      </div>
    `);
  }

  function ensureEmergencyModal() {
    let modal = document.querySelector('.vr440-emergency-modal');
    if (modal) return modal;

    const types = [
      ['medical', '🩺', 'Emergência médica', 'Mal súbito, queda ou necessidade urgente.', 'CRÍTICO'],
      ['water', '💧', 'Vazamento de água', 'Vazamento, infiltração ou cano rompido.', ''],
      ['gas', '🔥', 'Vazamento de gás', 'Cheiro de gás ou risco de explosão.', 'CRÍTICO'],
      ['elevator', '🛗', 'Preso no elevador', 'Elevador parado com pessoa dentro.', 'CRÍTICO'],
      ['energy', '⚡', 'Queda de fase / energia', 'Falha elétrica na unidade ou área comum.', ''],
      ['security', '🛡️', 'Segurança / invasão', 'Risco à segurança do condomínio.', 'CRÍTICO']
    ];

    modal = document.createElement('div');
    modal.className = 'vr440-emergency-modal';
    modal.innerHTML = `
      <div class="vr440-emergency-card">
        <div class="vr440-emergency-head">
          <div><h2>Central de emergência</h2><p>Escolha uma ação rápida. Não há caixas para marcar.</p></div>
          <button type="button" class="vr440-emergency-close" data-vr440-em-close>×</button>
        </div>
        <div class="vr440-emergency-types">
          ${types.map(t => `<button type="button" class="vr440-emergency-type" data-vr440-em-type="${t[0]}"><span>${t[1]}</span><span><strong>${t[2]}</strong><small>${t[3]}</small></span><span class="vr440-emergency-critical">${t[4]}</span></button>`).join('')}
        </div>
        <div class="vr440-emergency-actions">
          <button type="button" class="vr440-emergency-btn" data-vr440-em-close>Cancelar</button>
          <button type="button" class="vr440-emergency-btn danger" data-vr440-em-confirm>Enviar alerta</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-vr440-em-close]')) closeEmergency();
      const typeBtn = event.target.closest('[data-vr440-em-type]');
      if (typeBtn) {
        modal.dataset.selected = typeBtn.getAttribute('data-vr440-em-type');
        modal.querySelectorAll('.vr440-emergency-type').forEach(btn => btn.classList.toggle('is-selected', btn === typeBtn));
      }
      if (event.target.closest('[data-vr440-em-confirm]')) confirmEmergency();
    });

    return modal;
  }

  function openEmergency() {
    ensureEmergencyModal().classList.add('is-open');
  }

  function closeEmergency() {
    document.querySelector('.vr440-emergency-modal')?.classList.remove('is-open');
  }

  function confirmEmergency() {
    const modal = ensureEmergencyModal();
    const selected = modal.dataset.selected;
    if (!selected) {
      toast('Escolha o tipo de emergência antes de enviar.');
      return;
    }
    const events = arr('vitoriaRegia.emergency.events.v410');
    events.unshift({ id: 'em-' + Date.now(), type: selected, createdAt: new Date().toISOString(), status: 'novo' });
    save('vitoriaRegia.emergency.events.v410', events.slice(0, 50));
    closeEmergency();
    toast('Alerta enviado para síndico e portaria.');
  }

  function patchEmergency() {
    if (!logged()) return;

    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-vr-premium-emergency], .vr-premium-emergency-button, .vr-global-panic, .panic-button-floating, [data-vr438-open-emergency]');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openEmergency();
    }, true);

    const section = document.querySelector('#emergencias[data-section], [data-section="emergencias"], [data-page="emergencias"]');
    if (section && !section.querySelector('.vr440-emergency-section')) {
      Array.from(section.children).forEach(child => child.style.display = 'none');
      section.insertAdjacentHTML('afterbegin', `
        <div class="vr440-emergency-section vr440-finance">
          <div class="vr440-finance-head"><h2>Emergências</h2><p>Ações rápidas e claras para evitar erro de uso. Selecione um botão e confirme.</p></div>
          <div class="vr440-finance-grid">
            <button class="vr440-action" data-vr440-open-emergency>🚑<b>Emergência médica</b><small>Acionar portaria e síndico.</small></button>
            <button class="vr440-action" data-vr440-open-emergency>💧<b>Vazamento de água</b><small>Comunicar manutenção.</small></button>
            <button class="vr440-action" data-vr440-open-emergency>🔥<b>Vazamento de gás</b><small>Alerta crítico.</small></button>
            <button class="vr440-action" data-vr440-open-emergency>⚡<b>Queda de fase</b><small>Falha elétrica.</small></button>
          </div>
        </div>
      `);
      section.querySelectorAll('[data-vr440-open-emergency]').forEach(btn => btn.addEventListener('click', openEmergency));
    }
  }

  function bindClicks() {
    if (window.__vr440Bound) return;
    window.__vr440Bound = true;
    document.addEventListener('click', event => {
      const goBtn = event.target.closest('[data-vr440-go], [data-vr438-go], [data-vr438-fin]');
      if (!goBtn) return;
      const target = goBtn.getAttribute('data-vr440-go') || goBtn.getAttribute('data-vr438-go') || goBtn.getAttribute('data-vr438-fin');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (target === 'perfil') {
        const profile = document.querySelector('[data-nav][href="#meu-cadastro"], a[href="#meu-cadastro"]');
        if (profile) profile.click();
        else go('meu-cadastro');
      } else if (target === 'publico' || target === 'admin' || target === 'boletos') {
        go('financeiro');
      } else {
        go(target);
      }
    }, true);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function run() {
    if (!logged()) return;
    setRoleClass();
    fixMenu();
    renderHome();
    renderFinance();
    injectPermissions();
    patchEmergency();
    bindClicks();
  }

  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  window.addEventListener('hashchange', () => setTimeout(run, 120));
  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
