const STORE_PREFIX = 'vitoriaRegia.full.v1.';
const keys = {
  session: `${STORE_PREFIX}session`,
  pendingResidents: `${STORE_PREFIX}pendingResidents`,
  residents: `${STORE_PREFIX}residents`,
  bookings: `${STORE_PREFIX}bookings`,
  packages: `${STORE_PREFIX}packages`,
  visitors: `${STORE_PREFIX}visitors`,
  notices: `${STORE_PREFIX}notices`,
  staff: `${STORE_PREFIX}staff`,
  services: `${STORE_PREFIX}services`,
  serviceRequests: `${STORE_PREFIX}serviceRequests`,
  contactMessages: `${STORE_PREFIX}contactMessages`,
  settings: `${STORE_PREFIX}settings`,
};

const BACKEND_API = window.VR_API_BASE || '';
const BACKEND_STATE_KEYS = Object.keys(keys);
let backendAvailable = false;
let suppressBackendSync = false;
let stateSyncTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const roles = {
  morador: { label: 'Morador', title: 'Área do Morador' },
  sindico: { label: 'Síndico / Administração', title: 'Painel do Síndico' },
  portaria: { label: 'Portaria', title: 'Painel da Portaria' },
};

const defaultSettings = {
  condominiumName: 'Condomínio Vitória Régia',
  payee: 'Condomínio Vitória Régia\nInforme CNPJ, banco, agência e conta nas configurações.',
  bookingTerms: 'Declaro estar ciente das regras de uso do espaço comum, comprometendo-me a preservar o patrimônio, respeitar horários, limites de convidados, regras de segurança, limpeza e eventuais cobranças aprovadas pelo condomínio.',
  spaces: [
    { id: 'salao-festas', name: 'Salão de festas', fee: 250 },
    { id: 'churrasqueira', name: 'Churrasqueira', fee: 120 },
    { id: 'espaco-gourmet', name: 'Espaço gourmet', fee: 180 },
    { id: 'sala-reuniao', name: 'Sala de reunião', fee: 60 },
  ],
  notificationRules: {
    notifyEmail: true,
    notifyWhatsapp: true,
    residentStatus: true,
    bookingStatus: true,
    visitor: true,
    package: true,
    contact: true,
    serviceRequest: true,
  },
};

let session = null;
let calendarDate = new Date();
let currentBoletoBookingId = null;
let currentVisitorPhoto = '';
let notificationConfig = null;
let notificationConfigLoading = false;
let asaasConfig = null;
let asaasConfigLoading = false;

function apartments() {
  const list = [];
  for (let floor = 1; floor <= 11; floor++) {
    for (let unit = 1; unit <= 3; unit++) {
      list.push(`${floor}${String(unit).padStart(2, '0')}`);
    }
  }
  return list;
}

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function read(key, fallback) { return safeParse(localStorage.getItem(key), fallback); }
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  queueBackendSync();
}
function remove(key) {
  localStorage.removeItem(key);
  queueBackendSync();
}
function stateSnapshot() {
  const state = {};
  for (const name of BACKEND_STATE_KEYS) state[name] = read(keys[name], name === 'settings' ? defaultSettings : []);
  return state;
}
function applyBackendState(state = {}) {
  suppressBackendSync = true;
  try {
    for (const name of BACKEND_STATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(state, name)) {
        localStorage.setItem(keys[name], JSON.stringify(state[name]));
      }
    }
  } finally {
    suppressBackendSync = false;
  }
}

function asFormElement(source, fallbackSelector) {
  if (source instanceof HTMLFormElement) return source;
  if (source?.target instanceof HTMLFormElement) return source.target;
  if (source?.currentTarget instanceof HTMLFormElement) return source.currentTarget;
  if (source instanceof HTMLElement) {
    const closestForm = source.closest('form');
    if (closestForm instanceof HTMLFormElement) return closestForm;
  }
  const fallback = fallbackSelector ? $(fallbackSelector) : null;
  if (fallback instanceof HTMLFormElement) return fallback;
  throw new Error('Formulário de integrações não encontrado. Atualize a página e tente novamente.');
}

