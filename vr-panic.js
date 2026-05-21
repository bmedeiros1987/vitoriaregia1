/* Vitória Régia — Botão de Pânico / Emergência
   Fluxo principal:
   1. Morador aciona emergência.
   2. Síndico e portaria recebem ocorrência pendente.
   3. Síndico/portaria confirmam e então notificam outros moradores.
*/

(function () {
  'use strict';

  const API_BASE = '/api/panic';
  const STORAGE_SEEN = 'vr_panic_seen_public_v1';
  const STORAGE_ADMIN_SEEN = 'vr_panic_seen_admin_v1';
  const STORAGE_USER_OVERRIDE = 'vr_panic_user_override_v1';

  const TYPES = [
    { id: 'incendio', label: 'Incêndio', hint: 'Fumaça, princípio de incêndio ou calor excessivo.' },
    { id: 'emergencia_medica', label: 'Emergência médica', hint: 'Mal súbito, queda, acidente ou pedido de socorro.' },
    { id: 'gas', label: 'Vazamento de gás', hint: 'Cheiro forte de gás ou suspeita de vazamento.' },
    { id: 'seguranca', label: 'Segurança / invasão', hint: 'Ameaça, invasão, violência ou risco à integridade.' },
    { id: 'eletrica', label: 'Pane elétrica', hint: 'Curto, faísca, risco elétrico ou queda crítica.' },
    { id: 'outro', label: 'Outra emergência', hint: 'Situação urgente que precisa da portaria/síndico.' }
  ];

  const RESPONDER_ROLES = [
    'admin', 'administrador', 'síndico', 'sindico', 'subsíndico', 'subsindico',
    'portaria', 'porteiro', 'zelador', 'gerente'
  ];

  let selectedType = null;
  let pendingCache = [];
  let publicCache = [];
  let lastPublicCheck = 0;
  let adminPanelOpen = false;

  function normalizeText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function safeJsonParse(value) {
    if (!value || typeof value !== 'string') return null;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function readJwtPayload(token) {
    if (!token || typeof token !== 'string' || token.split('.').length < 2) return null;
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(payload).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function getStorageCandidates() {
    const keys = [
      'currentUser', 'user', 'usuario', 'authUser', 'vr_user', 'loggedUser',
      'sessionUser', 'vitoriaregia_user', 'token', 'authToken', 'jwt'
    ];

    const items = [];
    const stores = [localStorage, sessionStorage];

    for (const store of stores) {
      for (const key of keys) {
        try {
          const raw = store.getItem(key);
          if (!raw) continue;
          const parsed = safeJsonParse(raw);
          if (parsed) items.push(parsed);
          const jwtPayload = readJwtPayload(raw);
          if (jwtPayload) items.push(jwtPayload);
        } catch (_) {}
      }

      try {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (!/(user|usuario|auth|login|token|jwt)/i.test(key)) continue;
          const raw = store.getItem(key);
          const parsed = safeJsonParse(raw);
          if (parsed) items.push(parsed);
          const jwtPayload = readJwtPayload(raw);
          if (jwtPayload) items.push(jwtPayload);
        }
      } catch (_) {}
    }

    const override = safeJsonParse(localStorage.getItem(STORAGE_USER_OVERRIDE));
    if (override) items.unshift(override);
    return items;
  }

  function pickField(obj, names) {
    if (!obj || typeof obj !== 'object') return '';
    for (const name of names) {
      if (obj[name] != null && obj[name] !== '') return obj[name];
    }
    for (const [key, value] of Object.entries(obj)) {
      const nk = normalizeText(key);
      if (names.map(normalizeText).includes(nk) && value != null && value !== '') return value;
    }
    return '';
  }

  function getCurrentUser() {
    const candidates = getStorageCandidates();

    for (const c of candidates) {
      const nested = c.user || c.usuario || c.data || c.profile || c.account || c;
      const role = pickField(nested, ['role', 'perfil', 'tipo', 'cargo', 'nivel', 'acesso', 'permission', 'permissao']);
      const unit = pickField(nested, ['unit', 'unidade', 'apartamento', 'apto', 'ap', 'casa', 'lote']);
      const block = pickField(nested, ['block', 'bloco', 'torre', 'quadra']);
      const name = pickField(nested, ['name', 'nome', 'displayName', 'email', 'username', 'login']);
      const id = pickField(nested, ['id', '_id', 'userId', 'usuarioId']);

      if (role || unit || name || id) {
        return {
          id: String(id || ''),
          name: String(name || 'Usuário do sistema'),
          role: String(role || 'morador'),
          unit: String(unit || ''),
          block: String(block || '')
        };
      }
    }

    return {
      id: '',
      name: 'Usuário do sistema',
      role: 'morador',
      unit: '',
      block: ''
    };
  }

  function isResponder(user) {
    const role = normalizeText(user && user.role);
    return RESPONDER_ROLES.some(r => normalizeText(r) === role || role.includes(normalizeText(r)));
  }

  function getHeaders() {
    const user = getCurrentUser();
    const headers = { 'Content-Type': 'application/json' };
    headers['X-User-Name'] = user.name;
    headers['X-User-Role'] = user.role;
    headers['X-User-Unit'] = user.unit;
    headers['X-User-Block'] = user.block;

    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
    if (token && token.split('.').length >= 2) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      credentials: 'same-origin',
      ...options,
      headers: { ...getHeaders(), ...(options.headers || {}) }
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || ('Erro HTTP ' + res.status);
      throw new Error(msg);
    }

    return data;
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    return Notification.requestPermission().then(p => p === 'granted');
  }

  function notifyBrowser(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, {
        body,
        tag: tag || 'vitoria-regia-emergency',
        icon: '/favicon.ico',
        requireInteraction: true
      });
    } catch (_) {}
  }

  function toast(message, danger) {
    let el = document.querySelector('.vr-panic-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'vr-panic-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.background = danger ? '#991b1b' : '#111827';
    el.classList.add('is-visible');
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.classList.remove('is-visible'), 5200);
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return String(value || '');
    }
  }

  function typeLabel(id) {
    const found = TYPES.find(t => t.id === id);
    return found ? found.label : (id || 'Emergência');
  }

  function makeEl(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function createBaseUI() {
    if (document.querySelector('.vr-panic-button')) return;

    const panicButton = makeEl('button', 'vr-panic-button', '🚨 Emergência');
    panicButton.type = 'button';
    panicButton.title = 'Acionar síndico e portaria em caso de emergência';
    panicButton.addEventListener('click', openPanicModal);
    document.body.appendChild(panicButton);

    const user = getCurrentUser();
    if (isResponder(user)) {
      const adminButton = makeEl('button', 'vr-panic-admin-button', 'Ocorrências <span class="vr-panic-admin-badge">0</span>');
      adminButton.type = 'button';
      adminButton.addEventListener('click', openAdminPanel);
      document.body.appendChild(adminButton);
    }

    createPublicAlert();
  }

  function createPublicAlert() {
    if (document.querySelector('.vr-panic-alert')) return;
    const alert = makeEl('div', 'vr-panic-alert', '');
    document.body.appendChild(alert);
  }

  function openPanicModal() {
    selectedType = null;
    requestNotificationPermission();

    const user = getCurrentUser();
    const overlay = makeEl('div', 'vr-panic-overlay is-open');
    overlay.innerHTML = `
      <div class="vr-panic-modal" role="dialog" aria-modal="true" aria-label="Acionar emergência">
        <div class="vr-panic-head">
          <div>
            <h2 class="vr-panic-title">Acionar emergência</h2>
            <p class="vr-panic-subtitle">
              O alerta será enviado primeiro para a portaria e o síndico. 
              Moradores só serão avisados após confirmação da administração.
            </p>
          </div>
          <button class="vr-panic-close" type="button" aria-label="Fechar">×</button>
        </div>
        <div class="vr-panic-body">
          <div class="vr-panic-grid">
            ${TYPES.map(t => `
              <button class="vr-panic-type" type="button" data-type="${t.id}">
                <strong>${t.label}</strong>
                <span>${t.hint}</span>
              </button>
            `).join('')}
          </div>

          <div class="vr-panic-field">
            <label>Unidade habitacional</label>
            <input id="vr-panic-unit" placeholder="Ex.: Bloco B, apto 305" value="${escapeHtml([user.block, user.unit].filter(Boolean).join(' - '))}">
          </div>

          <div class="vr-panic-field">
            <label>Detalhes rápidos, se possível</label>
            <textarea id="vr-panic-description" rows="3" placeholder="Ex.: cheiro de fumaça no corredor, pessoa passando mal, barulho de invasão..."></textarea>
          </div>

          <label class="vr-panic-confirm-row">
            <input id="vr-panic-confirm-check" type="checkbox">
            <span>
              Confirmo que esta é uma situação urgente. A portaria e o síndico serão avisados imediatamente.
              Em risco imediato à vida, acione também os serviços públicos de emergência.
            </span>
          </label>

          <div class="vr-panic-actions">
            <button class="vr-panic-secondary" type="button" data-close>Cancelar</button>
            <button class="vr-panic-danger" type="button" id="vr-panic-send" disabled>Enviar para síndico e portaria</button>
          </div>

          <p class="vr-panic-note">
            Este recurso não substitui os canais oficiais de emergência. Ele serve para acelerar a comunicação interna do condomínio.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.vr-panic-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.vr-panic-type').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.vr-panic-type').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        selectedType = btn.dataset.type;
        updateSendState(overlay);
      });
    });

    overlay.querySelector('#vr-panic-confirm-check').addEventListener('change', () => updateSendState(overlay));
    overlay.querySelector('#vr-panic-send').addEventListener('click', () => submitPanic(overlay));
  }

  function updateSendState(overlay) {
    const checked = overlay.querySelector('#vr-panic-confirm-check').checked;
    overlay.querySelector('#vr-panic-send').disabled = !(selectedType && checked);
  }

  async function submitPanic(overlay) {
    const send = overlay.querySelector('#vr-panic-send');
    const user = getCurrentUser();
    const unitRaw = overlay.querySelector('#vr-panic-unit').value.trim();
    const description = overlay.querySelector('#vr-panic-description').value.trim();

    send.disabled = true;
    send.textContent = 'Enviando...';

    const payload = {
      type: selectedType,
      label: typeLabel(selectedType),
      description,
      unit: unitRaw || user.unit || '',
      block: user.block || '',
      createdBy: user.id || user.name,
      createdByName: user.name,
      createdByRole: user.role,
      source: 'browser'
    };

    try {
      await api('', { method: 'POST', body: JSON.stringify(payload) });
      overlay.remove();
      toast('Emergência enviada para a portaria e o síndico. Aguarde retorno da administração.', false);
      notifyBrowser('Emergência enviada', 'A portaria e o síndico foram avisados.', 'panic-sent');
    } catch (err) {
      send.disabled = false;
      send.textContent = 'Enviar para síndico e portaria';
      toast('Não foi possível enviar a emergência: ' + err.message, true);
    }
  }

  function openAdminPanel() {
    adminPanelOpen = true;
    requestNotificationPermission();

    let overlay = document.querySelector('#vr-panic-admin-overlay');
    if (overlay) overlay.remove();

    overlay = makeEl('div', 'vr-panic-overlay is-open');
    overlay.id = 'vr-panic-admin-overlay';
    overlay.innerHTML = `
      <div class="vr-panic-panel" role="dialog" aria-modal="true" aria-label="Painel de emergências">
        <div class="vr-panic-head">
          <div>
            <h2 class="vr-panic-title">Painel de emergências</h2>
            <p class="vr-panic-subtitle">
              Emergências acionadas por moradores aparecem primeiro aqui. 
              Somente após confirmação da portaria/síndico o alerta será enviado aos moradores.
            </p>
          </div>
          <button class="vr-panic-close" type="button" aria-label="Fechar">×</button>
        </div>
        <div class="vr-panic-body">
          <div id="vr-panic-admin-list" class="vr-panic-list">
            <div class="vr-panic-card">Carregando ocorrências...</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.vr-panic-close').addEventListener('click', () => {
      adminPanelOpen = false;
      overlay.remove();
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        adminPanelOpen = false;
        overlay.remove();
      }
    });

    renderAdminList();
  }

  function renderAdminList() {
    const list = document.querySelector('#vr-panic-admin-list');
    if (!list) return;

    const items = pendingCache.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!items.length) {
      list.innerHTML = `
        <div class="vr-panic-card">
          <div class="vr-panic-card-title">Nenhuma ocorrência pendente no momento.</div>
          <div class="vr-panic-card-meta">Quando um morador acionar emergência, ela aparecerá aqui.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = items.map(item => emergencyCardHtml(item)).join('');

    list.querySelectorAll('[data-confirm-id]').forEach(btn => {
      btn.addEventListener('click', () => openConfirmBroadcast(btn.dataset.confirmId));
    });
    list.querySelectorAll('[data-resolve-id]').forEach(btn => {
      btn.addEventListener('click', () => resolveEmergency(btn.dataset.resolveId));
    });
  }

  function emergencyCardHtml(item) {
    const status = item.status || 'pending';
    const statusLabel = status === 'pending' ? 'Aguardando confirmação'
      : status === 'confirmed' ? 'Alerta enviado'
      : 'Resolvido';

    return `
      <div class="vr-panic-card">
        <div class="vr-panic-card-top">
          <div>
            <div class="vr-panic-card-title">🚨 ${escapeHtml(typeLabel(item.type || item.label))}</div>
            <div class="vr-panic-card-meta">
              Unidade: <strong>${escapeHtml(item.unit || 'não informada')}</strong><br>
              Solicitante: ${escapeHtml(item.createdByName || item.createdBy || 'não informado')}<br>
              Horário: ${escapeHtml(formatDate(item.createdAt))}<br>
              ${item.description ? 'Detalhes: ' + escapeHtml(item.description) : ''}
            </div>
          </div>
          <span class="vr-panic-status ${escapeHtml(status)}">${statusLabel}</span>
        </div>
        ${status === 'pending' ? `
          <div class="vr-panic-card-actions">
            <button class="vr-panic-success" type="button" data-confirm-id="${escapeHtml(item.id)}">Confirmar e avisar moradores</button>
            <button class="vr-panic-secondary" type="button" data-resolve-id="${escapeHtml(item.id)}">Encerrar / falso alarme</button>
          </div>
        ` : `
          <div class="vr-panic-card-actions">
            <button class="vr-panic-secondary" type="button" data-resolve-id="${escapeHtml(item.id)}">Marcar como resolvido</button>
          </div>
        `}
      </div>
    `;
  }

  function openConfirmBroadcast(id) {
    const item = pendingCache.find(x => x.id === id);
    if (!item) return;

    const overlay = makeEl('div', 'vr-panic-overlay is-open');
    overlay.innerHTML = `
      <div class="vr-panic-modal" role="dialog" aria-modal="true" aria-label="Confirmar envio aos moradores">
        <div class="vr-panic-head">
          <div>
            <h2 class="vr-panic-title">Confirmar alerta aos moradores</h2>
            <p class="vr-panic-subtitle">Após confirmar, a notificação poderá aparecer para os moradores conforme o alcance selecionado.</p>
          </div>
          <button class="vr-panic-close" type="button" aria-label="Fechar">×</button>
        </div>
        <div class="vr-panic-body">
          <div class="vr-panic-card">
            <div class="vr-panic-card-title">🚨 ${escapeHtml(typeLabel(item.type || item.label))}</div>
            <div class="vr-panic-card-meta">
              Unidade: ${escapeHtml(item.unit || 'não informada')}<br>
              Horário: ${escapeHtml(formatDate(item.createdAt))}
            </div>
          </div>

          <div class="vr-panic-field">
            <label>Quem deve ser avisado?</label>
            <select id="vr-panic-scope">
              <option value="all">Todos os moradores</option>
              <option value="block">Somente bloco/torre da ocorrência</option>
              <option value="nearby">Unidades próximas/mesmo pavimento</option>
              <option value="staff">Somente equipe interna</option>
            </select>
          </div>

          <div class="vr-panic-field">
            <label>Mensagem do síndico/portaria</label>
            <textarea id="vr-panic-broadcast-message" rows="4">${escapeHtml(defaultBroadcastMessage(item))}</textarea>
          </div>

          <label class="vr-panic-confirm-row">
            <input id="vr-panic-broadcast-check" type="checkbox">
            <span>Confirmo que a ocorrência foi verificada pela portaria/síndico e que os moradores devem ser avisados conforme o alcance escolhido.</span>
          </label>

          <div class="vr-panic-actions">
            <button class="vr-panic-secondary" type="button" data-close>Cancelar</button>
            <button class="vr-panic-danger" type="button" id="vr-panic-broadcast-send" disabled>Enviar alerta aos moradores</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.vr-panic-close').addEventListener('click', close);
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.querySelector('#vr-panic-broadcast-check').addEventListener('change', (e) => {
      overlay.querySelector('#vr-panic-broadcast-send').disabled = !e.target.checked;
    });
    overlay.querySelector('#vr-panic-broadcast-send').addEventListener('click', async () => {
      const btn = overlay.querySelector('#vr-panic-broadcast-send');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      try {
        const user = getCurrentUser();
        await api('/' + encodeURIComponent(id) + '/confirm', {
          method: 'POST',
          body: JSON.stringify({
            scope: overlay.querySelector('#vr-panic-scope').value,
            message: overlay.querySelector('#vr-panic-broadcast-message').value.trim(),
            confirmedBy: user.id || user.name,
            confirmedByName: user.name,
            confirmedByRole: user.role
          })
        });
        close();
        toast('Alerta confirmado e liberado para os moradores selecionados.', false);
        notifyBrowser('Alerta enviado aos moradores', 'A ocorrência foi confirmada pela administração.', 'panic-confirmed-' + id);
        await refreshAdmin();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Enviar alerta aos moradores';
        toast('Não foi possível confirmar o alerta: ' + err.message, true);
      }
    });
  }

  function defaultBroadcastMessage(item) {
    const unit = item.unit ? ' na região da ' + item.unit : '';
    if (item.type === 'incendio') return 'Atenção: há uma ocorrência de possível incêndio' + unit + '. Mantenha a calma, evite elevadores e aguarde orientação da portaria/síndico.';
    if (item.type === 'gas') return 'Atenção: há suspeita de vazamento de gás' + unit + '. Evite acionar interruptores, mantenha ventilação e aguarde orientação da portaria/síndico.';
    if (item.type === 'seguranca') return 'Atenção: ocorrência de segurança comunicada à portaria' + unit + '. Redobre a atenção e aguarde novas orientações.';
    if (item.type === 'emergencia_medica') return 'Atenção: há uma emergência médica em atendimento' + unit + '. Evite aglomeração e libere a passagem da equipe de apoio.';
    return 'Atenção: ocorrência urgente confirmada pela administração' + unit + '. Aguarde orientação da portaria/síndico.';
  }

  async function resolveEmergency(id) {
    if (!confirm('Marcar esta ocorrência como encerrada/resolvida?')) return;
    try {
      const user = getCurrentUser();
      await api('/' + encodeURIComponent(id) + '/resolve', {
        method: 'POST',
        body: JSON.stringify({
          resolvedBy: user.id || user.name,
          resolvedByName: user.name,
          resolvedByRole: user.role
        })
      });
      toast('Ocorrência marcada como resolvida.', false);
      await refreshAdmin();
    } catch (err) {
      toast('Não foi possível resolver a ocorrência: ' + err.message, true);
    }
  }

  async function refreshAdmin() {
    const user = getCurrentUser();
    if (!isResponder(user)) return;

    try {
      const data = await api('/pending', { method: 'GET' });
      const items = Array.isArray(data) ? data : (data.items || []);
      pendingCache = items.filter(x => x.status !== 'resolved');

      updateAdminBadge(pendingCache.filter(x => x.status === 'pending').length);
      notifyNewAdminItems(pendingCache);
      if (adminPanelOpen) renderAdminList();
    } catch (_) {
      // Sem ruído: se o backend estiver indisponível, tentaremos novamente no próximo ciclo.
    }
  }

  function updateAdminBadge(count) {
    const btn = document.querySelector('.vr-panic-admin-button');
    if (!btn) return;
    btn.dataset.count = String(count);
    const badge = btn.querySelector('.vr-panic-admin-badge');
    if (badge) badge.textContent = String(count);
  }

  function notifyNewAdminItems(items) {
    let seen = safeJsonParse(localStorage.getItem(STORAGE_ADMIN_SEEN)) || {};
    let changed = false;

    items.filter(x => x.status === 'pending').forEach(item => {
      if (seen[item.id]) return;
      seen[item.id] = true;
      changed = true;
      toast('Nova emergência aguardando confirmação: ' + typeLabel(item.type), true);
      notifyBrowser('Nova emergência no condomínio', `${typeLabel(item.type)} — ${item.unit || 'unidade não informada'}`, 'panic-admin-' + item.id);
    });

    if (changed) localStorage.setItem(STORAGE_ADMIN_SEEN, JSON.stringify(seen));
  }

  async function refreshPublic() {
    try {
      const url = lastPublicCheck ? ('/public?since=' + encodeURIComponent(new Date(lastPublicCheck).toISOString())) : '/public';
      const data = await api(url, { method: 'GET' });
      const items = Array.isArray(data) ? data : (data.items || []);
      publicCache = items;
      lastPublicCheck = Date.now();
      showPublicAlerts(items);
    } catch (_) {}
  }

  function showPublicAlerts(items) {
    const user = getCurrentUser();
    let seen = safeJsonParse(localStorage.getItem(STORAGE_SEEN)) || {};
    let changed = false;

    items.forEach(item => {
      if (seen[item.id]) return;
      if (!shouldShowToUser(item, user)) return;

      seen[item.id] = true;
      changed = true;

      const title = '🚨 Alerta do condomínio';
      const body = item.broadcastMessage || defaultBroadcastMessage(item);
      showTopAlert(title, body);
      notifyBrowser(title, body, 'panic-public-' + item.id);
    });

    if (changed) localStorage.setItem(STORAGE_SEEN, JSON.stringify(seen));
  }

  function shouldShowToUser(item, user) {
    if (!item || item.status !== 'confirmed') return false;
    const scope = item.broadcastScope || item.scope || 'all';
    if (scope === 'all') return true;
    if (scope === 'staff') return isResponder(user);
    if (scope === 'block') {
      if (!item.block && !user.block) return true;
      return normalizeText(item.block) === normalizeText(user.block);
    }
    if (scope === 'nearby') {
      if (!item.unit || !user.unit) return true;
      const a = normalizeText(item.unit).replace(/\D/g, '');
      const b = normalizeText(user.unit).replace(/\D/g, '');
      if (!a || !b) return true;
      return a.slice(0, -1) === b.slice(0, -1);
    }
    return true;
  }

  function showTopAlert(title, body) {
    const alert = document.querySelector('.vr-panic-alert') || createPublicAlert();
    const el = document.querySelector('.vr-panic-alert');
    el.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p>`;
    el.classList.add('is-visible');
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => el.classList.remove('is-visible'), 20000);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function boot() {
    if (!document.body) return;
    createBaseUI();
    refreshAdmin();
    refreshPublic();

    setInterval(refreshAdmin, 12000);
    setInterval(refreshPublic, 15000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        refreshAdmin();
        refreshPublic();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();