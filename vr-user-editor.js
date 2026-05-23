
// Vitória Régia v4.3.4 - Editor de usuários, reset e senha temporária
(function () {
  const VERSION = 'v4.3.4';
  const USER_KEYS = ['users', 'usuarios', 'vrUsers', 'moradores', 'residents', 'funcionarios', 'employees'];

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalize(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function getCurrentUser() {
    return parse(localStorage.getItem('currentUser'), null)
      || parse(localStorage.getItem('user'), null)
      || parse(localStorage.getItem('loggedUser'), null)
      || {};
  }

  function roleOf(user) {
    const role = normalize(user.role || user.perfil || user.tipo || user.profile || user.userType);
    if (role.includes('owner') || role.includes('propriet') || role.includes('dono')) return 'owner';
    if (role.includes('admin')) return 'admin';
    if (role.includes('sind')) return 'sindico';
    return role || 'morador';
  }

  function canManagePasswords() {
    const role = roleOf(getCurrentUser());
    return ['owner', 'admin', 'sindico'].includes(role);
  }

  function primaryUserStore() {
    for (const key of USER_KEYS) {
      const arr = parse(localStorage.getItem(key), null);
      if (Array.isArray(arr)) return { key, users: arr };
    }
    return { key: 'usuarios', users: [] };
  }

  function identifyUserFromElement(el) {
    const row = el.closest('[data-user-id], [data-id], tr, .card, .user-card, .usuario-card, .vr-profile-item, li, article, section');
    if (!row) return null;

    const dataId = row.getAttribute('data-user-id') || row.getAttribute('data-id') || el.getAttribute('data-user-id') || el.getAttribute('data-id');
    const text = row.innerText || '';

    const { users } = primaryUserStore();
    if (dataId) {
      const found = users.find(u => String(u.id || u.userId || u.email || u.username || u.usuario) === String(dataId));
      if (found) return found;
    }

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      const found = users.find(u => normalize(u.email) === normalize(emailMatch[0]));
      if (found) return found;
    }

    const nameText = normalize(text);
    return users.find(u => {
      const candidates = [u.name, u.nome, u.username, u.usuario, u.email].filter(Boolean).map(normalize);
      return candidates.some(c => c && nameText.includes(c));
    }) || null;
  }

  function userId(user) {
    return String(user.id || user.userId || user.email || user.username || user.usuario || user.nome || Date.now());
  }

  function generateTempPassword() {
    const n = Math.floor(100000 + Math.random() * 900000);
    return 'VR-' + n;
  }

  function maskSensitiveForNonManagers() {
    if (canManagePasswords()) return;
    document.querySelectorAll('[data-vr-temp-password], .vr-temp-password-card').forEach(el => el.remove());
  }

  function toast(message) {
    let box = document.querySelector('.vr-user-editor-toast');
    if (!box) {
      box = document.createElement('div');
      box.className = 'vr-user-editor-toast';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('is-open');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('is-open'), 3600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Senha temporária copiada.')).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Senha temporária copiada.');
  }

  async function sendTelegram(user, password) {
    const telegram = user.telegramChatId || user.telegram || user.chatId || user.telegramId;
    if (!telegram) {
      toast('Este usuário ainda não possui Telegram/Chat ID cadastrado.');
      return;
    }

    const message = `Olá, ${user.nome || user.name || user.username || 'usuário'}.\n\nSua senha temporária do sistema Vitória Régia é: ${password}\n\nAcesse o sistema e troque a senha no primeiro login.`;
    const payload = {
      userId: userId(user),
      chatId: telegram,
      telegram,
      message,
      type: 'temporary_password',
      password
    };

    const endpoints = [
      '/api/telegram/send',
      '/api/notifications/telegram',
      '/api/admin/telegram/send'
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          toast('Senha temporária enviada pelo Telegram.');
          return;
        }
      } catch (_) {}
    }

    toast('Não foi possível enviar automaticamente. A senha ficou disponível para copiar.');
  }

  function openList() {
    const targets = [
      '[data-route="usuarios"]',
      '[data-page="usuarios"]',
      '[data-section="usuarios"]',
      '[data-route="users"]',
      'a[href="#usuarios"]',
      'button[data-target="usuarios"]'
    ];
    const el = targets.map(s => document.querySelector(s)).find(Boolean);
    if (el) el.click();
    else window.location.hash = 'usuarios';
  }

  function closeEditor() {
    const backdrop = document.querySelector('.vr-user-editor-backdrop');
    if (backdrop) backdrop.classList.remove('is-open');
  }

  function ensureEditor() {
    let backdrop = document.querySelector('.vr-user-editor-backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.className = 'vr-user-editor-backdrop';
    backdrop.innerHTML = `
      <div class="vr-user-editor-modal" role="dialog" aria-modal="true" aria-label="Editar usuário">
        <div class="vr-user-editor-header">
          <div>
            <h2>Editar usuário</h2>
            <p>Altere dados, perfil, contatos, unidade e senha temporária.</p>
          </div>
          <button class="vr-user-editor-close" type="button" aria-label="Fechar">×</button>
        </div>
        <div class="vr-user-editor-body">
          <div class="vr-user-editor-tabs">
            <button class="vr-user-editor-tab is-active" data-tab="dados" type="button">Dados</button>
            <button class="vr-user-editor-tab" data-tab="acesso" type="button">Acesso e perfil</button>
            <button class="vr-user-editor-tab" data-tab="senha" type="button">Senha temporária</button>
          </div>
          <section class="vr-user-editor-section is-active" data-section="dados"></section>
          <section class="vr-user-editor-section" data-section="acesso"></section>
          <section class="vr-user-editor-section" data-section="senha"></section>
        </div>
        <div class="vr-user-editor-actions">
          <button class="vr-user-editor-btn" type="button" data-action="cancel">Cancelar</button>
          <button class="vr-user-editor-btn success" type="button" data-action="telegram">Enviar senha pelo Telegram</button>
          <button class="vr-user-editor-btn danger" type="button" data-action="reset">Resetar senha</button>
          <button class="vr-user-editor-btn primary" type="button" data-action="save">Salvar alterações</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.querySelector('.vr-user-editor-close').addEventListener('click', closeEditor);
    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', closeEditor);
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeEditor();
    });

    backdrop.querySelectorAll('.vr-user-editor-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        backdrop.querySelectorAll('.vr-user-editor-tab').forEach(x => x.classList.toggle('is-active', x === btn));
        backdrop.querySelectorAll('.vr-user-editor-section').forEach(x => x.classList.toggle('is-active', x.dataset.section === tab));
      });
    });

    return backdrop;
  }

  function field(name, label, value = '', type = 'text', extra = '') {
    return `<div class="vr-user-editor-field">
      <label for="vr-edit-${name}">${label}</label>
      <input id="vr-edit-${name}" name="${name}" type="${type}" value="${String(value || '').replace(/"/g, '&quot;')}" ${extra}>
    </div>`;
  }

  function select(name, label, value, options) {
    return `<div class="vr-user-editor-field">
      <label for="vr-edit-${name}">${label}</label>
      <select id="vr-edit-${name}" name="${name}">
        ${options.map(opt => `<option value="${opt[0]}" ${String(value || '') === String(opt[0]) ? 'selected' : ''}>${opt[1]}</option>`).join('')}
      </select>
    </div>`;
  }

  function renderEditor(user) {
    const backdrop = ensureEditor();
    backdrop._user = Object.assign({}, user);
    const id = userId(user);
    const temp = user.temporaryPassword || user.senhaTemporaria || user.tempPassword || '';

    backdrop.querySelector('[data-section="dados"]').innerHTML = `
      <div class="vr-user-editor-note">Edite as informações do usuário como em uma tela de cadastro. Campos de unidade podem ficar vazios para administração, síndico terceirizado, portaria, zeladoria ou limpeza.</div>
      <div class="vr-user-editor-grid">
        ${field('nome', 'Nome completo', user.nome || user.name)}
        ${field('email', 'E-mail', user.email, 'email')}
        ${field('telefone', 'Telefone/WhatsApp', user.telefone || user.phone || user.whatsapp)}
        ${field('telegram', 'Telegram ou Chat ID', user.telegram || user.telegramChatId || user.chatId)}
        ${field('unidade', 'Unidade vinculada', user.unidade || user.unit || user.apartamento)}
        ${select('semUnidade', 'Unidade residencial', user.semUnidade || user.unitless ? 'true' : 'false', [['false','Com unidade vinculada'], ['true','Sem unidade vinculada']])}
      </div>
    `;

    backdrop.querySelector('[data-section="acesso"]').innerHTML = `
      <div class="vr-user-editor-grid">
        ${field('usuario', 'Usuário de login', user.usuario || user.username || user.email)}
        ${select('perfil', 'Perfil', user.perfil || user.role || user.tipo, [
          ['morador','Morador'],
          ['sindico','Síndico'],
          ['subsindico','Subsíndico'],
          ['admin','Administração'],
          ['portaria','Portaria'],
          ['zeladoria','Zeladoria'],
          ['limpeza','Limpeza'],
          ['owner','Administrador proprietário']
        ])}
        ${select('status', 'Status', user.status || (user.approved ? 'aprovado' : 'pendente'), [
          ['aprovado','Aprovado'],
          ['pendente','Pendente'],
          ['bloqueado','Bloqueado']
        ])}
        ${select('forcePasswordChange', 'Trocar senha no próximo login', user.forcePasswordChange ? 'true' : 'false', [['true','Sim'], ['false','Não']])}
      </div>
    `;

    backdrop.querySelector('[data-section="senha"]').innerHTML = `
      <div class="vr-temp-password-card">
        <strong>Senha temporária atual</strong>
        <div class="vr-temp-password-value" data-vr-temp-password>
          <span>${temp || 'Nenhuma senha temporária gerada'}</span>
          <button class="vr-user-editor-btn" type="button" data-action="copy-temp" ${temp ? '' : 'disabled'}>Copiar</button>
        </div>
        <div class="vr-user-editor-note">
          Apenas síndico, administração e administrador proprietário podem visualizar, copiar, resetar e enviar a senha temporária. O usuário deverá trocar a senha no próximo acesso.
        </div>
      </div>
    `;

    const copyBtn = backdrop.querySelector('[data-action="copy-temp"]');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const p = backdrop._user.temporaryPassword || backdrop._user.senhaTemporaria || backdrop._user.tempPassword;
      if (p) copyText(p);
    });

    const resetBtn = backdrop.querySelector('[data-action="reset"]');
    const telegramBtn = backdrop.querySelector('[data-action="telegram"]');

    resetBtn.style.display = canManagePasswords() ? '' : 'none';
    telegramBtn.style.display = canManagePasswords() ? '' : 'none';
    backdrop.querySelector('[data-section="senha"]').style.display = canManagePasswords() ? '' : 'none';
    const tabSenha = backdrop.querySelector('[data-tab="senha"]');
    if (tabSenha) tabSenha.style.display = canManagePasswords() ? '' : 'none';

    resetBtn.onclick = () => {
      if (!canManagePasswords()) return toast('Você não tem permissão para resetar senha.');
      const password = generateTempPassword();
      backdrop._user.temporaryPassword = password;
      backdrop._user.senhaTemporaria = password;
      backdrop._user.tempPassword = password;
      backdrop._user.forcePasswordChange = true;
      renderEditor(backdrop._user);
      toast('Senha temporária gerada. Ela pode ser copiada ou enviada por Telegram.');
    };

    telegramBtn.onclick = () => {
      const password = backdrop._user.temporaryPassword || backdrop._user.senhaTemporaria || backdrop._user.tempPassword;
      if (!password) return toast('Gere uma senha temporária antes de enviar.');
      sendTelegram(backdrop._user, password);
    };

    backdrop.querySelector('[data-action="save"]').onclick = () => saveUserFromEditor(backdrop);

    backdrop.classList.add('is-open');
  }

  function getFormData(backdrop) {
    const data = Object.assign({}, backdrop._user || {});
    backdrop.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.name) return;
      let value = el.value;
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      data[el.name] = value;
    });

    data.name = data.nome || data.name;
    data.username = data.usuario || data.username;
    data.role = data.perfil || data.role;
    data.unit = data.unidade || data.unit;
    data.telegramChatId = data.telegramChatId || data.telegram;
    if (data.semUnidade === true || data.unitless === true) {
      data.unidade = '';
      data.unit = '';
      data.apartamento = '';
      data.apartment = '';
      data.semUnidade = true;
      data.unitless = true;
    }
    return data;
  }

  async function saveUserFromEditor(backdrop) {
    const data = getFormData(backdrop);
    const store = primaryUserStore();
    const id = userId(data);
    const idx = store.users.findIndex(u => userId(u) === id);

    if (idx >= 0) store.users[idx] = Object.assign({}, store.users[idx], data);
    else store.users.push(data);

    save(store.key, store.users);

    const endpoints = ['/api/users/' + encodeURIComponent(id), '/api/usuarios/' + encodeURIComponent(id), '/api/users'];
    for (const endpoint of endpoints) {
      try {
        await fetch(endpoint, {
          method: endpoint.endsWith('/users') ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        break;
      } catch (_) {}
    }

    toast('Usuário cadastrado/atualizado com sucesso.');
    closeEditor();
    setTimeout(openList, 450);
  }

  function injectEditButtons() {
    const userAreas = Array.from(document.querySelectorAll('tr, .card, .user-card, .usuario-card, .vr-profile-item, li, article'))
      .filter(el => {
        const txt = normalize(el.innerText || '');
        return (txt.includes('usuario') || txt.includes('usuário') || txt.includes('morador') || txt.includes('sindico') || txt.includes('portaria') || txt.includes('@')) && !el.querySelector('.vr-edit-user-btn');
      });

    userAreas.slice(0, 80).forEach(el => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vr-edit-user-btn';
      btn.textContent = 'Editar';
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const user = identifyUserFromElement(btn) || {};
        renderEditor(user);
      });

      const target = el.querySelector('td:last-child, .actions, .card-actions, .vr-actions') || el;
      target.appendChild(btn);
    });
  }

  function interceptCadastroSuccess() {
    document.addEventListener('submit', function (e) {
      const form = e.target;
      if (!form || !form.matches || !form.matches('form')) return;
      const txt = normalize([form.id, form.className, form.innerText].join(' '));
      if (!txt.includes('usuario') && !txt.includes('usuário') && !txt.includes('morador') && !txt.includes('funcionario')) return;

      setTimeout(() => {
        toast('Usuário cadastrado com sucesso.');
        openList();
      }, 700);
    }, true);
  }

  function exposeApi() {
    window.VRUserEditor = {
      open: renderEditor,
      resetPassword(user) {
        user = user || {};
        user.temporaryPassword = generateTempPassword();
        user.senhaTemporaria = user.temporaryPassword;
        user.forcePasswordChange = true;
        renderEditor(user);
      }
    };
  }

  function init() {
    ensureEditor();
    injectEditButtons();
    maskSensitiveForNonManagers();
  }

  interceptCadastroSuccess();
  exposeApi();
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  const mo = new MutationObserver(() => {
    injectEditButtons();
    maskSensitiveForNonManagers();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