function formDataOf(source, fallbackSelector) {
  return new FormData(asFormElement(source, fallbackSelector));
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  const response = await fetch(`${BACKEND_API}${path}`, { credentials: 'include', ...options, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Erro HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

async function loadNotificationConfig() {
  if (!backendAvailable || !isSyndic() || notificationConfigLoading) return notificationConfig;
  notificationConfigLoading = true;
  try {
    const data = await apiRequest('/api/integrations/notifications');
    notificationConfig = data.config || null;
    renderNotificationSettings();
    return notificationConfig;
  } catch (error) {
    notificationConfig = null;
    const status = $('[data-integration-status]');
    if (status) status.innerHTML = `<div class="empty-state">Não foi possível carregar integrações: ${escapeHTML(error.message)}</div>`;
    return null;
  } finally {
    notificationConfigLoading = false;
  }
}

async function loadAsaasConfig() {
  if (!backendAvailable || !isSyndic() || asaasConfigLoading) return asaasConfig;
  asaasConfigLoading = true;
  try {
    const data = await apiRequest('/api/integrations/asaas');
    asaasConfig = data.config || null;
    renderNotificationSettings();
    return asaasConfig;
  } catch (error) {
    asaasConfig = null;
    const status = $('[data-integration-status]');
    if (status) status.innerHTML += `<div class="empty-state">Não foi possível carregar Asaas: ${escapeHTML(error.message)}</div>`;
    return null;
  } finally {
    asaasConfigLoading = false;
  }
}

async function saveAsaasConfigFromForm(form) {
  const data = formDataOf(form, '[data-notification-settings-form]');
  const payload = {
    enabled: Boolean(data.get('asaasEnabled')),
    environment: data.get('asaasEnvironment') || 'sandbox',
    apiKey: data.get('asaasApiKey') || '',
    dueDaysBeforeReservation: Number(data.get('asaasDueDays') || 2),
    fineValue: Number(data.get('asaasFine') || 0),
    interestValue: Number(data.get('asaasInterest') || 0),
    notificationEnabled: true,
  };
  const response = await apiRequest('/api/integrations/asaas', { method: 'POST', body: JSON.stringify(payload) });
  asaasConfig = response.config;
  renderNotificationSettings();
  return response;
}
function notificationRules() {
  return { ...defaultSettings.notificationRules, ...(getSettings().notificationRules || {}) };
}
async function saveNotificationConfigFromForm(form) {
  const data = formDataOf(form, '[data-notification-settings-form]');
  const payload = {
    email: {
      enabled: Boolean(data.get('emailEnabled')),
      provider: data.get('emailProvider') || 'smtp',
      host: data.get('smtpHost')?.trim() || 'smtp.gmail.com',
      port: Number(data.get('smtpPort') || 465),
      secure: data.get('smtpSecure') === 'true',
      user: data.get('smtpUser')?.trim() || '',
      password: data.get('smtpPassword') || '',
      fromName: data.get('smtpFromName')?.trim() || 'Condomínio Vitória Régia',
      fromEmail: data.get('smtpFromEmail')?.trim() || '',
      testTo: data.get('testEmailTo')?.trim() || data.get('smtpUser')?.trim() || '',
      mailersend: {
        apiKey: data.get('mailersendApiKey') || '',
        fromName: data.get('mailersendFromName')?.trim() || data.get('smtpFromName')?.trim() || 'Condomínio Vitória Régia',
        fromEmail: data.get('mailersendFromEmail')?.trim() || data.get('smtpFromEmail')?.trim() || '',
        testTo: data.get('testEmailTo')?.trim() || '',
      },
    },
    whatsapp: {
      enabled: Boolean(data.get('whatsappEnabled')),
      apiVersion: data.get('whatsappApiVersion')?.trim() || 'v20.0',
      token: data.get('whatsappToken') || '',
      phoneNumberId: data.get('whatsappPhoneNumberId')?.trim() || '',
      countryCode: data.get('whatsappCountryCode')?.trim() || '55',
    },
  };
  const response = await apiRequest('/api/integrations/notifications', { method: 'POST', body: JSON.stringify(payload) });
  notificationConfig = response.config;
  renderNotificationSettings();
  return response;
}
async function sendBackendNotification({ email, whatsapp, subject, message, channels }) {
  if (!backendAvailable) return { ok: false, results: [{ ok: false, error: 'Backend indisponível.' }] };
  const rules = notificationRules();
  const wanted = channels || [rules.notifyEmail ? 'email' : null, rules.notifyWhatsapp ? 'whatsapp' : null].filter(Boolean);
  if (!wanted.length) return { ok: false, results: [{ ok: false, error: 'Nenhum canal automático ativado.' }] };
  return apiRequest('/api/notifications/send', {
    method: 'POST',
    body: JSON.stringify({ channels: wanted, email, whatsapp, subject, message }),
  });
}
function resultSummary(response) {
  const list = response?.results || [response];
  return list.map((item) => `${item.channel || item.provider || 'canal'}: ${item.ok ? 'enviado' : `erro: ${item.error || 'falhou'}`}`).join(' • ');
}
function showNotificationFeedback(message, ok = true) {
  const el = $('[data-notification-settings-message]') || $('[data-visitor-message]') || $('[data-package-message]');
  if (el) {
    el.textContent = message;
    el.style.color = ok ? 'var(--green)' : 'var(--red)';
  } else if (message) alert(message);
}
async function notifyResidentEntity(resident, subject, message, channels) {
  if (!resident) return null;
  try {
    const response = await sendBackendNotification({ email: resident.email, whatsapp: resident.whatsapp, subject, message, channels });
    return response;
  } catch (error) {
    console.warn('Falha na notificação:', error.message);
    return { ok: false, results: [{ ok: false, error: error.message }] };
  }
}
async function maybeNotifyResident(resident, ruleKey, subject, message) {
  const rules = notificationRules();
  if (!rules[ruleKey]) return null;
  return notifyResidentEntity(resident, subject, message);
}

async function loadBackendState() {
  try {
    const data = await apiRequest('/api/state');
    backendAvailable = true;
    applyBackendState(data.state || {});
    if (!read(keys.settings, null)) write(keys.settings, defaultSettings);
    return true;
  } catch (error) {
    backendAvailable = false;
    return false;
  }
}
function queueBackendSync() {
  if (suppressBackendSync || !backendAvailable) return;
  clearTimeout(stateSyncTimer);
  stateSyncTimer = setTimeout(async () => {
    try {
      await apiRequest('/api/state/bulk', { method: 'POST', body: JSON.stringify({ state: stateSnapshot() }) });
    } catch (error) {
      console.warn('Não foi possível sincronizar com o banco agora:', error.message);
    }
  }, 350);
}
async function createBackendSession(payload) {
  if (!backendAvailable) return null;
  try { return await apiRequest('/auth/demo', { method: 'POST', body: JSON.stringify(payload) }); }
  catch (error) { console.warn('Sessão backend não criada:', error.message); return null; }
}
async function destroyBackendSession() {
  if (!backendAvailable) return;
  try { await apiRequest('/auth/logout', { method: 'POST' }); } catch {}
}
function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }
function toISODate(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function formatDate(value) {
  if (!value) return '-';
  return dateFormatter.format(new Date(`${value}T12:00:00`));
}
function formatDateTime(value) {
  if (!value) return '-';
  return dateTimeFormatter.format(new Date(value));
}
function cleanPhone(value = '') { return String(value).replace(/\D/g, ''); }
function statusLabel(status) {
  const map = {
    pending: 'Pré-agendado',
    approved: 'Validada / ocupada',
    canceled: 'Cancelada',
    rejected: 'Recusada',
    paid: 'Pagamento informado',
    delivered: 'Retirada',
    open: 'Aberta',
    sent: 'Enviada',
    saved: 'Registrada',
  };
  return map[status] || status || '-';
}
function statusClass(status) {
  return ['pending', 'approved', 'canceled', 'rejected', 'paid'].includes(status) ? status : 'pending';
}

function getSettings() { return { ...defaultSettings, ...read(keys.settings, {}) }; }
function saveSettings(settings) { write(keys.settings, settings); }
function getResidents() { return read(keys.residents, []); }
function normalizeResidents(list = []) {
  const byApartment = {};
  const normalized = (list || []).map((resident) => ({
    ...resident,
    residentType: resident.residentType || 'Morador',
    status: resident.status || 'approved',
    primaryBilling: Boolean(resident.primaryBilling),
    unitRented: Boolean(resident.unitRented),
  }));
  normalized.forEach((resident) => {
    if (!byApartment[resident.apartment]) byApartment[resident.apartment] = [];
    byApartment[resident.apartment].push(resident);
  });
  Object.values(byApartment).forEach((group) => {
    const unitRented = group.some((resident) => resident.unitRented);
    const primary = group.find((resident) => resident.primaryBilling) || group[0];
    group.forEach((resident) => {
      resident.unitRented = unitRented;
      resident.primaryBilling = Boolean(primary && resident.id === primary.id);
    });
  });
  return normalized;
}
function saveResidents(value) { write(keys.residents, normalizeResidents(value)); }
function getPendingResidents() { return read(keys.pendingResidents, []); }
function savePendingResidents(value) { write(keys.pendingResidents, value); }
function getBookings() { return read(keys.bookings, []); }
function saveBookings(value) { write(keys.bookings, value); }
function getVisitors() { return read(keys.visitors, []); }
function saveVisitors(value) { write(keys.visitors, value); }
function getPackages() { return read(keys.packages, []); }
function savePackages(value) { write(keys.packages, value); }
function getNotices() { return read(keys.notices, []); }
function saveNotices(value) { write(keys.notices, value); }
function getStaff() { return read(keys.staff, []); }
function saveStaff(value) { write(keys.staff, value); }
function getServices() { return read(keys.services, []); }
function saveServices(value) { write(keys.services, value); }
function getServiceRequests() { return read(keys.serviceRequests, []); }
function saveServiceRequests(value) { write(keys.serviceRequests, value); }
function getContactMessages() { return read(keys.contactMessages, []); }
function saveContactMessages(value) { write(keys.contactMessages, value); }

function seedDemo(force = false) {
  if (!force && localStorage.getItem(`${STORE_PREFIX}seeded`)) return;
  write(keys.settings, defaultSettings);
  write(keys.pendingResidents, [
    { id: uid('pending'), name: 'Mariana Costa', email: 'mariana@email.com', whatsapp: '(61) 99999-1010', apartment: '503', status: 'pending', createdAt: nowISO() },
    { id: uid('pending'), name: 'Paulo Lima', email: 'paulo@email.com', whatsapp: '(61) 99999-1103', apartment: '1103', status: 'pending', createdAt: nowISO() },
  ]);
  write(keys.residents, [
    { id: uid('resident'), name: 'Bruno Saraiva', email: 'bruno@email.com', whatsapp: '(61) 99999-0001', apartment: '101', residentType: 'Proprietário', primaryBilling: true, unitRented: false, status: 'approved', notes: 'Morador responsável.', createdAt: nowISO(), approvedAt: nowISO() },
    { id: uid('resident'), name: 'Camila Nogueira', email: 'camila@email.com', whatsapp: '(61) 99999-0002', apartment: '203', residentType: 'Inquilino', primaryBilling: true, unitRented: true, status: 'approved', notes: 'Contato principal da unidade alugada.', createdAt: nowISO(), approvedAt: nowISO() },
    { id: uid('resident'), name: 'Marcelo Nogueira', email: 'marcelo@email.com', whatsapp: '(61) 99999-0004', apartment: '203', residentType: 'Familiar', primaryBilling: false, unitRented: true, status: 'approved', notes: 'Morador adicional da unidade.', createdAt: nowISO(), approvedAt: nowISO() },
    { id: uid('resident'), name: 'Rafael Torres', email: 'rafael@email.com', whatsapp: '(61) 99999-0003', apartment: '902', residentType: 'Proprietário', primaryBilling: true, unitRented: false, status: 'approved', notes: '', createdAt: nowISO(), approvedAt: nowISO() },
  ]);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const plusFive = new Date(); plusFive.setDate(plusFive.getDate() + 5);
  write(keys.bookings, [
    { id: uid('booking'), spaceId: 'salao-festas', spaceName: 'Salão de festas', date: toISODate(tomorrow), period: 'Noite', apartment: '203', residentName: 'Camila Nogueira', residentEmail: 'camila@email.com', residentWhatsapp: '(61) 99999-0002', fee: 250, notes: 'Aniversário familiar.', guestCount: 3, eventResponsible: 'Camila Nogueira', guests: [{ name: 'Fernanda Lopes' }, { name: 'João Pereira' }, { name: 'Ana Costa' }], status: 'pending', signed: true, signedAt: nowISO(), createdAt: nowISO(), boleto: null, managerDocument: null, residentDocument: null },
    { id: uid('booking'), spaceId: 'churrasqueira', spaceName: 'Churrasqueira', date: toISODate(plusFive), period: 'Tarde', apartment: '101', residentName: 'Bruno Saraiva', residentEmail: 'bruno@email.com', residentWhatsapp: '(61) 99999-0001', fee: 120, notes: 'Confraternização.', status: 'approved', signed: true, signedAt: nowISO(), approvedAt: nowISO(), createdAt: nowISO(), boleto: null, managerDocument: null, residentDocument: null },
  ]);
  write(keys.packages, [
    { id: uid('package'), apartment: '902', recipient: 'Rafael Torres', carrier: 'Mercado Livre', code: 'ML-20391', notes: 'Volume pequeno.', status: 'open', createdAt: nowISO() },
  ]);
  write(keys.visitors, [
    { id: uid('visitor'), name: 'Fernanda Lopes', document: '***.321.***-**', phone: '(61) 99999-1111', apartment: '203', type: 'Visita social', notes: 'Autorizada pela moradora.', photo: '', createdAt: nowISO() },
  ]);
  write(keys.notices, [
    { id: uid('notice'), title: 'Manutenção preventiva', category: 'Manutenção', message: 'Haverá manutenção preventiva nas áreas comuns nesta semana. Agradecemos a compreensão de todos.', createdAt: nowISO() },
    { id: uid('notice'), title: 'Regras de reserva', category: 'Reservas', message: 'As reservas de espaços comuns precisam ser pré-agendadas pelo sistema e validadas pelo síndico.', createdAt: nowISO() },
  ]);

  write(keys.staff, [
    { id: uid('staff'), name: 'Bruno Saraiva', role: 'sindico', email: 'bmedeiros1987@gmail.com', whatsapp: '', active: true, notes: 'Responsável principal pela administração.', createdAt: nowISO() },
    { id: uid('staff'), name: 'Subsíndico', role: 'subsindico', email: '', whatsapp: '', active: true, notes: 'Cadastro editável pelo síndico.', createdAt: nowISO() },
    { id: uid('staff'), name: 'Portaria', role: 'porteiro', email: '', whatsapp: '', active: true, notes: 'Contato operacional da portaria.', createdAt: nowISO() },
  ]);
  write(keys.services, [
    { id: uid('service'), name: 'Controle-remoto de portão', category: 'Acesso', price: 85, active: true, description: 'Solicitação de controle-remoto para acesso ao condomínio.', requiresApproval: true, createdAt: nowISO() },
    { id: uid('service'), name: 'Segunda via de tag/cartão', category: 'Acesso', price: 35, active: true, description: 'Pedido de segunda via de tag ou cartão de acesso.', requiresApproval: true, createdAt: nowISO() },
  ]);
  write(keys.serviceRequests, []);
  write(keys.contactMessages, []);
  localStorage.setItem(`${STORE_PREFIX}seeded`, 'true');
}

function fillApartmentSelects() {
  const html = apartments().map((apt) => `<option value="${apt}">${apt}</option>`).join('');
  $$('[data-login-apartment], [data-signup-apartment], [data-resident-apartment], [data-booking-apartment], [data-visitor-apartment], [data-package-apartment]').forEach((select) => {
    select.innerHTML = html;
  });
}

function fillSpaceSelects() {
  const settings = getSettings();
  const options = settings.spaces.map((space) => `<option value="${escapeHTML(space.id)}">${escapeHTML(space.name)}</option>`).join('');
  $$('[data-space-select], [data-calendar-space]').forEach((select) => {
    if (!select) return;
    select.innerHTML = select.matches('[data-calendar-space]') ? `<option value="all">Todos</option>${options}` : options;
  });
  updateBookingFee();
}

function currentRole() { return session?.role || 'morador'; }
function roleAllowed(rolesCsv) {
  if (!rolesCsv) return true;
  return rolesCsv.split(',').map((item) => item.trim()).includes(currentRole());
}
function isSyndic() { return currentRole() === 'sindico'; }
function isResident() { return currentRole() === 'morador'; }

function applyPermissions() {
  $$('[data-roles]').forEach((el) => el.classList.toggle('is-role-hidden', !roleAllowed(el.dataset.roles)));
  const profileName = $('[data-profile-name]');
  const profileUnit = $('[data-profile-unit]');
  if (profileName) profileName.textContent = session ? `${roles[currentRole()].label}` : 'Não autenticado';
  if (profileUnit) profileUnit.textContent = session?.apartment ? `Unidade ${session.apartment} • ${session.name || ''}` : (session?.name || 'Acesso administrativo');
  const title = $('[data-page-title]');
  if (title) title.textContent = roles[currentRole()].title;
  const heroTitle = $('[data-hero-title]');
  const heroText = $('[data-hero-text]');
  if (heroTitle) heroTitle.textContent = currentRole() === 'portaria' ? 'Portaria inteligente e integrada.' : currentRole() === 'sindico' ? 'Painel completo de gestão do síndico.' : 'Área do morador simples e segura.';
  if (heroText) heroText.textContent = currentRole() === 'portaria' ? 'Registre visitantes, fotos, encomendas e avise moradores rapidamente.' : currentRole() === 'sindico' ? 'Aprove cadastros, valide reservas, gere boletos demonstrativos e gerencie o calendário.' : 'Solicite reservas, acompanhe comunicados e veja disponibilidade sem expor dados de outras unidades.';
  updateActiveSection();
}

function startSession(data) {
  session = data;
  write(keys.session, session);
  $('[data-login-screen]').hidden = true;
  $('[data-app]').hidden = false;
  applyPermissions();
  renderAll();
  location.hash = location.hash || '#dashboard';
}
function endSession() {
  session = null;
  remove(keys.session);
  $('[data-login-screen]').hidden = false;
  $('[data-app]').hidden = true;
  location.hash = '';
}

function authSetup() {
  const loginTab = $('[data-auth-tab="login"]');
  const signupTab = $('[data-auth-tab="signup"]');
  const loginForm = $('[data-login-form]');
  const signupForm = $('[data-signup-form]');
  const roleSelect = $('[data-login-role]');
  const googleLink = $('[data-google-login]');
  const unitWrap = $('[data-login-unit-wrap]');

  function setTab(tab) {
    const login = tab === 'login';
    loginTab.classList.toggle('is-active', login);
    signupTab.classList.toggle('is-active', !login);
    loginForm.classList.toggle('is-hidden', !login);
    signupForm.classList.toggle('is-hidden', login);
  }
  loginTab.addEventListener('click', () => setTab('login'));
  signupTab.addEventListener('click', () => setTab('signup'));

  function syncRoleUI() {
    const role = roleSelect.value;
    unitWrap.style.display = role === 'morador' ? 'grid' : 'none';
    googleLink.href = `/auth/google?role=${encodeURIComponent(role)}`;
  }
  roleSelect.addEventListener('change', syncRoleUI);
  syncRoleUI();

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(loginForm);
    const role = form.get('role');
    const name = form.get('name') || roles[role].label;
    const email = form.get('email') || '';
    const apartment = role === 'morador' ? form.get('apartment') : '';
    if (role === 'morador') {
      const approved = email
        ? (getResidents().find((resident) => resident.apartment === apartment && resident.email === email) || getResidents().find((resident) => resident.email === email))
        : approvedResidentByApartment(apartment);
      const payload = { role, name: approved?.name || name, email: approved?.email || email, apartment: approved?.apartment || apartment, residentId: approved?.id || null, demo: false };
      await createBackendSession(payload);
      startSession(payload);
      return;
    }
    const payload = { role, name, email, apartment: '', demo: false };
    await createBackendSession(payload);
    startSession(payload);
  });

  signupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(signupForm);
    const data = {
      id: uid('pending'),
      name: form.get('name').trim(),
      email: form.get('email').trim(),
      whatsapp: form.get('whatsapp').trim(),
      cpfCnpj: (form.get('cpfCnpj') || '').replace(/\D/g, ''),
      apartment: form.get('apartment'),
      residentType: form.get('residentType') || 'Morador',
      unitRented: Boolean(form.get('unitRented')),
      primaryBilling: false,
      status: 'pending',
      createdAt: nowISO(),
    };
    const pendings = getPendingResidents();
    const residents = getResidents();
    if (pendings.some((item) => item.apartment === data.apartment && item.email === data.email && item.status === 'pending')) {
      $('[data-signup-message]').textContent = 'Já existe uma solicitação pendente para este e-mail nesta unidade.';
      return;
    }
    if (residents.some((item) => item.apartment === data.apartment && item.email === data.email)) {
      $('[data-signup-message]').textContent = 'Este morador já consta como aprovado para a unidade.';
      return;
    }
    pendings.unshift(data);
    savePendingResidents(pendings);
    signupForm.reset();
    fillApartmentSelects();
    $('[data-signup-message]').textContent = backendAvailable ? 'Solicitação enviada e salva no banco. O síndico precisa aprovar o cadastro.' : 'Solicitação enviada. O síndico precisa aprovar o cadastro.';
    renderAll();
  });
}

