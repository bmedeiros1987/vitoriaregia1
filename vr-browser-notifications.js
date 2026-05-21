(function () {
  'use strict';

  const STORAGE_KEY = 'vr_browser_notifications_state_v1';
  const ENABLED_KEY = 'vr_browser_notifications_enabled';
  const DEFAULT_POLL_MS = 45000;
  const BOOT_TIME = Date.now();

  const state = {
    open: false,
    activeTab: 'inbox',
    firstLoad: true,
    items: [],
    read: {},
    seen: {},
    user: null,
    polling: null,
  };

  function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function loadState() {
    const saved = safeJson(localStorage.getItem(STORAGE_KEY), {});
    state.read = saved.read || {};
    state.seen = saved.seen || {};
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      read: state.read,
      seen: state.seen,
      updatedAt: new Date().toISOString(),
    }));
  }

  function isEnabled() {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  }

  function setEnabled(value) {
    localStorage.setItem(ENABLED_KEY, value ? 'true' : 'false');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function normalizeRole(value) {
    const text = normalizeText(value);
    if (!text) return '';
    if (['admin', 'administrador', 'administradora'].includes(text)) return 'admin';
    if (['sindico', 'síndico'].includes(text)) return 'sindico';
    if (['subsindico', 'sub-sindico', 'subsíndico'].includes(text)) return 'subsindico';
    if (['portaria', 'porteiro', 'recepcao', 'recepção'].includes(text)) return 'portaria';
    if (['morador', 'residente', 'condomino', 'condômino'].includes(text)) return 'morador';
    return text;
  }

  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim()) return obj[key];
    }
    return '';
  }

  function findUserInLocalStorage() {
    const preferred = [
      'vr_user', 'vrUser', 'currentUser', 'usuarioLogado', 'loggedUser',
      'auth_user', 'authUser', 'user', 'usuario', 'sessionUser', 'profile'
    ];

    for (const key of preferred) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = safeJson(raw, null);
      if (parsed && typeof parsed === 'object') return parsed.user || parsed.usuario || parsed.profile || parsed;
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!/user|usuario|morador|auth|session/i.test(key || '')) continue;
      const parsed = safeJson(localStorage.getItem(key), null);
      if (parsed && typeof parsed === 'object') return parsed.user || parsed.usuario || parsed.profile || parsed;
    }

    return {};
  }

  function getCurrentUser() {
    const raw = findUserInLocalStorage();
    const nestedResident = raw.resident || raw.morador || raw.profile || {};
    const id = String(pick(raw, ['id', 'userId', 'usuarioId', 'uid', 'email']) || pick(nestedResident, ['id', 'email']) || 'local-user');
    const name = String(pick(raw, ['name', 'nome', 'fullName', 'displayName']) || pick(nestedResident, ['name', 'nome']) || 'Usuário');
    const role = normalizeRole(pick(raw, ['role', 'perfil', 'tipo', 'cargo', 'permission', 'permissao', 'permissão']) || pick(nestedResident, ['role', 'perfil', 'tipo']));
    const unit = String(pick(raw, ['unit', 'unidade', 'apartment', 'apartamento', 'numeroUnidade', 'numero_unidade']) || pick(nestedResident, ['unit', 'unidade', 'apartment', 'apartamento']) || '').trim();
    const email = String(pick(raw, ['email']) || pick(nestedResident, ['email']) || '').trim();

    return { id, name, role: role || 'morador', unit, email, raw };
  }

  function getToken() {
    const keys = ['token', 'authToken', 'accessToken', 'vr_token', 'jwt', 'idToken'];
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) return value.replace(/^Bearer\s+/i, '');
    }
    return '';
  }

  function authHeaders() {
    const user = state.user || getCurrentUser();
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      'X-VR-User-Id': user.id || '',
      'X-VR-User-Role': user.role || '',
      'X-VR-User-Unit': user.unit || '',
      'X-VR-User-Name': user.name || '',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function sanitizeId(value) {
    return String(value || '')
      .replace(/[^a-zA-Z0-9_.:-]/g, '-')
      .slice(0, 100);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeNotification(input, source) {
    const item = input || {};
    const type = item.type || item.kind || item.categoria || source || 'geral';
    const id = sanitizeId(item.id || item.notification_id || item.codigo || `${type}-${item.created_at || item.createdAt || item.updated_at || Date.now()}-${item.title || item.titulo || ''}`);
    const title = item.title || item.titulo || item.subject || item.assunto || titleForType(type);
    const body = item.body || item.message || item.mensagem || item.description || item.descricao || item.observacao || '';
    const createdAt = item.created_at || item.createdAt || item.data || item.date || item.updated_at || nowIso();
    const targetUnit = item.target_unit || item.targetUnit || item.unit || item.unidade || item.apartment || item.apartamento || '';
    const targetRole = normalizeRole(item.target_role || item.targetRole || item.role || item.perfil || '');
    const targetUserId = item.target_user_id || item.targetUserId || item.user_id || item.usuario_id || '';
    const audience = normalizeText(item.audience || item.publico || item.destinatario || (targetUnit ? 'unit' : 'all'));
    const priority = normalizeText(item.priority || item.prioridade || item.level || 'normal');
    const url = item.url || item.link || urlForType(type);

    return {
      id,
      title: String(title || titleForType(type)).trim(),
      body: String(body || '').trim(),
      type: normalizeText(type) || 'geral',
      priority: priority || 'normal',
      audience: audience || 'all',
      targetUnit: String(targetUnit || '').trim(),
      targetRole,
      targetUserId: String(targetUserId || '').trim(),
      createdAt,
      url,
      source: source || item.source || 'system',
      raw: item,
    };
  }

  function titleForType(type) {
    const text = normalizeText(type);
    if (text.includes('package') || text.includes('encomenda')) return 'Nova encomenda registrada';
    if (text.includes('visitor') || text.includes('visitante')) return 'Visitante registrado';
    if (text.includes('notice') || text.includes('comunicado')) return 'Comunicado do condomínio';
    if (text.includes('maintenance') || text.includes('manutencao')) return 'Aviso de manutenção';
    if (text.includes('booking') || text.includes('reserva')) return 'Atualização de reserva';
    if (text.includes('service') || text.includes('solicitacao')) return 'Solicitação atualizada';
    return 'Nova notificação';
  }

  function urlForType(type) {
    const text = normalizeText(type);
    if (text.includes('package') || text.includes('encomenda')) return '#encomendas';
    if (text.includes('visitor') || text.includes('visitante')) return '#visitantes';
    if (text.includes('notice') || text.includes('comunicado')) return '#comunicados';
    if (text.includes('booking') || text.includes('reserva')) return '#reservas';
    if (text.includes('service') || text.includes('solicitacao')) return '#servicos';
    return '#';
  }

  function userCanSee(item) {
    const user = state.user || getCurrentUser();
    const role = normalizeRole(user.role);
    const audience = normalizeText(item.audience);
    const targetRole = normalizeRole(item.targetRole || item.target_role);
    const targetUnit = String(item.targetUnit || item.target_unit || '').trim();
    const targetUserId = String(item.targetUserId || item.target_user_id || '').trim();

    if (['admin', 'sindico', 'subsindico', 'portaria'].includes(role) && audience !== 'morador') return true;
    if (!audience || ['all', 'geral', 'general', 'todos'].includes(audience)) return true;
    if (targetUserId && targetUserId === String(user.id || '')) return true;
    if (targetRole && targetRole === role) return true;
    if (targetUnit && String(user.unit || '').trim() && targetUnit === String(user.unit).trim()) return true;
    if (audience === 'unit' || audience === 'unidade') return Boolean(targetUnit && targetUnit === String(user.unit || '').trim());
    if (audience === 'role' || audience === 'perfil') return Boolean(targetRole && targetRole === role);
    return false;
  }

  function isAdminLike() {
    const role = normalizeRole((state.user || getCurrentUser()).role);
    return ['admin', 'sindico', 'subsindico', 'portaria'].includes(role);
  }

  function mergeItems(items) {
    const existing = new Map(state.items.map((item) => [item.id, item]));
    const incoming = [];

    items
      .map((item) => normalizeNotification(item, item.source))
      .filter(userCanSee)
      .forEach((item) => {
        if (!existing.has(item.id)) incoming.push(item);
        existing.set(item.id, { ...existing.get(item.id), ...item });
      });

    state.items = Array.from(existing.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 80);

    updateBadge();
    renderList();

    if (!state.firstLoad) {
      incoming.forEach((item) => maybeShowBrowserNotification(item));
    }
  }

  function shouldTriggerBrowser(item) {
    if (!isEnabled()) return false;
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    if (state.seen[item.id]) return false;

    const created = new Date(item.createdAt).getTime();
    if (Number.isFinite(created) && created < BOOT_TIME - 60000) return false;
    return true;
  }

  function maybeShowBrowserNotification(item) {
    state.seen[item.id] = nowIso();
    saveState();

    if (!shouldTriggerBrowser(item)) return;

    const notification = new Notification(item.title || 'Notificação do condomínio', {
      body: item.body || 'Há uma nova atualização no sistema.',
      tag: item.id,
      renotify: item.priority === 'urgente' || item.priority === 'urgent',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: item.url || '#', id: item.id },
    });

    notification.onclick = function () {
      window.focus();
      markRead(item.id);
      if (item.url && item.url !== '#') window.location.href = item.url;
      notification.close();
    };
  }

  async function requestPermission() {
    if (!('Notification' in window)) {
      alert('Este navegador não suporta notificações nativas.');
      return false;
    }
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setEnabled(granted);
    updateStatus();
    updateBadge();
    return granted;
  }

  function endpointUrl(path, params) {
    const url = new URL(path, window.location.origin);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) url.searchParams.set(key, value);
    });
    return url.toString();
  }

  async function fetchJson(path, options) {
    const response = await fetch(path, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function extractArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.notifications)) return payload.notifications;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.rows)) return payload.rows;
    return [];
  }

  async function pollCentralNotifications() {
    const user = state.user || getCurrentUser();
    const url = endpointUrl('/api/notifications', {
      unit: user.unit,
      role: user.role,
      userId: user.id,
      limit: 40,
    });
    const payload = await fetchJson(url, { headers: authHeaders() });
    return extractArray(payload).map((item) => ({ ...item, source: 'central' }));
  }

  async function pollExistingEndpoint(path, source, mapper) {
    try {
      const payload = await fetchJson(path, { headers: authHeaders() });
      return extractArray(payload).map((item) => normalizeNotification(mapper(item), source));
    } catch (_) {
      return [];
    }
  }

  function mapNotice(item) {
    return {
      ...item,
      id: item.id || item.notice_id || item.codigo,
      type: 'comunicado',
      title: item.title || item.titulo || 'Comunicado do síndico',
      body: item.body || item.message || item.mensagem || item.descricao,
      audience: item.audience || item.publico || (item.unidade ? 'unit' : 'all'),
      target_unit: item.target_unit || item.unidade,
      url: '#comunicados',
    };
  }

  function mapPackage(item) {
    const unit = item.unit || item.unidade || item.apartamento;
    const recipient = item.recipient || item.destinatario || item.morador || '';
    return {
      ...item,
      type: 'encomenda',
      title: 'Encomenda registrada',
      body: recipient ? `Encomenda para ${recipient}${unit ? ` - Unidade ${unit}` : ''}.` : `Nova encomenda${unit ? ` para a unidade ${unit}` : ''}.`,
      audience: unit ? 'unit' : 'role',
      target_unit: unit,
      target_role: unit ? '' : 'portaria',
      url: '#encomendas',
    };
  }

  function mapVisitor(item) {
    const unit = item.unit || item.unidade || item.apartamento;
    const name = item.name || item.nome || item.visitor_name || item.visitante || 'Visitante';
    return {
      ...item,
      type: 'visitante',
      title: 'Visitante registrado',
      body: `${name}${unit ? ` para a unidade ${unit}` : ''}.`,
      audience: unit ? 'unit' : 'role',
      target_unit: unit,
      target_role: unit ? '' : 'portaria',
      url: '#visitantes',
    };
  }

  async function pollAll() {
    state.user = getCurrentUser();
    const chunks = [];

    try {
      chunks.push(await pollCentralNotifications());
    } catch (_) {
      // O backend central é opcional. Se ainda não estiver instalado, seguimos com os endpoints existentes.
    }

    const fallback = await Promise.all([
      pollExistingEndpoint('/api/notices', 'comunicados', mapNotice),
      pollExistingEndpoint('/api/announcements', 'comunicados', mapNotice),
      pollExistingEndpoint('/api/packages', 'encomendas', mapPackage),
      pollExistingEndpoint('/api/visitors', 'visitantes', mapVisitor),
    ]);

    fallback.forEach((list) => chunks.push(list));
    mergeItems(chunks.flat());

    if (state.firstLoad) {
      state.items.forEach((item) => { state.seen[item.id] = state.seen[item.id] || nowIso(); });
      state.firstLoad = false;
      saveState();
    }
  }

  async function createNotification(payload) {
    const normalized = normalizeNotification(payload, 'manual');
    try {
      const response = await fetchJson('/api/notifications', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(normalized),
      });
      const item = response.notification || response.item || response;
      mergeItems([{ ...item, source: 'central' }]);
      return true;
    } catch (error) {
      // Fallback local: útil para teste, mas não distribui para outros dispositivos.
      mergeItems([{ ...normalized, id: `local-${Date.now()}`, createdAt: nowIso(), source: 'local' }]);
      return false;
    }
  }

  async function markRead(id) {
    if (!id) return;
    state.read[id] = nowIso();
    saveState();
    updateBadge();
    renderList();
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ read: true }),
      });
    } catch (_) {}
  }

  async function markAllRead() {
    state.items.forEach((item) => { state.read[item.id] = nowIso(); });
    saveState();
    updateBadge();
    renderList();
  }

  function unreadCount() {
    return state.items.filter((item) => !state.read[item.id]).length;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function priorityClass(priority) {
    const text = normalizeText(priority);
    if (['urgente', 'urgent', 'critica', 'crítica'].includes(text)) return 'vrn-pill--urgent';
    if (['alta', 'importante', 'warning', 'aviso'].includes(text)) return 'vrn-pill--warning';
    if (['ok', 'resolvido', 'success'].includes(text)) return 'vrn-pill--success';
    return '';
  }

  function priorityLabel(priority) {
    const text = normalizeText(priority);
    if (text === 'urgent') return 'urgente';
    if (!text || text === 'normal') return 'normal';
    return text;
  }

  function updateBadge() {
    const count = unreadCount();
    const badge = document.querySelector('[data-vrn-count]');
    if (!badge) return;
    badge.hidden = count <= 0;
    badge.textContent = count > 99 ? '99+' : String(count);
  }

  function updateStatus() {
    const status = document.querySelector('[data-vrn-status]');
    if (!status) return;

    const supported = 'Notification' in window;
    const permission = supported ? Notification.permission : 'unsupported';
    const enabled = isEnabled();

    let label = 'Notificações do navegador desativadas';
    if (!supported) label = 'Seu navegador não suporta notificações nativas';
    else if (permission === 'granted' && enabled) label = 'Notificações do navegador ativadas';
    else if (permission === 'denied') label = 'Permissão bloqueada no navegador';
    else if (permission === 'granted' && !enabled) label = 'Permissão concedida, mas avisos pausados';

    status.textContent = label;
  }

  function renderList() {
    const list = document.querySelector('[data-vrn-list]');
    if (!list) return;

    const visibleItems = state.activeTab === 'unread'
      ? state.items.filter((item) => !state.read[item.id])
      : state.items;

    if (!visibleItems.length) {
      list.innerHTML = '<div class="vrn-empty">Nenhuma notificação para exibir.</div>';
      return;
    }

    list.innerHTML = visibleItems.map((item) => {
      const isUnread = !state.read[item.id];
      const target = item.targetUnit ? `Unidade ${escapeHtml(item.targetUnit)}` : 'Geral';
      const priority = priorityLabel(item.priority);
      return `
        <article class="vrn-item ${isUnread ? 'is-unread' : ''}" data-vrn-id="${escapeHtml(item.id)}">
          <div class="vrn-item__top">
            <h4 class="vrn-item__title">${escapeHtml(item.title)}</h4>
            <span class="vrn-pill ${priorityClass(priority)}">${escapeHtml(priority)}</span>
          </div>
          ${item.body ? `<p class="vrn-item__body">${escapeHtml(item.body)}</p>` : ''}
          <div class="vrn-meta">
            <span>${escapeHtml(target)}</span>
            <span>•</span>
            <span>${escapeHtml(formatDate(item.createdAt))}</span>
            <span>•</span>
            <span>${escapeHtml(item.source || 'sistema')}</span>
          </div>
          <div class="vrn-actions">
            ${isUnread ? '<button class="vrn-btn" data-vrn-mark-read>Marcar como lida</button>' : ''}
            ${item.url && item.url !== '#' ? '<button class="vrn-btn" data-vrn-open>Ver no sistema</button>' : ''}
          </div>
        </article>`;
    }).join('');
  }

  function renderComposerVisibility() {
    const composer = document.querySelector('[data-vrn-composer]');
    const tab = document.querySelector('[data-vrn-tab="compose"]');
    if (!composer || !tab) return;
    const allowed = isAdminLike();
    tab.style.display = allowed ? '' : 'none';
    composer.classList.toggle('is-visible', allowed && state.activeTab === 'compose');
  }

  function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-vrn-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.vrnTab === tab);
    });
    const list = document.querySelector('[data-vrn-list]');
    if (list) list.style.display = tab === 'compose' ? 'none' : '';
    renderComposerVisibility();
    renderList();
  }

  function createUi() {
    if (document.querySelector('[data-vrn-root]')) return;

    const root = document.createElement('div');
    root.dataset.vrnRoot = 'true';
    root.innerHTML = `
      <button class="vrn-bell" type="button" data-vrn-open-panel aria-label="Abrir notificações">
        <span class="vrn-bell__icon">🔔</span>
        <span class="vrn-bell__label">Notificações</span>
        <span class="vrn-bell__count" data-vrn-count hidden>0</span>
      </button>

      <div class="vrn-overlay" data-vrn-overlay>
        <section class="vrn-panel" role="dialog" aria-modal="true" aria-label="Central de notificações">
          <header class="vrn-header">
            <div>
              <h3 class="vrn-title">Central de notificações</h3>
              <p class="vrn-subtitle">Avisos gerais, comunicados do síndico e alertas da unidade.</p>
            </div>
            <button class="vrn-close" type="button" data-vrn-close>×</button>
          </header>

          <div class="vrn-toolbar">
            <div class="vrn-status">
              <span data-vrn-status>Carregando status...</span>
            </div>
            <div class="vrn-actions">
              <button class="vrn-btn vrn-btn--primary" type="button" data-vrn-enable>Ativar notificações</button>
              <button class="vrn-btn" type="button" data-vrn-pause>Pausar</button>
              <button class="vrn-btn" type="button" data-vrn-refresh>Atualizar</button>
              <button class="vrn-btn" type="button" data-vrn-read-all>Marcar tudo como lido</button>
            </div>
          </div>

          <nav class="vrn-tabs" aria-label="Filtros de notificação">
            <button class="vrn-tab is-active" type="button" data-vrn-tab="inbox">Todas</button>
            <button class="vrn-tab" type="button" data-vrn-tab="unread">Não lidas</button>
            <button class="vrn-tab" type="button" data-vrn-tab="compose">Novo comunicado</button>
          </nav>

          <div class="vrn-body">
            <form class="vrn-composer" data-vrn-composer>
              <div class="vrn-field">
                <label>Título</label>
                <input class="vrn-input" name="title" maxlength="160" placeholder="Ex.: Manutenção na garagem" required>
              </div>
              <div class="vrn-field">
                <label>Mensagem</label>
                <textarea class="vrn-textarea" name="body" maxlength="1000" placeholder="Escreva o comunicado de forma objetiva." required></textarea>
              </div>
              <div class="vrn-grid-2">
                <div class="vrn-field">
                  <label>Destinatário</label>
                  <select class="vrn-select" name="audience">
                    <option value="all">Todos os moradores</option>
                    <option value="unit">Unidade específica</option>
                    <option value="role">Perfil específico</option>
                  </select>
                </div>
                <div class="vrn-field">
                  <label>Prioridade</label>
                  <select class="vrn-select" name="priority">
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>
              <div class="vrn-grid-2">
                <div class="vrn-field">
                  <label>Unidade, se aplicável</label>
                  <input class="vrn-input" name="targetUnit" placeholder="Ex.: 101, A-204">
                </div>
                <div class="vrn-field">
                  <label>Perfil, se aplicável</label>
                  <select class="vrn-select" name="targetRole">
                    <option value="">Selecionar</option>
                    <option value="morador">Morador</option>
                    <option value="portaria">Portaria</option>
                    <option value="sindico">Síndico</option>
                    <option value="subsindico">Subsíndico</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>
              <button class="vrn-btn vrn-btn--primary" type="submit">Publicar comunicado</button>
            </form>
            <div class="vrn-list" data-vrn-list></div>
          </div>
        </section>
      </div>`;

    document.body.appendChild(root);
    bindUiEvents(root);
    updateStatus();
    renderComposerVisibility();
    renderList();
  }

  function bindUiEvents(root) {
    root.querySelector('[data-vrn-open-panel]').addEventListener('click', () => {
      state.open = true;
      root.querySelector('[data-vrn-overlay]').classList.add('is-open');
      pollAll();
    });

    root.querySelector('[data-vrn-close]').addEventListener('click', closePanel);
    root.querySelector('[data-vrn-overlay]').addEventListener('click', (event) => {
      if (event.target.matches('[data-vrn-overlay]')) closePanel();
    });

    root.querySelector('[data-vrn-enable]').addEventListener('click', async () => {
      if (Notification.permission === 'granted') {
        setEnabled(true);
        updateStatus();
      } else {
        await requestPermission();
      }
    });

    root.querySelector('[data-vrn-pause]').addEventListener('click', () => {
      setEnabled(false);
      updateStatus();
    });

    root.querySelector('[data-vrn-refresh]').addEventListener('click', pollAll);
    root.querySelector('[data-vrn-read-all]').addEventListener('click', markAllRead);

    root.querySelectorAll('[data-vrn-tab]').forEach((button) => {
      button.addEventListener('click', () => setTab(button.dataset.vrnTab));
    });

    root.addEventListener('click', (event) => {
      const itemElement = event.target.closest('[data-vrn-id]');
      if (!itemElement) return;
      const id = itemElement.dataset.vrnId;
      const item = state.items.find((entry) => entry.id === id);
      if (event.target.matches('[data-vrn-mark-read]')) markRead(id);
      if (event.target.matches('[data-vrn-open]') && item) {
        markRead(id);
        if (item.url && item.url !== '#') window.location.href = item.url;
      }
    });

    root.querySelector('[data-vrn-composer]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form).entries());
      const ok = await createNotification({
        title: data.title,
        body: data.body,
        type: 'comunicado',
        audience: data.audience,
        priority: data.priority,
        targetUnit: data.targetUnit,
        targetRole: data.targetRole,
        url: '#comunicados',
      });
      form.reset();
      setTab('inbox');
      if (!ok) alert('Comunicado salvo apenas neste navegador. Para distribuir para outros moradores, instale também o backend de notificações incluído no ZIP.');
    });
  }

  function closePanel() {
    state.open = false;
    const overlay = document.querySelector('[data-vrn-overlay]');
    if (overlay) overlay.classList.remove('is-open');
  }

  function startPolling() {
    if (state.polling) clearInterval(state.polling);
    pollAll();
    state.polling = setInterval(pollAll, DEFAULT_POLL_MS);
  }

  function init() {
    loadState();
    state.user = getCurrentUser();
    createUi();
    updateBadge();
    startPolling();

    window.addEventListener('storage', () => {
      state.user = getCurrentUser();
      loadState();
      updateBadge();
      renderList();
    });

    window.addEventListener('vr:notify', (event) => {
      mergeItems([{ ...event.detail, createdAt: event.detail.createdAt || nowIso(), source: event.detail.source || 'sistema' }]);
    });

    window.VRNotify = {
      emit: (notification) => mergeItems([{ ...notification, createdAt: notification.createdAt || nowIso(), source: notification.source || 'manual' }]),
      create: createNotification,
      refresh: pollAll,
      markRead,
      requestPermission,
      currentUser: getCurrentUser,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
