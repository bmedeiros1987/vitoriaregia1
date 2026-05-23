
// Vitória Régia v4.3.5 — restauração premium clean e funcionalidades seguras
(function () {
  const STORE_PREFIX = 'vitoriaRegia.full.v1.';
  const keys = {
    session: STORE_PREFIX + 'session',
    residents: STORE_PREFIX + 'residents',
    staff: STORE_PREFIX + 'staff',
    packages: STORE_PREFIX + 'packages',
    bookings: STORE_PREFIX + 'bookings',
    notices: STORE_PREFIX + 'notices',
    serviceRequests: STORE_PREFIX + 'serviceRequests',
    financeRecords: STORE_PREFIX + 'financeRecords'
  };

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isLoggedIn() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && app.style.display !== 'none' && (!login || login.hidden)));
  }

  function getSession() {
    return parse(localStorage.getItem(keys.session), {}) || {};
  }

  function roleKey(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function appRole() {
    const s = getSession();
    const role = roleKey(s.role || s.staffRole || s.originalRole || '');
    if (role.includes('port') || role.includes('porteir')) return 'portaria';
    if (role.includes('sind') || role.includes('admin') || role.includes('propriet') || role.includes('owner')) return 'sindico';
    return 'morador';
  }

  function firstName() {
    const s = getSession();
    return String(s.name || s.email || 'usuário').trim().split(/\s+/)[0] || 'usuário';
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function toast(msg) {
    let box = document.querySelector('.vr-safe-toast');
    if (!box) {
      box = document.createElement('div');
      box.className = 'vr-safe-toast';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.classList.add('is-open');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('is-open'), 3200);
  }

  function cleanLoginScreen() {
    if (isLoggedIn()) return;
    document.querySelectorAll('.vr-profile-home, .vr-safe-dashboard-strip, .vr-safe-user-modal, .vr-safe-toast').forEach(el => el.remove());
    const signupMsg = document.querySelector('[data-signup-message]');
    const loginForm = document.querySelector('[data-login-form]');
    const signupForm = document.querySelector('[data-signup-form]');
    if (signupMsg && loginForm && !loginForm.classList.contains('is-hidden') && signupForm?.classList.contains('is-hidden')) {
      if (/cadastrado com sucesso|usu[aá]rio cadastrado|salvo com sucesso/i.test(signupMsg.textContent || '')) {
        signupMsg.textContent = 'Após enviar, entre como síndico para aprovar ou recusar.';
      }
    }
  }

  function restoreSidebar() {
    if (!isLoggedIn()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    if (!sidebar) return;
    sidebar.style.removeProperty('display');
    sidebar.style.removeProperty('visibility');
    sidebar.style.removeProperty('pointer-events');
    sidebar.querySelectorAll('a, button').forEach(el => {
      el.style.removeProperty('pointer-events');
      el.disabled = false;
    });

    const role = appRole();
    document.body.classList.remove('vr-role-morador', 'vr-role-sindico', 'vr-role-portaria');
    document.body.classList.add('vr-role-' + role);
  }

  function addDashboardStrip() {
    if (!isLoggedIn()) return;
    const dash = document.querySelector('#dashboard[data-section]');
    if (!dash || dash.querySelector('.vr-safe-dashboard-strip')) return;

    const role = appRole();
    const s = getSession();
    const unit = s.apartment ? ' • Unidade ' + s.apartment : '';
    const text = role === 'morador'
      ? 'Você vê apenas dados da sua unidade, suas reservas, suas encomendas e comunicados liberados pelo síndico.'
      : role === 'portaria'
        ? 'Acompanhe tarefas operacionais, encomendas, visitantes e emergências do seu turno.'
        : 'Acompanhe aprovações, notificações, solicitações e itens administrativos de forma objetiva.';

    const strip = document.createElement('div');
    strip.className = 'vr-safe-dashboard-strip';
    strip.innerHTML = `
      <div>
        <h3>${greeting()}, ${firstName()}.</h3>
        <p>${text}</p>
      </div>
      <div class="vr-safe-dashboard-pills">
        <span>${role === 'morador' ? 'Morador' : role === 'portaria' ? 'Portaria' : 'Síndico/Admin'}${unit}</span>
        <span>Dados por perfil</span>
      </div>
    `;
    dash.insertBefore(strip, dash.firstChild);
  }

  function enhanceStaffNoUnit() {
    if (!isLoggedIn()) return;
    const form = document.querySelector('[data-staff-form]');
    if (!form || form.dataset.vrNoUnitSafe === 'true') return;
    const select = form.querySelector('[name="staffApartment"]');
    if (!select) return;
    form.dataset.vrNoUnitSafe = 'true';

    const box = document.createElement('div');
    box.className = 'vr-no-unit-safe';
    box.innerHTML = `
      <label><input type="checkbox" data-vr-no-unit-safe checked> <span>Este usuário não possui unidade vinculada</span></label>
      <small>Use para administração, síndico terceirizado, portaria, zeladoria, limpeza ou funcionário sem apartamento.</small>
    `;
    select.closest('label')?.parentNode?.insertBefore(box, select.closest('label'));
    const toggle = box.querySelector('[data-vr-no-unit-safe]');

    function sync() {
      const label = select.closest('label');
      if (toggle.checked) {
        select.value = '';
        select.disabled = true;
        label?.classList.add('vr-no-unit-disabled');
      } else {
        select.disabled = false;
        label?.classList.remove('vr-no-unit-disabled');
      }
    }
    toggle.addEventListener('change', sync);
    form.addEventListener('submit', () => {
      if (toggle.checked) {
        select.disabled = false;
        select.value = '';
      }
    }, true);
    sync();
  }

  function getStaff() { return parse(localStorage.getItem(keys.staff), []); }
  function getResidents() { return parse(localStorage.getItem(keys.residents), []); }

  function idOf(user) {
    return String(user?.id || user?.email || user?.name || Date.now());
  }

  function generateTempPassword() {
    return 'VR-' + Math.floor(100000 + Math.random() * 900000);
  }

  function copy(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Senha temporária copiada.'));
      return;
    }
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    toast('Senha temporária copiada.');
  }

  function ensureUserModal() {
    let modal = document.querySelector('.vr-safe-user-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'vr-safe-user-modal';
    modal.innerHTML = `
      <div class="vr-safe-user-card">
        <div class="vr-safe-user-head">
          <div><h3>Editar usuário</h3><p>Altere dados básicos, contato, perfil e senha temporária.</p></div>
          <button class="vr-safe-user-btn" type="button" data-close>Fechar</button>
        </div>
        <div class="vr-safe-user-body"></div>
        <div class="vr-safe-user-actions">
          <button class="vr-safe-user-btn" type="button" data-copy>Copiar senha</button>
          <button class="vr-safe-user-btn" type="button" data-telegram>Enviar Telegram</button>
          <button class="vr-safe-user-btn danger" type="button" data-reset>Resetar senha</button>
          <button class="vr-safe-user-btn primary" type="button" data-save>Salvar alterações</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal || e.target.dataset.close !== undefined) modal.classList.remove('is-open'); });
    return modal;
  }

  function field(name, label, value = '', type = 'text') {
    const safe = String(value || '').replace(/"/g, '&quot;');
    return `<label><span>${label}</span><input name="${name}" type="${type}" value="${safe}"></label>`;
  }

  function select(name, label, value, options) {
    return `<label><span>${label}</span><select name="${name}">
      ${options.map(o => `<option value="${o[0]}" ${String(value || '') === String(o[0]) ? 'selected' : ''}>${o[1]}</option>`).join('')}
    </select></label>`;
  }

  function openUserEditor(kind, id) {
    if (!isLoggedIn()) return;
    const list = kind === 'staff' ? getStaff() : getResidents();
    const user = list.find(item => String(item.id) === String(id));
    if (!user) return;
    const modal = ensureUserModal();
    modal.dataset.kind = kind;
    modal.dataset.id = id;
    const temp = user.temporaryPassword || user.senhaTemporaria || user.tempPassword || '';
    const unit = user.apartment || user.staffApartment || '';
    modal.querySelector('.vr-safe-user-body').innerHTML = `
      <div class="vr-safe-user-grid">
        ${field('name', 'Nome', user.name)}
        ${field('email', 'E-mail', user.email, 'email')}
        ${field('whatsapp', 'WhatsApp', user.whatsapp || user.phone || '')}
        ${field('telegram', 'Telegram / Chat ID', user.telegramChatId || user.telegram || '')}
        ${field('apartment', 'Unidade vinculada', unit)}
        ${select('semUnidade', 'Unidade residencial', unit ? 'false' : 'true', [['false','Com unidade'], ['true','Sem unidade vinculada']])}
        ${select('role', 'Perfil', user.role || (kind === 'staff' ? 'porteiro' : 'morador'), [
          ['morador','Morador'], ['sindico','Síndico'], ['subsindico','Subsíndico'], ['porteiro','Portaria'], ['administrador','Administração'], ['zeladoria','Zeladoria'], ['limpeza','Limpeza']
        ])}
        ${select('active', 'Status', user.active === false ? 'false' : 'true', [['true','Ativo/Aprovado'], ['false','Inativo/Bloqueado']])}
      </div>
      <div class="vr-temp-safe">
        <strong>Senha temporária</strong>
        <code data-temp-code>${temp || 'Nenhuma senha temporária gerada'}</code>
        <small>Visível para síndico/administrador. Gere uma nova senha quando o usuário perder acesso.</small>
      </div>
    `;
    modal.querySelector('[data-reset]').onclick = () => {
      const pass = generateTempPassword();
      modal.querySelector('[data-temp-code]').textContent = pass;
      toast('Senha temporária gerada.');
    };
    modal.querySelector('[data-copy]').onclick = () => {
      const pass = modal.querySelector('[data-temp-code]')?.textContent || '';
      if (!pass || pass.includes('Nenhuma')) return toast('Gere uma senha temporária primeiro.');
      copy(pass);
    };
    modal.querySelector('[data-telegram]').onclick = async () => {
      const pass = modal.querySelector('[data-temp-code]')?.textContent || '';
      if (!pass || pass.includes('Nenhuma')) return toast('Gere uma senha temporária primeiro.');
      const chat = modal.querySelector('[name="telegram"]')?.value.trim();
      if (!chat) return toast('Informe Telegram ou Chat ID do usuário.');
      try {
        const msg = `Olá. Sua senha temporária do sistema Vitória Régia é: ${pass}`;
        const res = await fetch('/api/telegram/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: chat, message: msg }) });
        toast(res.ok ? 'Senha enviada pelo Telegram.' : 'Não foi possível enviar. Copie a senha e envie manualmente.');
      } catch (_) {
        toast('Não foi possível enviar. Copie a senha e envie manualmente.');
      }
    };
    modal.querySelector('[data-save]').onclick = () => saveUserModal(modal);
    modal.classList.add('is-open');
  }

  function saveUserModal(modal) {
    const kind = modal.dataset.kind;
    const id = modal.dataset.id;
    const listKey = kind === 'staff' ? keys.staff : keys.residents;
    const list = kind === 'staff' ? getStaff() : getResidents();
    const index = list.findIndex(item => String(item.id) === String(id));
    if (index < 0) return toast('Usuário não encontrado.');

    const body = modal.querySelector('.vr-safe-user-body');
    const data = {};
    body.querySelectorAll('input, select').forEach(input => data[input.name] = input.value);
    const semUnidade = data.semUnidade === 'true';
    const temp = body.querySelector('[data-temp-code]')?.textContent || '';

    const next = {
      ...list[index],
      name: data.name.trim(),
      email: data.email.trim(),
      whatsapp: data.whatsapp.trim(),
      telegram: data.telegram.trim(),
      telegramChatId: data.telegram.trim(),
      role: data.role || list[index].role,
      active: data.active !== 'false',
      apartment: semUnidade ? '' : (data.apartment || '').trim(),
      staffApartment: semUnidade ? '' : (data.apartment || '').trim(),
      semUnidade,
      unitless: semUnidade,
      updatedAt: new Date().toISOString()
    };
    if (temp && !temp.includes('Nenhuma')) {
      next.temporaryPassword = temp;
      next.senhaTemporaria = temp;
      next.forcePasswordChange = true;
    }

    list[index] = next;
    save(listKey, list);
    toast('Usuário atualizado com sucesso.');
    modal.classList.remove('is-open');

    if (typeof window.renderAll === 'function') {
      try { window.renderAll(); } catch (_) {}
    } else {
      setTimeout(() => location.reload(), 800);
    }
  }

  function interceptEditButtons() {
    if (!isLoggedIn()) return;
    document.addEventListener('click', function (event) {
      const staffBtn = event.target.closest('[data-edit-staff]');
      const residentBtn = event.target.closest('[data-edit-resident]');
      if (!staffBtn && !residentBtn) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (staffBtn) openUserEditor('staff', staffBtn.getAttribute('data-edit-staff'));
      if (residentBtn) openUserEditor('resident', residentBtn.getAttribute('data-edit-resident'));
    }, true);
  }

  function initOnce() {
    if (window.__vrRestore435Init) return;
    window.__vrRestore435Init = true;
    interceptEditButtons();
  }

  function run() {
    cleanLoginScreen();
    restoreSidebar();
    addDashboardStrip();
    enhanceStaffNoUnit();
  }

  initOnce();
  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