function navigationSetup() {
  $$('[data-nav], [data-shortcut]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href') || `#${link.dataset.shortcut}`;
      if (!href.startsWith('#')) return;
      event.preventDefault();
      location.hash = href;
      closeMenu();
    });
  });
  window.addEventListener('hashchange', updateActiveSection);
  $('[data-menu-open]')?.addEventListener('click', openMenu);
  $('[data-sidebar-shadow]')?.addEventListener('click', closeMenu);
  $$('[data-logout]').forEach((btn) => btn.addEventListener('click', async () => { await destroyBackendSession(); endSession(); }));
  $('[data-reset-demo]')?.addEventListener('click', () => {
    if (!confirm('Limpar os dados locais deste navegador?')) return;
    Object.values(keys).forEach(remove);
    localStorage.removeItem(`${STORE_PREFIX}seeded`);
    seedDemo(true);
    fillApartmentSelects();
    fillSpaceSelects();
    renderAll();
  });
}
function openMenu() { $('[data-sidebar]')?.classList.add('is-open'); $('[data-sidebar-shadow]')?.classList.add('is-open'); document.body.classList.add('no-scroll'); }
function closeMenu() { $('[data-sidebar]')?.classList.remove('is-open'); $('[data-sidebar-shadow]')?.classList.remove('is-open'); document.body.classList.remove('no-scroll'); }
function updateActiveSection() {
  if (!session) return;
  let id = (location.hash || '#dashboard').replace('#', '');
  let section = document.getElementById(id);
  if (!section || !roleAllowed(section.dataset.roles)) {
    section = $$('[data-section]').find((sec) => roleAllowed(sec.dataset.roles));
    id = section?.id || 'dashboard';
    if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  }
  $$('[data-section]').forEach((sec) => sec.classList.toggle('is-active', sec.id === id));
  $$('[data-nav]').forEach((nav) => nav.classList.toggle('is-active', nav.getAttribute('href') === `#${id}`));
  const pageTitle = $('[data-page-title]');
  const navLabel = $(`[data-nav][href="#${id}"]`);
  if (pageTitle && navLabel) pageTitle.textContent = navLabel.textContent.trim();
  renderAll();
}

function setupCurrentDate() {
  const el = $('[data-current-date]');
  if (el) el.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

function residentsByApartment(apartment) { return getResidents().filter((resident) => resident.apartment === apartment); }
function approvedResidentByApartment(apartment) {
  const residents = residentsByApartment(apartment);
  return residents.find((resident) => resident.primaryBilling) || residents[0] || null;
}
function isApartmentRented(apartment) { return residentsByApartment(apartment).some((resident) => resident.unitRented); }
function canEditResident(resident) {
  if (!resident) return false;
  if (isSyndic()) return true;
  if (!isResident()) return false;
  if (resident.apartment !== session?.apartment) return false;
  return !session?.email || resident.email === session.email || resident.id === session.residentId;
}
function parseGuestList(value = '') {
  return String(value || '').split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((name) => ({ id: uid('guest'), name }));
}
function guestsText(guests = []) { return (guests || []).map((guest) => guest.name || guest).filter(Boolean).join('\n'); }
function bookingVisibleToCurrentUser(booking) {
  if (!isResident()) return true;
  return booking.apartment === session?.apartment;
}
function reservationConflict({ spaceId, date, period, ignoreId = '' }) {
  return getBookings().find((booking) => booking.id !== ignoreId && booking.spaceId === spaceId && booking.date === date && booking.period === period && !['canceled', 'rejected'].includes(booking.status));
}
function getSpace(spaceId) { return getSettings().spaces.find((space) => space.id === spaceId); }

function renderAll() {
  renderKpis();
  renderDashboard();
  renderPendingResidents();
  renderResidents();
  renderMyResident();
  renderBookings();
  renderCalendar();
  renderFinance();
  renderVisitors();
  renderPackages();
  renderNotices();
  renderStaff();
  renderContactCenter();
  renderServices();
  renderServiceRequests();
  renderSettings();
}

function renderKpis() {
  const bookings = getBookings();
  const today = todayISO();
  const packages = getPackages().filter((item) => item.status !== 'delivered');
  $('[data-kpi-today]') && ($('[data-kpi-today]').textContent = bookings.filter((item) => item.date === today && !['canceled', 'rejected'].includes(item.status)).length);
  $('[data-kpi-pending-residents]') && ($('[data-kpi-pending-residents]').textContent = getPendingResidents().filter((item) => item.status === 'pending').length);
  $('[data-kpi-pending-bookings]') && ($('[data-kpi-pending-bookings]').textContent = bookings.filter((item) => item.status === 'pending').length);
  $('[data-kpi-approved-bookings]') && ($('[data-kpi-approved-bookings]').textContent = bookings.filter((item) => item.status === 'approved' || item.status === 'paid').length);
  $('[data-kpi-packages]') && ($('[data-kpi-packages]').textContent = packages.length);
}

function empty(message = 'Nenhum registro encontrado.') { return `<div class="empty-state">${escapeHTML(message)}</div>`; }

function renderDashboard() {
  const bookingsBox = $('[data-dashboard-bookings]');
  const noticesBox = $('[data-dashboard-notices]');
  if (bookingsBox) {
    const list = getBookings().filter(bookingVisibleToCurrentUser).filter((item) => !['canceled', 'rejected'].includes(item.status)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    bookingsBox.innerHTML = list.length ? list.map(renderBookingItem).join('') : empty('Nenhuma reserva próxima.');
  }
  if (noticesBox) {
    const list = getNotices().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
    noticesBox.innerHTML = list.length ? list.map(renderNoticeItem).join('') : empty('Nenhum comunicado publicado.');
  }
}

function renderPendingResidents() {
  const box = $('[data-pending-residents]');
  if (!box) return;
  const list = getPendingResidents().filter((item) => item.status === 'pending').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  box.innerHTML = list.length ? list.map((item) => `
    <div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(item.name)} • Unidade ${escapeHTML(item.apartment)}</div>
          <div class="item-sub">${escapeHTML(item.email)} • ${escapeHTML(item.whatsapp)}${item.cpfCnpj ? ` • CPF/CNPJ: ${escapeHTML(item.cpfCnpj)}` : ''}<br>Vínculo: ${escapeHTML(item.residentType || 'Morador')} • ${item.unitRented ? 'Unidade alugada' : 'Unidade própria/não informada'} • Solicitado em ${formatDateTime(item.createdAt)}</div>
        </div>
        <span class="status status--pending">Pendente</span>
      </div>
      <div class="item-actions">
        <button class="btn btn--success btn--sm" data-approve-resident="${item.id}">Aprovar cadastro</button>
        <button class="btn btn--danger btn--sm" data-reject-resident="${item.id}">Recusar</button>
      </div>
    </div>`).join('') : empty('Não há cadastros pendentes.');
}

function renderResidents() {
  const box = $('[data-residents-list]');
  if (!box) return;
  const search = normalizeText($('[data-resident-search]')?.value || '');
  const all = getResidents().slice().sort((a, b) => a.apartment.localeCompare(b.apartment, 'pt-BR', { numeric: true }) || a.name.localeCompare(b.name, 'pt-BR'));
  const list = search ? all.filter((item) => normalizeText(`${item.name} ${item.email} ${item.whatsapp} ${item.apartment} ${item.cpfCnpj || ''} ${item.residentType || ''} ${item.unitRented ? 'alugada' : ''} ${item.primaryBilling ? 'principal boleto' : ''}`).includes(search)) : all;
  const grouped = list.reduce((acc, resident) => {
    if (!acc[resident.apartment]) acc[resident.apartment] = [];
    acc[resident.apartment].push(resident);
    return acc;
  }, {});
  const apartmentsSorted = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  box.innerHTML = apartmentsSorted.length ? apartmentsSorted.map((apartment) => {
    const residents = grouped[apartment];
    const rented = residents.some((resident) => resident.unitRented);
    const primary = residents.find((resident) => resident.primaryBilling) || residents[0];
    return `<div class="unit-group">
      <div class="unit-group-head">
        <div><strong>Unidade ${escapeHTML(apartment)}</strong><span>${residents.length} morador(es) cadastrado(s) • Principal: ${escapeHTML(primary?.name || '-')}</span></div>
        <div class="item-meta"><span class="badge ${rented ? 'badge--pending' : 'badge--approved'}">${rented ? 'Unidade alugada' : 'Unidade própria/não alugada'}</span></div>
      </div>
      ${residents.map((resident) => `
        <div class="item resident-card">
          <div class="item-row">
            <div>
              <div class="item-title">${escapeHTML(resident.name)} ${resident.primaryBilling ? '<span class="badge badge--approved">Principal para boletos</span>' : ''}</div>
              <div class="item-sub">${escapeHTML(resident.email)} • ${escapeHTML(resident.whatsapp)}${resident.cpfCnpj ? ` • CPF/CNPJ: ${escapeHTML(resident.cpfCnpj)}` : ''}<br>Vínculo: ${escapeHTML(resident.residentType || 'Morador')}${resident.notes ? `<br>${escapeHTML(resident.notes)}` : ''}</div>
            </div>
            <span class="status status--approved">Aprovado</span>
          </div>
          <div class="item-actions">
            <button class="btn btn--outline btn--sm" data-edit-resident="${resident.id}">Editar</button>
            ${!resident.primaryBilling ? `<button class="btn btn--success btn--sm" data-primary-resident="${resident.id}">Definir como principal</button>` : ''}
            <button class="btn btn--outline btn--sm" data-toggle-rented="${resident.apartment}">${rented ? 'Marcar não alugada' : 'Marcar alugada'}</button>
            <button class="btn btn--success btn--sm" data-auto-resident-whatsapp="${resident.id}">Auto WhatsApp</button>
            <button class="btn btn--success btn--sm" data-auto-resident-email="${resident.id}">Auto e-mail</button>
            <a class="btn btn--outline btn--sm" href="${whatsAppLink(resident.whatsapp, `Olá, ${resident.name}. Mensagem do Condomínio Vitória Régia.`)}" target="_blank" rel="noopener">Manual WhatsApp</a>
            <a class="btn btn--outline btn--sm" href="mailto:${encodeURIComponent(resident.email)}?subject=${encodeURIComponent('Condomínio Vitória Régia')}">Manual e-mail</a>
            <button class="btn btn--danger btn--sm" data-remove-resident="${resident.id}">Remover</button>
          </div>
        </div>`).join('')}
    </div>`;
  }).join('') : empty('Nenhum morador aprovado encontrado.');
}

function setupResidents() {
  $('[data-resident-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const resident = {
      id: uid('resident'),
      name: data.get('name').trim(),
      email: data.get('email').trim(),
      whatsapp: data.get('whatsapp').trim(),
      cpfCnpj: (data.get('cpfCnpj') || '').replace(/\D/g, ''),
      apartment: data.get('apartment'),
      residentType: data.get('residentType') || 'Morador',
      primaryBilling: Boolean(data.get('primaryBilling')),
      unitRented: Boolean(data.get('unitRented')),
      notes: data.get('notes').trim(),
      status: 'approved',
      createdAt: nowISO(),
      approvedAt: nowISO(),
    };
    const residents = getResidents();
    if (residents.some((item) => item.apartment === resident.apartment && item.email === resident.email)) {
      $('[data-resident-message]').textContent = 'Este e-mail já está cadastrado para a unidade.';
      return;
    }
    residents.unshift(resident);
    saveResidents(residents);
    form.reset();
    fillApartmentSelects();
    $('[data-resident-message]').textContent = 'Morador aprovado e cadastrado. Se marcado como principal, ele receberá os boletos da unidade.';
    renderAll();
  });
  $('[data-resident-search]')?.addEventListener('input', renderResidents);
  $('[data-export-residents]')?.addEventListener('click', () => exportCSV('moradores-vitoria-regia.csv', getResidents()));
}

async function approveResident(id) {
  const pendings = getPendingResidents();
  const pending = pendings.find((item) => item.id === id);
  if (!pending) return;
  const residents = getResidents();
  const hasPrimary = residents.some((item) => item.apartment === pending.apartment && item.primaryBilling);
  const approved = { ...pending, status: 'approved', approvedAt: nowISO(), primaryBilling: !hasPrimary, unitRented: Boolean(pending.unitRented), notes: 'Cadastro aprovado pelo síndico.' };
  residents.unshift(approved);
  saveResidents(residents);
  savePendingResidents(pendings.filter((item) => item.id !== id));
  renderAll();
  await maybeNotifyResident(approved, 'residentStatus', 'Cadastro aprovado — Condomínio Vitória Régia', `Olá, ${approved.name}. Seu cadastro da unidade ${approved.apartment} foi aprovado pelo síndico. Você já pode acessar o sistema.`);
}
async function rejectResident(id) {
  const pending = getPendingResidents().find((item) => item.id === id);
  savePendingResidents(getPendingResidents().map((item) => item.id === id ? { ...item, status: 'rejected', rejectedAt: nowISO() } : item));
  renderAll();
  if (pending) await maybeNotifyResident(pending, 'residentStatus', 'Cadastro recusado — Condomínio Vitória Régia', `Olá, ${pending.name}. Sua solicitação de cadastro da unidade ${pending.apartment} foi recusada pelo síndico. Entre em contato com a administração para mais informações.`);
}
function removeResident(id) {
  if (!confirm('Remover este morador aprovado?')) return;
  saveResidents(getResidents().filter((item) => item.id !== id));
  renderAll();
}

function updateResidentById(id, patch) {
  let updated = null;
  const residents = getResidents().map((resident) => {
    if (resident.id !== id) return resident;
    updated = { ...resident, ...patch, updatedAt: nowISO() };
    return updated;
  });
  saveResidents(residents);
  return updated;
}
function setPrimaryResident(id) {
  const target = getResidents().find((resident) => resident.id === id);
  if (!target) return;
  saveResidents(getResidents().map((resident) => resident.apartment === target.apartment ? { ...resident, primaryBilling: resident.id === id } : resident));
  renderAll();
}
function toggleApartmentRented(apartment) {
  const rented = !isApartmentRented(apartment);
  saveResidents(getResidents().map((resident) => resident.apartment === apartment ? { ...resident, unitRented: rented } : resident));
  renderAll();
}
function editResident(id) {
  const resident = getResidents().find((item) => item.id === id);
  if (!resident || !canEditResident(resident)) { alert('Você não tem permissão para alterar este cadastro.'); return; }
  const name = prompt('Nome do morador:', resident.name) ?? resident.name;
  const email = prompt('E-mail:', resident.email) ?? resident.email;
  const whatsapp = prompt('WhatsApp:', resident.whatsapp) ?? resident.whatsapp;
  const cpfCnpj = prompt('CPF/CNPJ do responsável:', resident.cpfCnpj || '') ?? resident.cpfCnpj;
  const residentType = prompt('Vínculo (Proprietário, Inquilino, Familiar, Responsável financeiro, Outro morador):', resident.residentType || 'Morador') ?? resident.residentType;
  const notes = prompt('Observações:', resident.notes || '') ?? resident.notes;
  updateResidentById(id, { name: name.trim(), email: email.trim(), whatsapp: whatsapp.trim(), cpfCnpj: String(cpfCnpj || '').replace(/\D/g, ''), residentType, notes });
  renderAll();
}
function currentResidentRecord() {
  if (!session?.apartment) return null;
  return getResidents().find((resident) => resident.id === session.residentId)
    || (session.email ? getResidents().find((resident) => resident.apartment === session.apartment && resident.email === session.email) : null)
    || approvedResidentByApartment(session.apartment);
}
function renderMyResident() {
  const form = $('[data-my-resident-form]');
  const listBox = $('[data-my-unit-residents]');
  if (!form && !listBox) return;
  const resident = currentResidentRecord();
  const unitResidents = session?.apartment ? residentsByApartment(session.apartment) : [];
  if (form) {
    if (!resident) {
      form.classList.add('is-disabled');
      $('[data-my-resident-message]') && ($('[data-my-resident-message]').textContent = 'Nenhum cadastro aprovado encontrado para sua sessão. Solicite aprovação ao síndico.');
    } else if (document.activeElement?.form !== form) {
      form.classList.remove('is-disabled');
      form.elements.id.value = resident.id || '';
      form.elements.apartment.value = resident.apartment || session.apartment || '';
      form.elements.name.value = resident.name || '';
      form.elements.email.value = resident.email || '';
      form.elements.whatsapp.value = resident.whatsapp || '';
      form.elements.cpfCnpj.value = resident.cpfCnpj || '';
      form.elements.residentType.value = resident.residentType || 'Morador';
      form.elements.primaryBilling.checked = Boolean(resident.primaryBilling);
      form.elements.unitRented.checked = Boolean(resident.unitRented);
      form.elements.notes.value = resident.notes || '';
    }
  }
  if (listBox) {
    listBox.innerHTML = unitResidents.length ? unitResidents.map((item) => `<div class="item resident-card">
      <div class="item-row"><div><div class="item-title">${escapeHTML(item.name)} ${item.primaryBilling ? '<span class="badge badge--approved">Principal boletos</span>' : ''}</div><div class="item-sub">${escapeHTML(item.email)} • ${escapeHTML(item.whatsapp)}<br>Vínculo: ${escapeHTML(item.residentType || 'Morador')} • ${item.unitRented ? 'Unidade alugada' : 'Unidade não marcada como alugada'}</div></div><span class="status status--approved">Aprovado</span></div>
    </div>`).join('') : empty('Nenhum morador aprovado nesta unidade.');
  }
}
function setupMyResident() {
  const form = $('[data-my-resident-form]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const id = data.get('id');
    const current = getResidents().find((resident) => resident.id === id);
    if (!current || !canEditResident(current)) { $('[data-my-resident-message]').textContent = 'Você não tem permissão para alterar este cadastro.'; return; }
    const patch = {
      name: data.get('name').trim(),
      email: data.get('email').trim(),
      whatsapp: data.get('whatsapp').trim(),
      cpfCnpj: (data.get('cpfCnpj') || '').replace(/\D/g, ''),
      residentType: data.get('residentType') || 'Morador',
      primaryBilling: Boolean(data.get('primaryBilling')),
      unitRented: Boolean(data.get('unitRented')),
      notes: data.get('notes').trim(),
    };
    updateResidentById(id, patch);
    if (patch.primaryBilling) setPrimaryResident(id);
    if (session?.residentId === id || session?.email === current.email) {
      session = { ...session, name: patch.name, email: patch.email, apartment: current.apartment, residentId: id };
      write(keys.session, session);
      applyPermissions();
    }
    $('[data-my-resident-message]').textContent = 'Cadastro atualizado e sincronizado com o banco.';
    renderAll();
  });
}

function setupBookings() {
  const form = $('[data-booking-form]');
  const spaceSelect = $('[data-space-select]');
  const aptSelect = $('[data-booking-apartment]');
  spaceSelect?.addEventListener('change', updateBookingFee);
  aptSelect?.addEventListener('change', updateBookingFee);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const space = getSpace(data.get('space'));
    const apartment = isResident() ? session.apartment : data.get('apartment');
    const resident = approvedResidentByApartment(apartment) || {};
    const conflict = reservationConflict({ spaceId: space.id, date: data.get('date'), period: data.get('period') });
    if (conflict) {
      $('[data-booking-message]').textContent = 'Esta data e período já estão bloqueados para o espaço selecionado.';
      return;
    }
    const residentDocument = await fileMeta(data.get('residentDocument'));
    const guests = parseGuestList(data.get('guestList'));
    const guestCount = Number(data.get('guestCount') || guests.length || 0);
    const booking = {
      id: uid('booking'),
      spaceId: space.id,
      spaceName: space.name,
      date: data.get('date'),
      period: data.get('period'),
      apartment,
      residentName: resident.name || session?.name || 'Morador',
      residentEmail: resident.email || session?.email || '',
      residentWhatsapp: resident.whatsapp || '',
      residentCpfCnpj: resident.cpfCnpj || '',
      fee: Number(space.fee || 0),
      notes: data.get('notes').trim(),
      eventResponsible: (data.get('eventResponsible') || resident.name || session?.name || '').trim(),
      guestCount,
      guests,
      guestListText: guestsText(guests),
      status: 'pending',
      signed: Boolean(data.get('signature')),
      signedAt: nowISO(),
      signatureText: getSettings().bookingTerms,
      residentDocument,
      managerDocument: null,
      boleto: null,
      createdAt: nowISO(),
    };
    const bookings = getBookings();
    bookings.unshift(booking);
    saveBookings(bookings);
    form.reset();
    fillApartmentSelects();
    fillSpaceSelects();
    $('[data-booking-message]').textContent = 'Reserva pré-agendada. A data foi bloqueada e aguarda validação do síndico.';
    renderAll();
  });
  $('[data-booking-filter]')?.addEventListener('change', renderBookings);
}
function updateBookingFee() {
  const select = $('[data-space-select]');
  const fee = $('[data-booking-fee]');
  if (!select || !fee) return;
  const space = getSpace(select.value) || getSettings().spaces[0];
  fee.value = money.format(Number(space?.fee || 0));
  if (isResident() && session?.apartment) {
    const apt = $('[data-booking-apartment]');
    if (apt) apt.value = session.apartment;
  }
}

function renderBookings() {
  const title = $('[data-booking-list-title]');
  if (title) title.textContent = isSyndic() ? 'Todas as reservas' : 'Minhas reservas';
  const box = $('[data-bookings-list]');
  if (!box) return;
  const filter = $('[data-booking-filter]')?.value || 'all';
  let list = getBookings().filter(bookingVisibleToCurrentUser).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (filter !== 'all') list = list.filter((item) => item.status === filter || (filter === 'approved' && item.status === 'paid'));
  box.innerHTML = list.length ? list.map(renderBookingItem).join('') : empty('Nenhuma reserva encontrada.');
  renderFinance();
}

function renderBookingItem(booking) {
  const syndicDetails = isSyndic() ? `<div class="item-sub"><b>Unidade:</b> ${escapeHTML(booking.apartment)} • <b>Morador:</b> ${escapeHTML(booking.residentName || '')} • ${escapeHTML(booking.residentEmail || '')}</div>` : '';
  const docLinks = [booking.residentDocument, booking.managerDocument].filter(Boolean).map((doc) => `<span class="badge">📎 ${escapeHTML(doc.name)}</span>`).join(' ');
  const guests = Array.isArray(booking.guests) ? booking.guests : parseGuestList(booking.guestListText || '');
  const guestBlock = guests.length || booking.guestCount || booking.eventResponsible ? `<div class="guest-box"><strong>Convidados/evento:</strong> ${booking.guestCount ? `${Number(booking.guestCount)} previsto(s)` : `${guests.length} informado(s)`}${booking.eventResponsible ? ` • Responsável: ${escapeHTML(booking.eventResponsible)}` : ''}${guests.length ? `<ol>${guests.map((guest) => `<li>${escapeHTML(guest.name || guest)}</li>`).join('')}</ol>` : ''}</div>` : '';
  const actions = isSyndic() ? `
    ${booking.status === 'pending' ? `<button class="btn btn--success btn--sm" data-approve-booking="${booking.id}">Validar</button>` : ''}
    <button class="btn btn--outline btn--sm" data-boleto-booking="${booking.id}">Gerar boleto Asaas</button>
    <label class="btn btn--outline btn--sm">Upload doc.<input type="file" hidden data-manager-doc="${booking.id}" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"></label>
    <button class="btn btn--outline btn--sm" data-edit-booking="${booking.id}">Modificar</button>
    <button class="btn btn--danger btn--sm" data-cancel-booking="${booking.id}">Cancelar</button>
  ` : `
    ${booking.boleto ? `<button class="btn btn--outline btn--sm" data-boleto-booking="${booking.id}">Ver boleto</button>` : ''}
    <a class="btn btn--outline btn--sm" href="mailto:${encodeURIComponent(booking.residentEmail || '')}?subject=${encodeURIComponent('Reserva Vitória Régia')}">E-mail</a>
  `;
  return `
    <div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(booking.spaceName)} • ${formatDate(booking.date)} • ${escapeHTML(booking.period)}</div>
          <div class="item-sub">Taxa: ${money.format(Number(booking.fee || 0))} • Assinatura digital: ${booking.signed ? `sim, em ${formatDateTime(booking.signedAt)}` : 'não'}</div>
          ${syndicDetails}
          ${booking.notes ? `<div class="item-sub">${escapeHTML(booking.notes)}</div>` : ''}
          ${guestBlock}
          ${docLinks ? `<div class="item-meta">${docLinks}</div>` : ''}
        </div>
        <span class="status status--${statusClass(booking.status)}">${statusLabel(booking.status)}</span>
      </div>
      <div class="item-actions">${actions}</div>
    </div>`;
}

async function approveBooking(id) {
  let updated = null;
  saveBookings(getBookings().map((booking) => {
    if (booking.id !== id) return booking;
    updated = { ...booking, status: 'approved', approvedAt: nowISO() };
    return updated;
  }));
  renderAll();
  if (updated) {
    try {
      if (await shouldUseAsaas()) {
        await generateAsaasBoletoForBooking(updated.id, { silent: true });
        updated = getBookings().find((item) => item.id === id) || updated;
      }
    } catch (error) {
      alert(`Reserva validada, mas o boleto Asaas não foi gerado automaticamente: ${error.message}`);
    }
    await maybeNotifyResident({ email: updated.residentEmail, whatsapp: updated.residentWhatsapp, name: updated.residentName }, 'bookingStatus', 'Reserva validada — Condomínio Vitória Régia', `Olá, ${updated.residentName}. Sua reserva de ${updated.spaceName} para ${formatDate(updated.date)} (${updated.period}) foi validada pelo síndico.${updated.boleto?.invoiceUrl ? ` Boleto: ${updated.boleto.invoiceUrl}` : ''}`);
  }
}
async function cancelBooking(id) {
  const reason = prompt('Motivo do cancelamento:', 'Cancelado pelo síndico');
  if (reason === null) return;
  let updated = null;
  saveBookings(getBookings().map((booking) => {
    if (booking.id !== id) return booking;
    updated = { ...booking, status: 'canceled', canceledAt: nowISO(), cancelReason: reason };
    return updated;
  }));
  renderAll();
  if (updated) await maybeNotifyResident({ email: updated.residentEmail, whatsapp: updated.residentWhatsapp, name: updated.residentName }, 'bookingStatus', 'Reserva cancelada — Condomínio Vitória Régia', `Olá, ${updated.residentName}. Sua reserva de ${updated.spaceName} para ${formatDate(updated.date)} (${updated.period}) foi cancelada. Motivo: ${reason}`);
}
function editBooking(id) {
  const booking = getBookings().find((item) => item.id === id);
  if (!booking) return;
  const newDate = prompt('Nova data da reserva (AAAA-MM-DD):', booking.date);
  if (!newDate) return;
  const newPeriod = prompt('Novo período (Manhã, Tarde, Noite ou Integral):', booking.period) || booking.period;
  const conflict = reservationConflict({ spaceId: booking.spaceId, date: newDate, period: newPeriod, ignoreId: id });
  if (conflict) { alert('A nova data/período já está bloqueada.'); return; }
  saveBookings(getBookings().map((item) => item.id === id ? { ...item, date: newDate, period: newPeriod, modifiedAt: nowISO() } : item));
  renderAll();
}
async function uploadManagerDocument(id, file) {
  const managerDocument = await fileMeta(file);
  saveBookings(getBookings().map((booking) => booking.id === id ? { ...booking, managerDocument } : booking));
  renderAll();
}

function renderCalendar() {
  const calendar = $('[data-calendar]');
  if (!calendar) return;
  const title = $('[data-calendar-title]');
  const month = calendarDate.getMonth();
  const year = calendarDate.getFullYear();
  title.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarDate);
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  const spaceFilter = $('[data-calendar-space]')?.value || 'all';
  const periodFilter = $('[data-calendar-period]')?.value || 'all';
  const bookings = getBookings().filter((booking) => !['canceled', 'rejected'].includes(booking.status))
    .filter((booking) => spaceFilter === 'all' || booking.spaceId === spaceFilter)
    .filter((booking) => periodFilter === 'all' || booking.period === periodFilter);
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => `<div class="weekday">${day}</div>`).join('');
  const cells = days.map((day) => {
    const iso = toISODate(day);
    const dayBookings = bookings.filter((booking) => booking.date === iso);
    const statusHTML = dayBookings.length ? dayBookings.map((booking) => {
      const label = isSyndic() ? `${statusLabel(booking.status)} • ${booking.spaceName} • Apto ${booking.apartment}` : `${booking.status === 'pending' ? 'Pré-agendado' : 'Ocupado'} • ${booking.spaceName}`;
      return `<div class="day-status day-status--${booking.status === 'pending' ? 'pending' : 'approved'}" title="${escapeHTML(label)}">${escapeHTML(label)}</div>`;
    }).join('') : `<div class="day-status day-status--free">Disponível</div>`;
    return `<div class="day ${day.getMonth() !== month ? 'is-muted' : ''}"><div class="day-number"><span>${day.getDate()}</span></div>${statusHTML}</div>`;
  }).join('');
  calendar.innerHTML = `<div class="calendar-grid">${weekdays}${cells}</div>`;
}
function setupCalendar() {
  $('[data-cal-prev]')?.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
  $('[data-cal-next]')?.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
  $('[data-calendar-space]')?.addEventListener('change', renderCalendar);
  $('[data-calendar-period]')?.addEventListener('change', renderCalendar);
}

function generateBoleto(booking) {
  const due = new Date(`${booking.date}T12:00:00`);
  due.setDate(due.getDate() - 2);
  const line = `34191.79001 ${String(Math.floor(Math.random() * 90000 + 10000))}.000000 ${String(Math.floor(Math.random() * 90000 + 10000))}.000000 ${String(Math.floor(Math.random() * 9))} ${String(Math.floor(Math.random() * 90000000000000 + 10000000000000))}`;
  return {
    generatedAt: nowISO(),
    dueDate: toISODate(due),
    amount: Number(booking.fee || 0),
    line,
    note: 'Cobrança interna da reserva. Para boleto bancário registrado, integrar banco ou provedor de pagamentos.',
  };
}
function renderFinance() {
  const box = $('[data-finance-list]');
  if (!box) return;
  const list = getBookings().filter(bookingVisibleToCurrentUser).filter((booking) => !['canceled', 'rejected'].includes(booking.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  box.innerHTML = list.length ? list.map((booking) => `
    <div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(booking.spaceName)} • ${formatDate(booking.date)} • ${escapeHTML(booking.period)}</div>
          <div class="item-sub">Unidade ${escapeHTML(booking.apartment)} • ${money.format(Number(booking.fee || 0))}</div>
        </div>
        <span class="status status--${statusClass(booking.status)}">${statusLabel(booking.status)}</span>
      </div>
      <div class="item-actions">
        ${isSyndic() || booking.boleto ? `<button class="btn btn--outline btn--sm" data-boleto-booking="${booking.id}">${booking.boleto?.provider === 'asaas' ? 'Ver boleto Asaas' : 'Gerar boleto Asaas'}</button>` : `<span class="badge">Aguardando boleto do síndico</span>`}
        ${isSyndic() ? `<button class="btn btn--success btn--sm" data-mark-paid="${booking.id}">Marcar pago</button>` : ''}
      </div>
    </div>`).join('') : empty('Nenhuma cobrança de reserva.');
  if (currentBoletoBookingId) renderBoletoPreview(currentBoletoBookingId);
}
async function shouldUseAsaas() {
  if (!backendAvailable || !isSyndic()) return false;
  if (!asaasConfig) await loadAsaasConfig();
  return Boolean(asaasConfig?.enabled && asaasConfig?.apiKeySaved);
}

async function generateAsaasBoletoForBooking(id, options = {}) {
  const preview = $('[data-boleto-preview]');
  const residentPrompt = options.promptCpf !== false;
  let bookings = getBookings();
  let booking = bookings.find((item) => item.id === id);
  if (!booking) throw new Error('Reserva não encontrada.');
  if (!await shouldUseAsaas()) {
    throw new Error('Asaas não está ativo ou API Key não foi salva no backend/Render.');
  }
  if (preview && !options.silent) preview.innerHTML = '<div class="empty-state">Gerando boleto bancário registrado no Asaas...</div>';
  const resident = approvedResidentByApartment(booking.apartment) || {};
  let cpfCnpj = resident.cpfCnpj || booking.residentCpfCnpj || '';
  if (!cpfCnpj && residentPrompt) cpfCnpj = prompt('Informe CPF/CNPJ do responsável para gerar o boleto Asaas:') || '';
  if (!cpfCnpj) throw new Error('CPF/CNPJ é obrigatório para gerar boleto Asaas. Cadastre o CPF/CNPJ do morador ou informe no momento da geração.');
  const response = await apiRequest(`/api/asaas/payments/booking/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ cpfCnpj }),
  });
  booking = response.booking || booking;
  bookings = getBookings().map((item) => item.id === id ? booking : item);
  saveBookings(bookings);
  return booking;
}

async function renderBoletoPreview(id) {
  const preview = $('[data-boleto-preview]');
  if (!preview) return;
  let bookings = getBookings();
  let booking = bookings.find((item) => item.id === id);
  if (!booking) return;
  currentBoletoBookingId = id;

  const boletoIsRealAsaas = booking.boleto?.provider === 'asaas' && booking.boleto?.paymentId;
  if (!boletoIsRealAsaas && backendAvailable && isSyndic()) {
    try {
      booking = await generateAsaasBoletoForBooking(id);
      bookings = getBookings();
    } catch (error) {
      preview.innerHTML = `<div class="empty-state">Não foi possível gerar boleto bancário real no Asaas: ${escapeHTML(error.message)}<br><br>Verifique em Configurações se o Asaas está ativado, com ambiente correto, API Key salva e CPF/CNPJ do morador.</div>`;
      return;
    }
  }

  if (!booking.boleto) {
    preview.innerHTML = '<div class="empty-state">Boleto ainda não gerado. O síndico precisa gerar pelo Asaas.</div>';
    return;
  }

  const settings = getSettings();
  const boleto = booking.boleto || {};
  const isAsaas = boleto.provider === 'asaas';
  const links = isAsaas ? `
    <div class="item-actions boleto-actions">
      ${boleto.bankSlipUrl ? `<a class="btn btn--primary btn--sm" href="${escapeHTML(boleto.bankSlipUrl)}" target="_blank" rel="noopener">Abrir PDF do boleto</a>` : ''}
      ${boleto.invoiceUrl ? `<a class="btn btn--outline btn--sm" href="${escapeHTML(boleto.invoiceUrl)}" target="_blank" rel="noopener">Abrir fatura Asaas</a>` : ''}
    </div>` : '';

  preview.innerHTML = `
    <div class="boleto">
      <div class="boleto-head"><strong>${escapeHTML(settings.condominiumName)}</strong><span>${isAsaas ? 'Boleto Asaas de Reserva' : 'Documento interno — não é boleto bancário'}</span></div>
      <div class="boleto-grid">
        <div class="boleto-cell"><small>Beneficiário</small><strong>${escapeHTML(settings.payee).replaceAll('\n', '<br>')}</strong></div>
        <div class="boleto-cell"><small>Pagador</small><strong>Unidade ${escapeHTML(booking.apartment)}<br>${escapeHTML(booking.residentName || '')}</strong></div>
        <div class="boleto-cell"><small>Valor</small><strong>${money.format(Number(boleto.amount || 0))}</strong></div>
        <div class="boleto-cell"><small>Espaço</small><strong>${escapeHTML(booking.spaceName)}</strong></div>
        <div class="boleto-cell"><small>Data / período</small><strong>${formatDate(booking.date)}<br>${escapeHTML(booking.period)}</strong></div>
        <div class="boleto-cell"><small>Vencimento</small><strong>${formatDate(boleto.dueDate)}</strong></div>
        ${isAsaas ? `<div class="boleto-cell"><small>Status Asaas</small><strong>${escapeHTML(boleto.status || 'PENDING')}</strong></div>` : ''}
      </div>
      <div class="boleto-line">${escapeHTML(boleto.line || '')}</div>
      ${links}
      <p class="boleto-warning">${escapeHTML(boleto.note || (isAsaas ? '' : 'Este documento não é boleto bancário registrado. Gere pelo Asaas para cobrança real.'))}</p>
      <p><strong>Assinatura digital:</strong> ${booking.signed ? `assinado pelo morador em ${formatDateTime(booking.signedAt)} com a declaração “Assino e dou fé”.` : 'pendente.'}</p>
    </div>`;
}

async function markPaid(id) {
  let updated = null;
  saveBookings(getBookings().map((booking) => {
    if (booking.id !== id) return booking;
    updated = { ...booking, status: 'paid', paidAt: nowISO() };
    return updated;
  }));
  renderAll();
  if (updated) await maybeNotifyResident({ email: updated.residentEmail, whatsapp: updated.residentWhatsapp, name: updated.residentName }, 'bookingStatus', 'Pagamento confirmado — Condomínio Vitória Régia', `Olá, ${updated.residentName}. O pagamento da reserva de ${updated.spaceName} para ${formatDate(updated.date)} foi registrado no sistema.`);
}

function setupVisitors() {
  const photoInput = $('[data-visitor-photo]');
  photoInput?.addEventListener('change', async () => {
    currentVisitorPhoto = await fileToDataURL(photoInput.files?.[0]);
    renderPhotoPreview();
  });
  $('[data-visitor-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const visitor = {
      id: uid('visitor'), name: data.get('name').trim(), document: data.get('document').trim(), phone: data.get('phone').trim(),
      apartment: data.get('apartment'), type: data.get('type'), notes: data.get('notes').trim(), photo: currentVisitorPhoto, createdAt: nowISO(),
    };
    saveVisitors([visitor, ...getVisitors()]);
    const resident = approvedResidentByApartment(visitor.apartment);
    $('[data-visitor-message]').innerHTML = resident ? `Visitante salvo. <a class="text-link" target="_blank" href="${whatsAppLink(resident.whatsapp, visitorMessage(visitor, resident))}">Abrir WhatsApp manual</a>` : 'Visitante salvo. Morador da unidade não encontrado.';
    currentVisitorPhoto = '';
    form.reset(); fillApartmentSelects(); renderPhotoPreview(); renderAll();
    if (resident) maybeNotifyResident(resident, 'visitor', 'Visitante registrado — Condomínio Vitória Régia', visitorMessage(visitor, resident)).then((response) => {
      if (response) $('[data-visitor-message]').textContent = `Visitante salvo. Notificação automática: ${resultSummary(response)}`;
    });
  });
  $('[data-visitor-search]')?.addEventListener('input', renderVisitors);
}
function renderPhotoPreview() {
  const box = $('[data-visitor-photo-preview]');
  if (!box) return;
  box.innerHTML = currentVisitorPhoto ? `<img src="${currentVisitorPhoto}" alt="Foto do visitante">` : '<span>Foto</span>';
}
function renderVisitors() {
  const box = $('[data-visitors-list]');
  if (!box) return;
  const search = normalizeText($('[data-visitor-search]')?.value || '');
  let list = getVisitors().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (search) list = list.filter((item) => normalizeText(`${item.name} ${item.apartment} ${item.document} ${item.type}`).includes(search));
  box.innerHTML = list.length ? list.map((visitor) => {
    const resident = approvedResidentByApartment(visitor.apartment);
    return `<div class="item">
      <div class="item-row">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${visitor.photo ? `<img class="visitor-avatar" src="${visitor.photo}" alt="Foto de ${escapeHTML(visitor.name)}">` : `<div class="visitor-avatar">${escapeHTML(visitor.name.charAt(0) || 'V')}</div>`}
          <div><div class="item-title">${escapeHTML(visitor.name)} • Unidade ${escapeHTML(visitor.apartment)}</div><div class="item-sub">${escapeHTML(visitor.type)} • ${escapeHTML(visitor.document || 'sem documento')} • ${formatDateTime(visitor.createdAt)}${visitor.notes ? `<br>${escapeHTML(visitor.notes)}` : ''}</div></div>
        </div>
      </div>
      <div class="item-actions">
        ${resident ? `<button class="btn btn--success btn--sm" data-auto-visitor-whatsapp="${visitor.id}">Auto WhatsApp</button><button class="btn btn--success btn--sm" data-auto-visitor-email="${visitor.id}">Auto e-mail</button><a class="btn btn--outline btn--sm" href="${whatsAppLink(resident.whatsapp, visitorMessage(visitor, resident))}" target="_blank" rel="noopener">Manual WhatsApp</a><a class="btn btn--outline btn--sm" href="mailto:${encodeURIComponent(resident.email)}?subject=${encodeURIComponent('Visitante na portaria')}&body=${encodeURIComponent(visitorMessage(visitor, resident))}">Manual e-mail</a>` : ''}
        <button class="btn btn--danger btn--sm" data-remove-visitor="${visitor.id}">Remover</button>
      </div>
    </div>`;
  }).join('') : empty('Nenhum visitante registrado.');
}
function visitorMessage(visitor, resident) {
  return `Olá, ${resident.name}. O visitante ${visitor.name} foi registrado na portaria para a unidade ${visitor.apartment}. Tipo: ${visitor.type}. Data/hora: ${formatDateTime(visitor.createdAt)}.`;
}
function whatsAppLink(phone, text) {
  const number = cleanPhone(phone);
  return `https://wa.me/55${number}?text=${encodeURIComponent(text)}`;
}

function packageMessage(pkg) {
  return `Olá. Há uma encomenda na portaria para a unidade ${pkg.apartment}. Destinatário: ${pkg.recipient}. ${pkg.carrier ? `Transportadora: ${pkg.carrier}.` : ''} ${pkg.code ? `Código: ${pkg.code}.` : ''}`;
}

function setupPackages() {
  $('[data-package-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const pkg = { id: uid('package'), apartment: data.get('apartment'), recipient: data.get('recipient').trim(), carrier: data.get('carrier').trim(), code: data.get('code').trim(), notes: data.get('notes').trim(), status: 'open', createdAt: nowISO() };
    savePackages([pkg, ...getPackages()]);
    const resident = approvedResidentByApartment(pkg.apartment);
    const msg = packageMessage(pkg);
    $('[data-package-message]').textContent = 'Encomenda registrada.';
    form.reset(); fillApartmentSelects(); renderAll();
    if (resident) maybeNotifyResident(resident, 'package', 'Encomenda na portaria — Condomínio Vitória Régia', msg).then((response) => {
      if (response) $('[data-package-message]').textContent = `Encomenda registrada. Notificação automática: ${resultSummary(response)}`;
    });
  });
}
function renderPackages() {
  const box = $('[data-packages-list]');
  if (!box) return;
  const list = getPackages().filter((item) => item.status !== 'delivered').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  box.innerHTML = list.length ? list.map((pkg) => {
    const resident = approvedResidentByApartment(pkg.apartment);
    const msg = packageMessage(pkg);
    return `<div class="item">
      <div class="item-row"><div><div class="item-title">Unidade ${escapeHTML(pkg.apartment)} • ${escapeHTML(pkg.recipient)}</div><div class="item-sub">${escapeHTML(pkg.carrier || 'Transportadora não informada')} • ${escapeHTML(pkg.code || 'sem código')} • ${formatDateTime(pkg.createdAt)}</div></div><span class="status status--pending">Aguardando retirada</span></div>
      <div class="item-actions">${resident ? `<button class="btn btn--success btn--sm" data-auto-package-whatsapp="${pkg.id}">Auto WhatsApp</button><button class="btn btn--success btn--sm" data-auto-package-email="${pkg.id}">Auto e-mail</button><a class="btn btn--outline btn--sm" target="_blank" href="${whatsAppLink(resident.whatsapp, msg)}">Manual WhatsApp</a><a class="btn btn--outline btn--sm" href="mailto:${encodeURIComponent(resident.email)}?subject=${encodeURIComponent('Encomenda na portaria')}&body=${encodeURIComponent(msg)}">Manual e-mail</a>` : ''}<button class="btn btn--success btn--sm" data-deliver-package="${pkg.id}">Marcar retirada</button></div>
    </div>`;
  }).join('') : empty('Nenhuma encomenda pendente.');
}
function deliverPackage(id) {
  savePackages(getPackages().map((item) => item.id === id ? { ...item, status: 'delivered', deliveredAt: nowISO() } : item));
  renderAll();
}

function setupNotices() {
  $('[data-notice-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const notice = { id: uid('notice'), title: data.get('title').trim(), category: data.get('category'), message: data.get('message').trim(), createdAt: nowISO() };
    saveNotices([notice, ...getNotices()]);
    form.reset(); renderAll();
  });
}
function renderNotices() {
  const box = $('[data-notices-list]');
  if (!box) return;
  const list = getNotices().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  box.innerHTML = list.length ? list.map(renderNoticeItem).join('') : empty('Nenhum comunicado publicado.');
}
function renderNoticeItem(notice) {
  return `<div class="item"><div class="item-row"><div><div class="item-title">${escapeHTML(notice.title)}</div><div class="item-sub">${escapeHTML(notice.category)} • ${formatDateTime(notice.createdAt)}</div></div>${isSyndic() ? `<button class="btn btn--danger btn--sm" data-remove-notice="${notice.id}">Remover</button>` : ''}</div><p class="item-sub">${escapeHTML(notice.message)}</p></div>`;
}


function roleLabel(role) {
  return { sindico: 'Síndico', subsindico: 'Subsíndico', porteiro: 'Porteiro' }[role] || role || '-';
}
function activeStaffFor(target) {
  const staff = getStaff().filter((item) => item.active !== false);
  if (target === 'sindico') return staff.filter((item) => ['sindico', 'subsindico'].includes(item.role));
  if (target === 'portaria') return staff.filter((item) => item.role === 'porteiro');
  return staff;
}
function primaryStaff(role = 'sindico') {
  const list = activeStaffFor(role);
  return list[0] || null;
}
function setupStaff() {
  const form = $('[data-staff-form]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isSyndic()) return;
    const data = new FormData(form);
    const item = {
      id: uid('staff'),
      name: data.get('name').trim(),
      role: data.get('role'),
      email: data.get('email').trim(),
      whatsapp: data.get('whatsapp').trim(),
      active: Boolean(data.get('active')),
      notes: data.get('notes').trim(),
      createdAt: nowISO(),
    };
    saveStaff([item, ...getStaff()]);
    form.reset();
    form.active.checked = true;
    $('[data-staff-message]').textContent = 'Cadastro de equipe salvo. Apenas o síndico pode alterar estes dados.';
    renderAll();
  });
}
function renderStaff() {
  const box = $('[data-staff-list]');
  if (!box) return;
  const staff = getStaff().sort((a, b) => String(a.role).localeCompare(String(b.role)) || String(a.name).localeCompare(String(b.name)));
  box.innerHTML = staff.length ? staff.map((item) => `
    <div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(item.name)} <span class="badge">${escapeHTML(roleLabel(item.role))}</span> ${item.active === false ? '<span class="badge badge--danger">Inativo</span>' : '<span class="badge badge--approved">Ativo</span>'}</div>
          <div class="item-sub">E-mail: ${escapeHTML(item.email || 'não informado')} • WhatsApp: ${escapeHTML(item.whatsapp || 'não informado')}</div>
          ${item.notes ? `<div class="item-sub">${escapeHTML(item.notes)}</div>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn--outline btn--sm" data-edit-staff="${item.id}">Editar</button>
        <button class="btn btn--danger btn--sm" data-remove-staff="${item.id}">Remover</button>
      </div>
    </div>`).join('') : empty('Nenhum síndico, subsíndico ou porteiro cadastrado.');
}
function editStaff(id) {
  if (!isSyndic()) return;
  const item = getStaff().find((staff) => staff.id === id);
  if (!item) return;
  const name = prompt('Nome:', item.name) ?? item.name;
  const role = prompt('Perfil (sindico, subsindico ou porteiro):', item.role) ?? item.role;
  const email = prompt('E-mail:', item.email || '') ?? item.email;
  const whatsapp = prompt('WhatsApp:', item.whatsapp || '') ?? item.whatsapp;
  const notes = prompt('Observações:', item.notes || '') ?? item.notes;
  const active = confirm('Manter este cadastro ativo? Clique em Cancelar para inativar.');
  saveStaff(getStaff().map((staff) => staff.id === id ? { ...staff, name: name.trim(), role: String(role || item.role).trim(), email: String(email || '').trim(), whatsapp: String(whatsapp || '').trim(), notes: String(notes || '').trim(), active, updatedAt: nowISO() } : staff));
  renderAll();
}
function removeStaff(id) {
  if (!isSyndic()) return;
  if (!confirm('Remover este cadastro de equipe?')) return;
  saveStaff(getStaff().filter((item) => item.id !== id));
  renderAll();
}

function setupContactCenter() {
  const form = $('[data-contact-form]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const target = data.get('target');
    const channel = data.get('channel');
    const recipients = activeStaffFor(target);
    if (!recipients.length) { $('[data-contact-message]').textContent = 'Nenhum destinatário ativo cadastrado para este setor.'; return; }
    const resident = currentResidentRecord() || {};
    const subject = `Contato do morador — unidade ${session?.apartment || resident.apartment || '-'}`;
    const message = `Mensagem enviada pelo sistema Vitória Régia\n\nOrigem: ${session?.name || resident.name || 'Morador'}\nUnidade: ${session?.apartment || resident.apartment || '-'}\nAssunto: ${data.get('subject')}\n\nMensagem:\n${data.get('message')}\n\nObservação: o contato do destinatário não foi revelado ao morador.`;
    const record = { id: uid('contact'), target, channel, subject: data.get('subject').trim(), message: data.get('message').trim(), apartment: session?.apartment || resident.apartment || '', residentName: session?.name || resident.name || '', status: 'pending', recipients: recipients.map((r) => ({ id: r.id, name: r.name, role: r.role })), createdAt: nowISO() };
    saveContactMessages([record, ...getContactMessages()]);
    let sent = [];
    if (backendAvailable) {
      for (const recipient of recipients) {
        try {
          const response = await sendBackendNotification({ email: recipient.email, whatsapp: recipient.whatsapp, subject, message, channels: [channel] });
          sent.push(`${recipient.name}: ${resultSummary(response)}`);
        } catch (error) {
          sent.push(`${recipient.name}: erro ${error.message}`);
        }
      }
    }
    const newStatus = sent.length ? 'sent' : 'saved';
    saveContactMessages(getContactMessages().map((item) => item.id === record.id ? { ...item, status: newStatus, delivery: sent, sentAt: sent.length ? nowISO() : null } : item));
    $('[data-contact-message]').textContent = sent.length ? `Mensagem enviada sem revelar contatos: ${sent.join(' | ')}` : 'Mensagem registrada. Para envio automático, configure e-mail/WhatsApp no backend.';
    form.reset();
    renderAll();
  });
}
function renderContactCenter() {
  const history = $('[data-contact-history]');
  if (!history) return;
  let list = getContactMessages().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (isResident()) list = list.filter((item) => item.apartment === session?.apartment);
  history.innerHTML = list.length ? list.slice(0, 30).map((item) => `
    <div class="item">
      <div class="item-row"><div><div class="item-title">${escapeHTML(item.subject)} <span class="badge">${item.target === 'portaria' ? 'Portaria' : 'Síndico/Subsíndico'}</span></div><div class="item-sub">Unidade ${escapeHTML(item.apartment || '-')} • ${formatDateTime(item.createdAt)} • canal: ${escapeHTML(item.channel || '-')}</div></div><span class="status status--${item.status === 'sent' ? 'approved' : 'pending'}">${item.status === 'sent' ? 'Enviada' : 'Registrada'}</span></div>
      <p class="item-sub">${escapeHTML(item.message)}</p>
    </div>`).join('') : empty('Nenhuma mensagem registrada.');
}

function setupServices() {
  const serviceForm = $('[data-service-form]');
  serviceForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isSyndic()) return;
    const data = new FormData(serviceForm);
    const service = { id: uid('service'), name: data.get('name').trim(), category: data.get('category').trim() || 'Serviço', price: Number(data.get('price') || 0), active: Boolean(data.get('active')), requiresApproval: Boolean(data.get('requiresApproval')), description: data.get('description').trim(), createdAt: nowISO() };
    saveServices([service, ...getServices()]);
    serviceForm.reset(); serviceForm.active.checked = true; serviceForm.requiresApproval.checked = true;
    $('[data-service-message]').textContent = 'Serviço cadastrado pelo síndico.';
    fillServiceSelects(); renderAll();
  });

  const requestForm = $('[data-service-request-form]');
  requestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(requestForm);
    const service = getServices().find((item) => item.id === data.get('serviceId'));
    if (!service) return;
    const resident = currentResidentRecord() || approvedResidentByApartment(session?.apartment) || {};
    const quantity = Math.max(1, Number(data.get('quantity') || 1));
    const request = { id: uid('service-request'), serviceId: service.id, serviceName: service.name, category: service.category, unitPrice: Number(service.price || 0), quantity, total: Number(service.price || 0) * quantity, apartment: isResident() ? session.apartment : data.get('apartment'), residentName: resident.name || session?.name || 'Morador', residentEmail: resident.email || session?.email || '', residentWhatsapp: resident.whatsapp || '', notes: data.get('notes').trim(), status: service.requiresApproval ? 'pending' : 'approved', createdAt: nowISO() };
    saveServiceRequests([request, ...getServiceRequests()]);
    requestForm.reset(); fillApartmentSelects(); fillServiceSelects();
    $('[data-service-request-message]').textContent = service.requiresApproval ? 'Solicitação enviada e aguardando aprovação do síndico.' : 'Solicitação registrada.';
    const staff = primaryStaff('sindico');
    if (staff && backendAvailable) {
      await notifyResidentEntity({ email: staff.email, whatsapp: staff.whatsapp, name: staff.name }, 'Nova solicitação de serviço — Vitória Régia', `Nova solicitação de ${request.serviceName}\nUnidade: ${request.apartment}\nMorador: ${request.residentName}\nQuantidade: ${quantity}\nTotal: ${money.format(request.total)}\nObservações: ${request.notes || '-'}`, ['email']);
    }
    renderAll();
  });
}
function fillServiceSelects() {
  const options = getServices().filter((item) => item.active !== false).map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} — ${money.format(Number(item.price || 0))}</option>`).join('');
  $$('[data-service-select]').forEach((select) => { select.innerHTML = options || '<option value="">Nenhum serviço ativo</option>'; });
}
function renderServices() {
  const listBox = $('[data-services-list]');
  if (listBox) {
    const services = getServices().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    listBox.innerHTML = services.length ? services.map((service) => `
      <div class="item"><div class="item-row"><div><div class="item-title">${escapeHTML(service.name)} <span class="badge">${escapeHTML(service.category || 'Serviço')}</span></div><div class="item-sub">Valor: ${money.format(Number(service.price || 0))} • ${service.active === false ? 'Inativo' : 'Ativo'} • ${service.requiresApproval ? 'exige aprovação' : 'aprovação automática'}</div>${service.description ? `<div class="item-sub">${escapeHTML(service.description)}</div>` : ''}</div><span class="status status--${service.active === false ? 'canceled' : 'approved'}">${service.active === false ? 'Inativo' : 'Ativo'}</span></div><div class="item-actions"><button class="btn btn--outline btn--sm" data-edit-service="${service.id}">Editar</button><button class="btn btn--danger btn--sm" data-remove-service="${service.id}">Remover</button></div></div>`).join('') : empty('Nenhum serviço cadastrado.');
  }
  fillServiceSelects();
}
function renderServiceRequests() {
  const box = $('[data-service-requests-list]');
  if (!box) return;
  let list = getServiceRequests().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (isResident()) list = list.filter((item) => item.apartment === session?.apartment);
  box.innerHTML = list.length ? list.map((req) => `
    <div class="item"><div class="item-row"><div><div class="item-title">${escapeHTML(req.serviceName)} • ${money.format(Number(req.total || 0))}</div><div class="item-sub">Unidade ${escapeHTML(req.apartment)} • ${escapeHTML(req.residentName || '')} • qtd. ${Number(req.quantity || 1)} • ${formatDateTime(req.createdAt)}</div>${req.notes ? `<div class="item-sub">${escapeHTML(req.notes)}</div>` : ''}</div><span class="status status--${statusClass(req.status)}">${statusLabel(req.status)}</span></div><div class="item-actions">${isSyndic() && req.status === 'pending' ? `<button class="btn btn--success btn--sm" data-approve-service-request="${req.id}">Aprovar</button>` : ''}${isSyndic() ? `<button class="btn btn--danger btn--sm" data-cancel-service-request="${req.id}">Cancelar</button>` : ''}</div></div>`).join('') : empty('Nenhuma solicitação de serviço encontrada.');
}
function editService(id) {
  if (!isSyndic()) return;
  const service = getServices().find((item) => item.id === id); if (!service) return;
  const name = prompt('Nome do serviço:', service.name) ?? service.name;
  const category = prompt('Categoria:', service.category || 'Serviço') ?? service.category;
  const price = Number(prompt('Valor:', String(service.price || 0)) ?? service.price);
  const description = prompt('Descrição:', service.description || '') ?? service.description;
  const active = confirm('Manter serviço ativo? Clique em Cancelar para inativar.');
  saveServices(getServices().map((item) => item.id === id ? { ...item, name: name.trim(), category: String(category || '').trim(), price, description: String(description || '').trim(), active, updatedAt: nowISO() } : item));
  fillServiceSelects(); renderAll();
}
function removeService(id) {
  if (!isSyndic()) return;
  if (!confirm('Remover este serviço?')) return;
  saveServices(getServices().filter((item) => item.id !== id));
  fillServiceSelects(); renderAll();
}
function updateServiceRequest(id, status) {
  saveServiceRequests(getServiceRequests().map((item) => item.id === id ? { ...item, status, updatedAt: nowISO() } : item));
  renderAll();
}


function setupNotificationForms() {
  $('[data-notification-rules-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const settings = getSettings();
    settings.notificationRules = {
      notifyEmail: Boolean(data.get('notifyEmail')),
      notifyWhatsapp: Boolean(data.get('notifyWhatsapp')),
      residentStatus: Boolean(data.get('residentStatus')),
      bookingStatus: Boolean(data.get('bookingStatus')),
      visitor: Boolean(data.get('visitor')),
      package: Boolean(data.get('package')),
      contact: Boolean(data.get('contact')),
      serviceRequest: Boolean(data.get('serviceRequest')),
    };
    saveSettings(settings);
    $('[data-notification-rules-message]').textContent = 'Regras de notificação salvas.';
    renderSettings();
  });

  $('[data-notification-settings-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = $('[data-notification-settings-message]');
    if (!backendAvailable) { if (msg) msg.textContent = 'Backend indisponível. Publique o Web Service no Render para salvar integrações.'; return; }
    if (msg) msg.textContent = 'Salvando integrações...';
    try {
      const form = asFormElement(event.currentTarget, '[data-notification-settings-form]');
      await saveNotificationConfigFromForm(form);
      await saveAsaasConfigFromForm(form);
      if (msg) { msg.textContent = 'Integrações salvas com segurança no backend.'; msg.style.color = 'var(--green)'; }
    } catch (error) {
      if (msg) { msg.textContent = `Erro ao salvar integrações: ${error.message}`; msg.style.color = 'var(--red)'; } else { alert(`Erro ao salvar integrações: ${error.message}`); }
    }
  });

  $('[data-test-email]')?.addEventListener('click', async () => {
    const form = $('[data-notification-settings-form]');
    const msg = $('[data-notification-settings-message]');
    if (!backendAvailable) { msg.textContent = 'Backend indisponível.'; return; }
    try {
      await saveNotificationConfigFromForm(form);
      const to = formDataOf(form, '[data-notification-settings-form]').get('testEmailTo');
      msg.textContent = 'Enviando e-mail de teste...';
      const response = await apiRequest('/api/integrations/test-email', { method: 'POST', body: JSON.stringify({ to }) });
      msg.textContent = `E-mail de teste enviado. ID: ${response.messageId || 'ok'}`;
      msg.style.color = 'var(--green)';
    } catch (error) {
      let extra = '';
      try {
        const debug = await apiRequest('/api/integrations/email/debug');
        const problems = debug?.email?.problems || [];
        if (problems.length) extra = ` | Diagnóstico: ${problems.join(' ')}`;
      } catch (_) {}
      msg.textContent = `Erro no teste de e-mail: ${error.message}${extra}`;
      msg.style.color = 'var(--red)';
    }
  });

  $('[data-test-whatsapp]')?.addEventListener('click', async () => {
    const form = $('[data-notification-settings-form]');
    const msg = $('[data-notification-settings-message]');
    if (!backendAvailable) { msg.textContent = 'Backend indisponível.'; return; }
    try {
      await saveNotificationConfigFromForm(form);
      const to = formDataOf(form, '[data-notification-settings-form]').get('testWhatsappTo');
      msg.textContent = 'Enviando WhatsApp de teste...';
      await apiRequest('/api/integrations/test-whatsapp', { method: 'POST', body: JSON.stringify({ to }) });
      msg.textContent = 'WhatsApp de teste enviado pela API configurada.';
      msg.style.color = 'var(--green)';
    } catch (error) {
      msg.textContent = `Erro no teste de WhatsApp: ${error.message}`;
      msg.style.color = 'var(--red)';
    }
  });

  $('[data-test-asaas]')?.addEventListener('click', async () => {
    const form = $('[data-notification-settings-form]');
    const msg = $('[data-notification-settings-message]');
    if (!backendAvailable) { msg.textContent = 'Backend indisponível.'; return; }
    try {
      await saveAsaasConfigFromForm(form);
      msg.textContent = 'Testando conexão com Asaas...';
      const response = await apiRequest('/api/integrations/test-asaas', { method: 'POST', body: JSON.stringify({}) });
      msg.textContent = `Asaas conectado em ambiente ${response.environment}.`;
      msg.style.color = 'var(--green)';
    } catch (error) {
      msg.textContent = `Erro no teste Asaas: ${error.message}`;
      msg.style.color = 'var(--red)';
    }
  });
}

function renderNotificationRules() {
  const form = $('[data-notification-rules-form]');
  if (!form) return;
  const rules = notificationRules();
  form.notifyEmail.checked = Boolean(rules.notifyEmail);
  form.notifyWhatsapp.checked = Boolean(rules.notifyWhatsapp);
  form.residentStatus.checked = Boolean(rules.residentStatus);
  form.bookingStatus.checked = Boolean(rules.bookingStatus);
  form.visitor.checked = Boolean(rules.visitor);
  form.package.checked = Boolean(rules.package);
  if (form.contact) form.contact.checked = Boolean(rules.contact);
  if (form.serviceRequest) form.serviceRequest.checked = Boolean(rules.serviceRequest);
}

function renderNotificationSettings() {
  const form = $('[data-notification-settings-form]');
  if (!form || !notificationConfig) return;
  const email = notificationConfig.email || {};
  const whatsapp = notificationConfig.whatsapp || {};
  const asaas = asaasConfig || {};
  form.emailEnabled.checked = Boolean(email.enabled);
  if (form.emailProvider) form.emailProvider.value = email.provider || 'smtp';
  form.smtpHost.value = email.host || 'smtp.gmail.com';
  form.smtpPort.value = email.port || 465;
  form.smtpSecure.value = String(Boolean(email.secure));
  form.smtpUser.value = email.user || '';
  form.smtpPassword.value = '';
  form.smtpPassword.placeholder = email.passwordSaved ? 'Senha salva — deixe em branco para manter' : 'Senha de aplicativo do Gmail/SMTP';
  form.smtpFromName.value = email.fromName || 'Condomínio Vitória Régia';
  form.smtpFromEmail.value = email.fromEmail || '';
  const mailersend = email.mailersend || {};
  if (form.mailersendApiKey) {
    form.mailersendApiKey.value = '';
    form.mailersendApiKey.placeholder = mailersend.apiKeySaved ? 'Token salvo — deixe em branco para manter' : 'Token API do MailerSend';
  }
  if (form.mailersendFromName) form.mailersendFromName.value = mailersend.fromName || email.fromName || 'Condomínio Vitória Régia';
  if (form.mailersendFromEmail) form.mailersendFromEmail.value = mailersend.fromEmail || email.fromEmail || '';
  if (form.testEmailTo) form.testEmailTo.value = email.provider === 'mailersend' ? (mailersend.testTo || email.testTo || email.user || '') : (email.testTo || email.user || '');
  form.whatsappEnabled.checked = Boolean(whatsapp.enabled);
  form.whatsappApiVersion.value = whatsapp.apiVersion || 'v20.0';
  form.whatsappPhoneNumberId.value = whatsapp.phoneNumberId || '';
  form.whatsappToken.value = '';
  form.whatsappToken.placeholder = whatsapp.tokenSaved ? 'Token salvo — deixe em branco para manter' : 'Token da Meta';
  form.whatsappCountryCode.value = whatsapp.countryCode || '55';
  if (form.asaasEnabled) {
    form.asaasEnabled.checked = Boolean(asaas.enabled);
    form.asaasEnvironment.value = asaas.environment || 'sandbox';
    form.asaasApiKey.value = '';
    form.asaasApiKey.placeholder = asaas.apiKeySaved ? 'API Key salva — deixe em branco para manter' : 'API Key do Asaas';
    form.asaasDueDays.value = asaas.dueDaysBeforeReservation ?? 2;
    form.asaasFine.value = asaas.fineValue ?? 2;
    form.asaasInterest.value = asaas.interestValue ?? 1;
  }
  const status = $('[data-integration-status]');
  if (status) {
    status.innerHTML = `
      <div><strong>E-mail:</strong> ${email.enabled ? 'ativado' : 'desativado'} • provedor: ${escapeHTML(email.provider || 'smtp')} ${email.provider === 'mailersend' ? (email.mailersend?.apiKeySaved ? '• token MailerSend salvo' : '• token MailerSend não salvo') : (email.passwordSaved ? '• senha SMTP salva' : '• senha SMTP não salva')}</div>
      <div><strong>WhatsApp:</strong> ${whatsapp.enabled ? 'ativado' : 'desativado'} ${whatsapp.tokenSaved ? '• token salvo' : '• token não salvo'}</div>
      <div><strong>Asaas:</strong> ${asaas.enabled ? 'ativado' : 'desativado'} • ${escapeHTML(asaas.environment || 'sandbox')} ${asaas.apiKeySaved ? '• API Key salva' : '• API Key não salva'}</div>
      <div><small>Para funcionar em produção, o backend precisa estar rodando com banco inicializado e as credenciais corretas.</small></div>`;
  }
}

async function notifyVisitorById(id, channels) {
  const visitor = getVisitors().find((item) => item.id === id);
  const resident = visitor ? approvedResidentByApartment(visitor.apartment) : null;
  if (!visitor || !resident) { alert('Visitante ou morador não encontrado.'); return; }
  const response = await notifyResidentEntity(resident, 'Visitante registrado — Condomínio Vitória Régia', visitorMessage(visitor, resident), channels);
  alert(`Notificação: ${resultSummary(response)}`);
}

async function notifyPackageById(id, channels) {
  const pkg = getPackages().find((item) => item.id === id);
  const resident = pkg ? approvedResidentByApartment(pkg.apartment) : null;
  if (!pkg || !resident) { alert('Encomenda ou morador não encontrado.'); return; }
  const response = await notifyResidentEntity(resident, 'Encomenda na portaria — Condomínio Vitória Régia', packageMessage(pkg), channels);
  alert(`Notificação: ${resultSummary(response)}`);
}

async function notifyResidentById(id, channels) {
  const resident = getResidents().find((item) => item.id === id);
  if (!resident) { alert('Morador não encontrado.'); return; }
  const response = await notifyResidentEntity(resident, 'Mensagem do Condomínio Vitória Régia', `Olá, ${resident.name}. Mensagem do Condomínio Vitória Régia para a unidade ${resident.apartment}.`, channels);
  alert(`Notificação: ${resultSummary(response)}`);
}

function setupSettings() {
  setupNotificationForms();
  $('[data-settings-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const settings = getSettings();
    settings.condominiumName = data.get('condominiumName').trim();
    settings.bookingTerms = data.get('bookingTerms').trim();
    settings.payee = data.get('payee').trim();
    saveSettings(settings);
    $('[data-settings-message]').textContent = 'Configurações salvas.';
    fillSpaceSelects(); renderAll();
  });
  $('[data-add-space]')?.addEventListener('click', () => {
    const settings = getSettings();
    const name = prompt('Nome do novo espaço:');
    if (!name) return;
    const fee = Number(prompt('Valor da taxa:', '0') || 0);
    settings.spaces.push({ id: uid('space'), name, fee });
    saveSettings(settings); fillSpaceSelects(); renderAll();
  });
}
function renderSettings() {
  renderNotificationRules();
  if (isSyndic() && backendAvailable && !notificationConfig) loadNotificationConfig();
  if (isSyndic() && backendAvailable && !asaasConfig) loadAsaasConfig();
  renderNotificationSettings();
  const form = $('[data-settings-form]');
  const editor = $('[data-spaces-editor]');
  const settings = getSettings();
  if (form && document.activeElement?.form !== form) {
    form.condominiumName.value = settings.condominiumName || '';
    form.bookingTerms.value = settings.bookingTerms || '';
    form.payee.value = settings.payee || '';
  }
  if (editor) {
    editor.innerHTML = settings.spaces.map((space) => `<div class="space-row"><label><span>Espaço</span><input value="${escapeHTML(space.name)}" data-space-name="${space.id}"></label><label><span>Taxa</span><input type="number" min="0" step="0.01" value="${Number(space.fee || 0)}" data-space-fee="${space.id}"></label><button class="btn btn--danger btn--sm" data-remove-space="${space.id}">Remover</button></div>`).join('');
  }
}
function updateSpace(id, patch) {
  const settings = getSettings();
  settings.spaces = settings.spaces.map((space) => space.id === id ? { ...space, ...patch } : space);
  saveSettings(settings); fillSpaceSelects(); renderAll();
}
function removeSpace(id) {
  const settings = getSettings();
  if (settings.spaces.length <= 1) { alert('Mantenha pelo menos um espaço.'); return; }
  settings.spaces = settings.spaces.filter((space) => space.id !== id);
  saveSettings(settings); fillSpaceSelects(); renderAll();
}

async function fileToDataURL(file) {
  if (!file || !file.size) return '';
  if (file.size > 2.5 * 1024 * 1024) { alert('Arquivo muito grande para armazenamento local. Use até 2,5 MB nesta versão.'); return ''; }
  return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(''); reader.readAsDataURL(file); });
}
async function fileMeta(file) {
  if (!file || !file.size) return null;
  return { name: file.name, type: file.type, size: file.size, uploadedAt: nowISO(), dataUrl: await fileToDataURL(file) };
}

function exportCSV(filename, rows) {
  if (!rows.length) { alert('Nada para exportar.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(';'), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replaceAll('"', '""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function handleDocumentClick(event) {
  const target = event.target;
  const actionMap = [
    ['data-approve-resident', approveResident], ['data-reject-resident', rejectResident], ['data-remove-resident', removeResident],
    ['data-edit-resident', editResident], ['data-primary-resident', setPrimaryResident], ['data-toggle-rented', toggleApartmentRented],
    ['data-approve-booking', approveBooking], ['data-cancel-booking', cancelBooking], ['data-edit-booking', editBooking],
    ['data-boleto-booking', async (id) => { location.hash = '#financeiro'; await renderBoletoPreview(id); }], ['data-mark-paid', markPaid],
    ['data-remove-visitor', (id) => { saveVisitors(getVisitors().filter((item) => item.id !== id)); renderAll(); }],
    ['data-deliver-package', deliverPackage], ['data-remove-notice', (id) => { saveNotices(getNotices().filter((item) => item.id !== id)); renderAll(); }],
    ['data-remove-space', removeSpace],
    ['data-auto-visitor-whatsapp', (id) => notifyVisitorById(id, ['whatsapp'])], ['data-auto-visitor-email', (id) => notifyVisitorById(id, ['email'])],
    ['data-auto-package-whatsapp', (id) => notifyPackageById(id, ['whatsapp'])], ['data-auto-package-email', (id) => notifyPackageById(id, ['email'])],
    ['data-auto-resident-whatsapp', (id) => notifyResidentById(id, ['whatsapp'])], ['data-auto-resident-email', (id) => notifyResidentById(id, ['email'])],
    ['data-edit-staff', editStaff], ['data-remove-staff', removeStaff],
    ['data-edit-service', editService], ['data-remove-service', removeService],
    ['data-approve-service-request', (id) => updateServiceRequest(id, 'approved')], ['data-cancel-service-request', (id) => updateServiceRequest(id, 'canceled')],
  ];
  for (const [attr, fn] of actionMap) {
    const el = target.closest(`[${attr}]`);
    if (el) { fn(el.getAttribute(attr)); return; }
  }
}
function handleDocumentChange(event) {
  const target = event.target;
  if (target.matches('[data-manager-doc]')) uploadManagerDocument(target.dataset.managerDoc, target.files?.[0]);
  if (target.matches('[data-space-name]')) updateSpace(target.dataset.spaceName, { name: target.value });
  if (target.matches('[data-space-fee]')) updateSpace(target.dataset.spaceFee, { fee: Number(target.value || 0) });
}

function setupPrint() { $('[data-print-boleto]')?.addEventListener('click', () => window.print()); }

async function init() {
  await loadBackendState();
  if (!backendAvailable) seedDemo(false);
  if (!read(keys.settings, null)) write(keys.settings, defaultSettings);
  fillApartmentSelects();
  fillSpaceSelects();
  fillServiceSelects();
  setupCurrentDate();
  authSetup();
  navigationSetup();
  setupResidents();
  setupMyResident();
  setupBookings();
  setupCalendar();
  setupVisitors();
  setupPackages();
  setupNotices();
  setupStaff();
  setupContactCenter();
  setupServices();
  setupSettings();
  if (backendAvailable) { await loadNotificationConfig(); await loadAsaasConfig(); }
  setupPrint();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('change', handleDocumentChange);
  const saved = read(keys.session, null);
  if (saved?.role) { await createBackendSession(saved); startSession(saved); } else endSession();
}

document.addEventListener('DOMContentLoaded', init);
