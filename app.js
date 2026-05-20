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
  staffSchedules: `${STORE_PREFIX}staffSchedules`,
  services: `${STORE_PREFIX}services`,
  serviceRequests: `${STORE_PREFIX}serviceRequests`,
  contactMessages: `${STORE_PREFIX}contactMessages`,
  settings: `${STORE_PREFIX}settings`,
};

const BACKEND_API = window.VR_API_BASE || '';
const REQUIRE_BACKEND = true;
const REQUIRE_APPROVED_RESIDENT = true;
const DEMO_MODE_DISABLED = true;
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
let currentVisitorPhoto = null;
let currentVisitorPhotoPreview = '';
let notificationConfig = null;
let notificationConfigLoading = false;
let asaasConfig = null;
let asaasConfigLoading = false;
let activityLogsCache = [];
let activityLogsLoading = false;
let scheduleFilterDate = new Date().toISOString().slice(0, 10);

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
function showBackendRequiredBanner() {
  if ($('[data-backend-required-banner]')) return;
  const banner = document.createElement('div');
  banner.setAttribute('data-backend-required-banner', 'true');
  banner.className = 'backend-required-banner';
  banner.innerHTML = '<strong>Banco de dados indisponível.</strong> Este sistema está em modo operacional e exige backend PostgreSQL ativo no Render. Verifique /api/health e /api/db/status.';
  document.body.prepend(banner);
}
function clearAppLocalCache() {
  Object.values(keys).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(`${STORE_PREFIX}seeded`);
}
function write(key, value) {
  if (REQUIRE_BACKEND && !backendAvailable && !suppressBackendSync) {
    showBackendRequiredBanner();
    console.warn('Gravação bloqueada: backend/banco indisponível.');
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
  queueBackendSync();
}
function remove(key) {
  if (REQUIRE_BACKEND && !backendAvailable && !suppressBackendSync) {
    showBackendRequiredBanner();
    console.warn('Remoção bloqueada: backend/banco indisponível.');
    return;
  }
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
      provider: data.get('whatsappProvider') || 'meta',
      apiVersion: data.get('whatsappApiVersion')?.trim() || 'v20.0',
      token: data.get('whatsappToken') || '',
      phoneNumberId: data.get('whatsappPhoneNumberId')?.trim() || '',
      countryCode: data.get('whatsappCountryCode')?.trim() || '55',
      testTo: data.get('testWhatsappTo')?.trim() || '',
      evolution: {
        serverUrl: data.get('evolutionApiUrl')?.trim() || '',
        instanceName: data.get('evolutionInstanceName')?.trim() || '',
        apiKey: data.get('evolutionApiKey') || '',
        countryCode: data.get('evolutionCountryCode')?.trim() || data.get('whatsappCountryCode')?.trim() || '55',
        testTo: data.get('testWhatsappTo')?.trim() || '',
        linkPreview: Boolean(data.get('evolutionLinkPreview')),
      },
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
  if (!backendAvailable) throw new Error('Backend indisponível. O sistema operacional exige banco de dados ativo.');
  return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}
async function destroyBackendSession() {
  if (!backendAvailable) return;
  try { await apiRequest('/auth/logout', { method: 'POST' }); } catch {}
}
async function getBackendSession() {
  if (!backendAvailable) return null;
  try {
    const data = await apiRequest('/api/me');
    return data?.user || null;
  } catch {
    return null;
  }
}
function cleanAuthQueryParams() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('auth') || url.searchParams.has('authError')) {
    url.searchParams.delete('auth');
    url.searchParams.delete('authError');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
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
function getStaffSchedules() { return read(keys.staffSchedules, []); }
function saveStaffSchedules(value) { write(keys.staffSchedules, value); }
function getServices() { return read(keys.services, []); }
function saveServices(value) { write(keys.services, value); }
function getServiceRequests() { return read(keys.serviceRequests, []); }
function saveServiceRequests(value) { write(keys.serviceRequests, value); }
function getContactMessages() { return read(keys.contactMessages, []); }
function saveContactMessages(value) { write(keys.contactMessages, value); }

function seedDemo() {
  // Modo demo removido. O sistema operacional não popula dados fictícios.
  return false;
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

function currentStaffRecord() {
  const email = normalizeEmail(session?.email || '');
  return getStaff().find((person) => {
    if (person.active === false) return false;
    if (session?.staffId && person.id === session.staffId) return true;
    return email && normalizeEmail(person.email || '') === email;
  }) || null;
}
function canManageSchedule() {
  if (isSyndic()) return true;
  const person = currentStaffRecord();
  return Boolean(person && person.canManageSchedule && staffAvailable(person));
}
function sanitizeDetailsForLog(details = {}) {
  const clone = JSON.parse(JSON.stringify(details || {}));
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (key === 'dataUrl' || (key === 'photo' && typeof value === 'string' && value.startsWith('data:'))) obj[key] = '[arquivo/foto não armazenado no banco]';
      else if (typeof value === 'string' && value.length > 1000) obj[key] = `${value.slice(0, 1000)}...`;
      else if (typeof value === 'object') walk(value);
    }
    return obj;
  };
  return walk(clone);
}
function downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}
function icsEscape(value = '') {
  return String(value || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function toICSDate(date) {
  return String(date || '').replace(/-/g, '');
}
function addDaysISO(date, days = 1) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
function shiftTimes(shift = '') {
  const normalized = normalizeText(shift);
  if (normalized.includes('manha')) return ['08:00', '12:00'];
  if (normalized.includes('tarde')) return ['12:00', '18:00'];
  if (normalized.includes('noite')) return ['18:00', '23:59'];
  return ['08:00', '18:00'];
}
function toICSDateTime(date, time) {
  return `${String(date || '').replace(/-/g, '')}T${String(time || '08:00').replace(':', '')}00`;
}
function makeICS(events = []) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vitoria Regia//Sistema Condominial//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  events.forEach((event) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscape(event.uid || uid('ics'))}@vitoria-regia`);
    lines.push(`DTSTAMP:${now}`);
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toICSDate(event.date)}`);
      lines.push(`DTEND;VALUE=DATE:${toICSDate(addDaysISO(event.date, 1))}`);
    } else {
      lines.push(`DTSTART:${toICSDateTime(event.date, event.start || '08:00')}`);
      lines.push(`DTEND:${toICSDateTime(event.date, event.end || '18:00')}`);
    }
    lines.push(`SUMMARY:${icsEscape(event.summary || 'Evento Vitória Régia')}`);
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function isSyndic() { return currentRole() === 'sindico'; }
function isResident() { return currentRole() === 'morador'; }

function applyPermissions() {
  $$('[data-roles]').forEach((el) => el.classList.toggle('is-role-hidden', !roleAllowed(el.dataset.roles)));
  $$('[data-schedule-manager]').forEach((el) => el.classList.toggle('is-role-hidden', !canManageSchedule()));
  const profileName = $('[data-profile-name]');
  const profileUnit = $('[data-profile-unit]');
  if (profileName) profileName.textContent = session ? `${roles[currentRole()].label}` : 'Não autenticado';
  if (profileUnit) profileUnit.textContent = session?.apartment ? `Unidade ${session.apartment} • ${session.name || ''}` : (session?.name || 'Acesso administrativo');
  const title = $('[data-page-title]');
  if (title) title.textContent = roles[currentRole()].title;
  const heroTitle = $('[data-hero-title]');
  const heroText = $('[data-hero-text]');
  if (heroTitle) heroTitle.textContent = currentRole() === 'portaria' ? 'Portaria inteligente e integrada.' : currentRole() === 'sindico' ? 'Painel completo de gestão do síndico.' : 'Área do morador simples e segura.';
  if (heroText) heroText.textContent = currentRole() === 'portaria' ? 'Registre visitantes, fotos, encomendas e avise moradores rapidamente.' : currentRole() === 'sindico' ? 'Aprove cadastros, valide reservas, gere boletos reais pelo Asaas e gerencie o calendário.' : 'Solicite reservas, acompanhe comunicados e veja disponibilidade sem expor dados de outras unidades.';
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
  const bootstrapPasswordWrap = $('[data-bootstrap-password-wrap]');

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
    if (bootstrapPasswordWrap) bootstrapPasswordWrap.style.display = role === 'sindico' ? 'grid' : 'none';
    const params = new URLSearchParams({ role });
    if (role === 'morador') params.set('apartment', $('[data-login-apartment]')?.value || '');
    googleLink.href = `/auth/google?${params.toString()}`;
  }
  roleSelect.addEventListener('change', syncRoleUI);
  $('[data-login-apartment]')?.addEventListener('change', syncRoleUI);
  syncRoleUI();

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = $('[data-login-message]');
    if (!backendAvailable) {
      showBackendRequiredBanner();
      if (message) message.textContent = 'Backend/banco indisponível. Publique o Web Service no Render e confirme /api/db/status antes de acessar.';
      return;
    }
    const form = new FormData(loginForm);
    const role = form.get('role');
    const name = form.get('name') || roles[role].label;
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const apartment = role === 'morador' ? form.get('apartment') : '';
    try {
      if (role === 'morador') {
        const approved = email
          ? (getResidents().find((resident) => resident.apartment === apartment && resident.email === email && resident.status === 'approved') || getResidents().find((resident) => resident.email === email && resident.status === 'approved'))
          : null;
        if (REQUIRE_APPROVED_RESIDENT && !approved) {
          if (message) message.textContent = 'Cadastro não localizado ou ainda não aprovado pelo síndico para esta unidade.';
          return;
        }
        const payload = { role, name: approved?.name || name, email: approved?.email || email, apartment: approved?.apartment || apartment, residentId: approved?.id || null, demo: false };
        const result = await createBackendSession(payload);
        startSession(result?.user || payload);
        return;
      }
      const payload = { role, name, email, password, apartment: '', demo: false };
      const result = await createBackendSession(payload);
      startSession(result?.user || payload);
      if (message && result?.bootstrap?.active) message.textContent = result.bootstrap.message || 'Acesso temporário liberado.';
    } catch (error) {
      if (message) message.textContent = error.message || 'Não foi possível autenticar.';
    }
  });

  signupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!backendAvailable) {
      showBackendRequiredBanner();
      $('[data-signup-message]').textContent = 'Banco de dados indisponível. O cadastro só pode ser solicitado com o backend operacional ativo.';
      return;
    }
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
  $('[data-clear-cache]')?.addEventListener('click', async () => {
    if (!confirm('Limpar apenas o cache local deste navegador e recarregar os dados do banco?')) return;
    clearAppLocalCache();
    await loadBackendState();
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
  if (!section || !roleAllowed(section.dataset.roles) || (section.hasAttribute('data-schedule-manager') && !canManageSchedule())) {
    section = $$('[data-section]').find((sec) => roleAllowed(sec.dataset.roles) && (!sec.hasAttribute('data-schedule-manager') || canManageSchedule()));
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


async function logPortariaActivity(action, details = {}, entityType = '') {
  if (currentRole() !== 'portaria') return;
  return logActivity(action, details, entityType);
}

async function loadActivityLogs(force = false) {
  if (!backendAvailable || !isSyndic()) return [];
  if (activityLogsLoading) return activityLogsCache;
  if (!force && activityLogsCache.length) return activityLogsCache;
  activityLogsLoading = true;
  try {
    const data = await apiRequest('/api/activity-logs');
    activityLogsCache = Array.isArray(data.logs) ? data.logs : [];
    return activityLogsCache;
  } catch (error) {
    const box = $('[data-activity-logs-list]');
    if (box) box.innerHTML = empty(`Não foi possível carregar os logs: ${error.message}`);
    return [];
  } finally {
    activityLogsLoading = false;
  }
}

function renderActivityLogsFromCache() {
  const box = $('[data-activity-logs-list]');
  if (!box) return;
  if (!isSyndic()) { box.innerHTML = empty('Acesso restrito ao síndico/subsíndico.'); return; }
  const search = normalizeText($('[data-activity-log-search]')?.value || '');
  let logs = activityLogsCache.slice();
  if (search) {
    logs = logs.filter((log) => normalizeText(`${log.actorName || ''} ${log.actorEmail || ''} ${log.action || ''} ${log.apartment || ''} ${log.summary || ''}`).includes(search));
  }
  box.innerHTML = logs.length ? logs.map((log) => `
    <div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(log.action || 'Atividade registrada')} <span class="badge">${escapeHTML(log.entityType || 'portaria')}</span></div>
          <div class="item-sub">${formatDateTime(log.createdAt)} • ${escapeHTML(log.actorName || 'Portaria')} ${log.actorEmail ? `(${escapeHTML(log.actorEmail)})` : ''}${log.apartment ? ` • Unidade ${escapeHTML(log.apartment)}` : ''}</div>
          ${log.summary ? `<div class="item-sub">${escapeHTML(log.summary)}</div>` : ''}
        </div>
        <span class="status status--approved">auditado</span>
      </div>
    </div>`).join('') : empty('Nenhuma atividade registrada pela portaria.');
}

async function renderActivityLogs(force = false) {
  const box = $('[data-activity-logs-list]');
  if (!box) return;
  if (!isSyndic()) return;
  if (!activityLogsCache.length || force) {
    box.innerHTML = empty('Carregando registros de atividade...');
    await loadActivityLogs(force);
  }
  renderActivityLogsFromCache();
}

function exportActivityLogsCSV() {
  const rows = activityLogsCache.map((log) => ({
    data: formatDateTime(log.createdAt),
    usuario: log.actorName || '',
    email: log.actorEmail || '',
    perfil: log.actorRole || '',
    acao: log.action || '',
    tipo: log.entityType || '',
    unidade: log.apartment || '',
    resumo: log.summary || '',
  }));
  exportCSV('logs-portaria.csv', rows);
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
  renderStaffSchedules();
  renderContactCenter();
  renderServices();
  renderServiceRequests();
  renderSettings();
  renderActivityLogs();
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
  form?.querySelector('[name="target"]')?.addEventListener('change', () => renderContactCenter());
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
  $('[data-guest-import]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !form) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parseGuestList(text);
      const area = form.querySelector('[name="guestList"]');
      if (area) area.value = guestsText(parsed);
      const count = form.querySelector('[name="guestCount"]');
      if (count && !count.value) count.value = parsed.length;
      $('[data-booking-message]').textContent = `Lista importada com ${parsed.length} convidado(s).`;
    } catch (error) {
      $('[data-booking-message]').textContent = `Erro ao importar lista: ${error.message}`;
    } finally {
      event.target.value = '';
    }
  });
  $('[data-clear-guests]')?.addEventListener('click', () => {
    if (!form) return;
    form.querySelector('[name="guestList"]').value = '';
    form.querySelector('[name="guestCount"]').value = '';
    $('[data-booking-message]').textContent = 'Lista de convidados limpa.';
  });
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
    ${guests.length ? `<button class="btn btn--outline btn--sm" data-print-guests="${booking.id}">Imprimir convidados</button><button class="btn btn--outline btn--sm" data-export-guests="${booking.id}">Exportar convidados CSV</button>` : ''}
    <button class="btn btn--outline btn--sm" data-edit-booking="${booking.id}">Modificar</button>
    <button class="btn btn--danger btn--sm" data-cancel-booking="${booking.id}">Cancelar</button>
  ` : `
    ${booking.boleto ? `<button class="btn btn--outline btn--sm" data-boleto-booking="${booking.id}">Ver boleto</button>` : ''}
    ${guests.length ? `<button class="btn btn--outline btn--sm" data-print-guests="${booking.id}">Imprimir convidados</button>` : ''}
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


function guestRowsForBooking(booking) {
  const guests = Array.isArray(booking?.guests) ? booking.guests : parseGuestList(booking?.guestListText || '');
  return guests.map((guest, index) => ({ numero: index + 1, nome: guest.name || guest, documento: guest.document || '', observacao: guest.note || '' }));
}
function printGuestList(id) {
  const booking = getBookings().find((item) => item.id === id);
  if (!booking) return;
  const rows = guestRowsForBooking(booking);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lista de convidados</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}small{color:#555}.sign{margin-top:36px;border-top:1px solid #333;width:300px;text-align:center;padding-top:8px}</style></head><body><h1>Lista de convidados — ${escapeHTML(booking.spaceName)}</h1><p><strong>Data:</strong> ${formatDate(booking.date)} • <strong>Período:</strong> ${escapeHTML(booking.period)} • <strong>Unidade:</strong> ${escapeHTML(booking.apartment)}</p><p><strong>Responsável:</strong> ${escapeHTML(booking.eventResponsible || booking.residentName || '')} • <strong>Previstos:</strong> ${Number(booking.guestCount || rows.length || 0)}</p><table><thead><tr><th>#</th><th>Nome</th><th>Documento/observação</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.numero}</td><td>${escapeHTML(row.nome)}</td><td>${escapeHTML(row.documento || row.observacao || '')}</td></tr>`).join('')}</tbody></table><div class="sign">Portaria / responsável</div><script>window.print()</script></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}
function exportGuestListCSV(id) {
  const booking = getBookings().find((item) => item.id === id);
  if (!booking) return;
  const rows = guestRowsForBooking(booking);
  exportCSV(`convidados-${booking.apartment}-${booking.date}.csv`, rows);
}
function exportReservationsICS() {
  const events = getBookings().filter((booking) => !['canceled', 'rejected'].includes(booking.status)).map((booking) => ({
    uid: booking.id,
    date: booking.date,
    allDay: true,
    summary: `${booking.status === 'pending' ? 'Pré-agendado' : 'Reserva'}: ${booking.spaceName}`,
    location: getSettings().condominiumName,
    description: isSyndic() ? `Unidade ${booking.apartment} - ${booking.residentName || ''} - Período: ${booking.period} - Status: ${statusLabel(booking.status)}` : `Período: ${booking.period} - Status: ${booking.status === 'pending' ? 'Pré-agendado' : 'Ocupado'}`,
  }));
  if (!events.length) { alert('Não há reservas para exportar.'); return; }
  downloadTextFile('calendario-reservas-vitoria-regia.ics', makeICS(events), 'text/calendar;charset=utf-8');
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
    logActivity('Validou reserva', { ...updated, summary: `Reserva validada: ${updated.spaceName} em ${updated.date}` }, 'reserva');
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
  if (updated) { logActivity('Cancelou reserva', { ...updated, summary: `Reserva cancelada: ${updated.spaceName} em ${updated.date}` }, 'reserva'); await maybeNotifyResident({ email: updated.residentEmail, whatsapp: updated.residentWhatsapp, name: updated.residentName }, 'bookingStatus', 'Reserva cancelada — Condomínio Vitória Régia', `Olá, ${updated.residentName}. Sua reserva de ${updated.spaceName} para ${formatDate(updated.date)} (${updated.period}) foi cancelada. Motivo: ${reason}`); }
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
  logActivity('Modificou reserva', { ...booking, newDate, newPeriod, summary: `Reserva alterada para ${newDate} ${newPeriod}` }, 'reserva');
  renderAll();
}
async function uploadManagerDocument(id, file) {
  const managerDocument = await fileMeta(file);
  saveBookings(getBookings().map((booking) => booking.id === id ? { ...booking, managerDocument } : booking));
  logActivity('Anexou documento de reserva', { entityId: id, summary: `Documento anexado à reserva ${id}`, document: managerDocument }, 'reserva');
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
  if (updated) {
    logActivity('Marcou pagamento de reserva', { ...updated, summary: `Pagamento registrado: ${updated.spaceName} em ${updated.date}` }, 'reserva');
    await maybeNotifyResident({ email: updated.residentEmail, whatsapp: updated.residentWhatsapp, name: updated.residentName }, 'bookingStatus', 'Pagamento confirmado — Condomínio Vitória Régia', `Olá, ${updated.residentName}. O pagamento da reserva de ${updated.spaceName} para ${formatDate(updated.date)} foi registrado no sistema.`);
  }
}

function setupVisitors() {
  const photoInput = $('[data-visitor-photo]');
  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    currentVisitorPhoto = await fileMeta(file);
    if (currentVisitorPhotoPreview) URL.revokeObjectURL(currentVisitorPhotoPreview);
    currentVisitorPhotoPreview = file ? URL.createObjectURL(file) : '';
    renderPhotoPreview();
  });
  $('[data-visitor-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const visitor = {
      id: uid('visitor'), name: data.get('name').trim(), document: data.get('document').trim(), phone: data.get('phone').trim(),
      apartment: data.get('apartment'), type: data.get('type'), notes: data.get('notes').trim(), photo: null, photoMeta: currentVisitorPhoto, createdAt: nowISO(),
    };
    saveVisitors([visitor, ...getVisitors()]);
    logPortariaActivity('Registrou visitante', { ...visitor, summary: `Visitante ${visitor.name} registrado para a unidade ${visitor.apartment}` }, 'visitante');
    const resident = approvedResidentByApartment(visitor.apartment);
    $('[data-visitor-message]').innerHTML = resident ? `Visitante salvo. <a class="text-link" target="_blank" href="${whatsAppLink(resident.whatsapp, visitorMessage(visitor, resident))}">Abrir WhatsApp manual</a>` : 'Visitante salvo. Morador da unidade não encontrado.';
    currentVisitorPhoto = null;
    if (currentVisitorPhotoPreview) URL.revokeObjectURL(currentVisitorPhotoPreview);
    currentVisitorPhotoPreview = '';
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
  box.innerHTML = currentVisitorPhotoPreview ? `<img src="${currentVisitorPhotoPreview}" alt="Prévia da foto do visitante">` : '<span>Foto</span>';
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
          <div class="visitor-avatar">${escapeHTML(visitor.name.charAt(0) || 'V')}</div>
          <div><div class="item-title">${escapeHTML(visitor.name)} • Unidade ${escapeHTML(visitor.apartment)}</div><div class="item-sub">${escapeHTML(visitor.type)} • ${escapeHTML(visitor.document || 'sem documento')} • ${formatDateTime(visitor.createdAt)}${visitor.photoMeta ? ` • Foto registrada: ${escapeHTML(visitor.photoMeta.name || 'arquivo')}` : ''}${visitor.notes ? `<br>${escapeHTML(visitor.notes)}` : ''}</div></div>
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



function detectCarrierFromText(text = '', code = '') {
  const normalized = normalizeText(`${text} ${code}`);
  const carriers = [
    { name: 'Correios', keys: ['correios', 'sedex', 'pac', 'objeto'] },
    { name: 'Jadlog', keys: ['jadlog'] },
    { name: 'Loggi', keys: ['loggi'] },
    { name: 'Amazon', keys: ['amazon', 'amzn'] },
    { name: 'Mercado Livre', keys: ['mercado livre', 'melhor envio', 'meli', 'mlb'] },
    { name: 'Shopee', keys: ['shopee', 'spx'] },
    { name: 'Total Express', keys: ['total express', 'totalexpress', 'tex courier'] },
    { name: 'Azul Cargo', keys: ['azul cargo', 'azulcargo'] },
    { name: 'DHL', keys: ['dhl'] },
    { name: 'FedEx', keys: ['fedex', 'fedex express'] },
    { name: 'UPS', keys: ['ups'] },
    { name: 'Sequoia', keys: ['sequoia', 'sequoia log'] },
    { name: 'Braspress', keys: ['braspress'] },
    { name: 'Mandaê', keys: ['mandae', 'mandaê'] },
    { name: 'Kangu', keys: ['kangu'] },
    { name: 'J&T Express', keys: ['j&t', 'jtexpress', 'j t express'] },
  ];
  const found = carriers.find((carrier) => carrier.keys.some((key) => normalized.includes(normalizeText(key))));
  if (found) return found.name;
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(String(code || '').trim())) return 'Correios';
  if (/^BR\d{10,}$/i.test(String(code || '').trim())) return 'Shopee / logística parceira';
  return '';
}

function compactLabelText(text = '') {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[\t]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function probableTrackingCodes(text = '') {
  const joined = String(text || '').replace(/\s+/g, ' ').toUpperCase();
  const candidates = [];
  const labeled = [...joined.matchAll(/(?:CODIGO|CÓDIGO|RASTREIO|TRACKING|AWB|PEDIDO|OBJETO|REMESSA|NF|NOTA FISCAL|ETIQUETA)[\s:#\-]*([A-Z0-9.\-]{6,48})/gi)].map((m) => m[1]);
  candidates.push(...labeled);
  candidates.push(...(joined.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/g) || []));
  candidates.push(...(joined.match(/\b[A-Z0-9]{10,44}\b/g) || []));
  candidates.push(...(joined.match(/\b\d{8,44}\b/g) || []));
  return [...new Set(candidates.map((item) => String(item).replace(/[^A-Z0-9.-]/gi, '').toUpperCase()))]
    .filter((item) => item.length >= 6)
    .sort((a, b) => {
      const score = (value) => {
        let s = 0;
        if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(value)) s += 10;
        if (/[A-Z]/.test(value) && /\d/.test(value)) s += 4;
        if (value.length >= 10 && value.length <= 20) s += 3;
        if (/^\d+$/.test(value) && value.length > 20) s -= 1;
        return s;
      };
      return score(b) - score(a);
    });
}

function findApartmentInLabel(text = '') {
  const joined = String(text || '').replace(/\s+/g, ' ');
  const apartmentsList = apartments();
  const patterns = [
    /(?:apto|apartamento|unidade|unid\.?|ap\.?|apt\.?)\s*[:#\-º°]?\s*(\d{3,4})/i,
    /(?:torre|bloco)?\s*(?:vit[oó]ria\s*r[eé]gia)?\s*(?:apto|apartamento|unidade)?\s*[:#\-º°]?\s*(\d{3,4})/i,
  ];
  for (const pattern of patterns) {
    const match = joined.match(pattern);
    if (match?.[1] && apartmentsList.includes(match[1])) return match[1];
  }
  return apartmentsList.find((apt) => new RegExp(`(^|\\D)${apt}(\\D|$)`).test(joined)) || '';
}

function inferApartmentByRecipientName(recipient = '') {
  const cleanRecipient = normalizeText(recipient).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanRecipient || cleanRecipient.length < 5) return '';
  const residents = getResidents();
  const tokens = cleanRecipient.split(' ').filter((t) => t.length >= 3);
  let best = null;
  for (const resident of residents) {
    const cleanName = normalizeText(resident.name || '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanName) continue;
    let score = 0;
    if (cleanName.includes(cleanRecipient) || cleanRecipient.includes(cleanName)) score += 20;
    for (const token of tokens) if (cleanName.includes(token)) score += 2;
    if (!best || score > best.score) best = { score, resident };
  }
  return best?.score >= 4 ? best.resident.apartment : '';
}

function extractRecipientFromLabel(lines = []) {
  const ignore = /codigo|código|rastreio|tracking|awb|pedido|nota|nf|cpf|cnpj|cep|endere[cç]o|bairro|cidade|uf|remetente|transportadora|correios|jadlog|loggi|amazon|mercado livre|shopee|total express|destino|origem|declara/i;
  const labelled = lines.find((line) => /destinat[aá]rio|recebedor|a\/c|aos cuidados|nome/i.test(line));
  if (labelled) {
    const clean = labelled.replace(/.*?(destinat[aá]rio|recebedor|a\/c|aos cuidados|nome)\s*[:#\-]?\s*/i, '').trim();
    if (clean && clean.length > 2) return clean.slice(0, 90);
  }
  const nextToLabelIndex = lines.findIndex((line) => /destinat[aá]rio|recebedor/i.test(line));
  if (nextToLabelIndex >= 0 && lines[nextToLabelIndex + 1] && !ignore.test(lines[nextToLabelIndex + 1])) return lines[nextToLabelIndex + 1].slice(0, 90);
  const candidates = lines
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length >= 5 && line.length <= 90)
    .filter((line) => !ignore.test(line))
    .filter((line) => /[A-Za-zÀ-ÿ]{3,}\s+[A-Za-zÀ-ÿ]{2,}/.test(line))
    .filter((line) => !detectCarrierFromText(line));
  return candidates[0] || '';
}

function parsePackageLabelText(text = '') {
  const raw = compactLabelText(text);
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const joined = lines.join(' ');
  const fields = { rawText: raw, confidence: 0, warnings: [] };

  fields.apartment = findApartmentInLabel(joined);
  if (fields.apartment) fields.confidence += 25;

  fields.recipient = extractRecipientFromLabel(lines);
  if (fields.recipient) fields.confidence += 25;

  if (!fields.apartment && fields.recipient) {
    const inferredApt = inferApartmentByRecipientName(fields.recipient);
    if (inferredApt) {
      fields.apartment = inferredApt;
      fields.apartmentInferred = true;
      fields.confidence += 15;
    }
  }

  if (fields.apartment && !fields.recipient) {
    const resident = approvedResidentByApartment(fields.apartment);
    if (resident?.name) {
      fields.recipient = resident.name;
      fields.recipientInferred = true;
      fields.confidence += 10;
    }
  }

  const codes = probableTrackingCodes(joined);
  fields.code = codes[0] || '';
  fields.codeCandidates = codes.slice(0, 5);
  if (fields.code) fields.confidence += 25;

  fields.carrier = detectCarrierFromText(raw, fields.code);
  if (fields.carrier) fields.confidence += 15;

  const cep = joined.match(/\b\d{5}-?\d{3}\b/);
  if (cep) fields.cep = cep[0];

  if (!fields.apartment) fields.warnings.push('Apartamento não identificado.');
  if (!fields.recipient) fields.warnings.push('Destinatário não identificado.');
  if (!fields.code) fields.warnings.push('Código de rastreio não identificado.');
  fields.confidence = Math.min(100, fields.confidence);
  return fields;
}

function renderPackageScanResult(fields = {}) {
  const box = $('[data-package-scan-result]');
  if (!box) return;
  const detected = [
    ['Apartamento', fields.apartment ? `${fields.apartment}${fields.apartmentInferred ? ' (sugerido pelo cadastro)' : ''}` : 'não identificado'],
    ['Destinatário', fields.recipient ? `${fields.recipient}${fields.recipientInferred ? ' (sugerido pelo cadastro)' : ''}` : 'não identificado'],
    ['Transportadora', fields.carrier || 'não identificada'],
    ['Código', fields.code || 'não identificado'],
  ];
  const confidence = Number(fields.confidence || 0);
  const className = confidence >= 70 ? 'ok' : confidence >= 40 ? 'warn' : 'low';
  box.hidden = false;
  box.innerHTML = `
    <div class="scan-result__head"><strong>Dados identificados</strong><span class="scan-score scan-score--${className}">${confidence}%</span></div>
    <div class="scan-result__grid">${detected.map(([label, value]) => `<div><small>${label}</small><strong>${escapeHTML(value)}</strong></div>`).join('')}</div>
    ${fields.codeCandidates?.length > 1 ? `<div class="scan-candidates"><small>Outros códigos encontrados:</small> ${fields.codeCandidates.slice(1).map((code) => `<button type="button" class="chip-btn" data-use-package-code="${escapeHTML(code)}">${escapeHTML(code)}</button>`).join('')}</div>` : ''}
    ${fields.warnings?.length ? `<p class="scan-warning">${escapeHTML(fields.warnings.join(' '))} Confira antes de registrar.</p>` : ''}
  `;
}

function applyPackageLabelFields(fields = {}) {
  const form = $('[data-package-form]');
  if (!form) return;
  if (fields.apartment && form.apartment) form.apartment.value = fields.apartment;
  if (fields.recipient && form.recipient) form.recipient.value = fields.recipient;
  if (fields.carrier && form.carrier) form.carrier.value = fields.carrier;
  if (fields.code && form.code) form.code.value = fields.code;
  if (fields.rawText && form.labelText) form.labelText.value = fields.rawText;
  renderPackageScanResult(fields);
  const filled = ['apartment', 'recipient', 'carrier', 'code'].filter((key) => fields[key]).map((key) => ({ apartment: 'apartamento', recipient: 'destinatário', carrier: 'transportadora', code: 'código' }[key]));
  const msg = $('[data-package-scan-message]');
  if (msg) msg.textContent = filled.length ? `Etiqueta processada. Campos preenchidos: ${filled.join(', ')}. Confira os dados antes de registrar.` : 'Etiqueta processada, mas não encontrei dados suficientes. Preencha manualmente ou fotografe novamente com melhor iluminação.';
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-tesseract-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Tesseract), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.dataset.tesseractLoader = 'true';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Não foi possível carregar o leitor OCR. Cole o texto da etiqueta manualmente.'));
    document.head.appendChild(script);
  });
}

async function readTextFromImageWithOcr(file, onProgress) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(file, 'por+eng', {
    logger: (m) => {
      if (m.status && typeof m.progress === 'number') onProgress?.(`${m.status} ${Math.round(m.progress * 100)}%`);
    },
  });
  return result?.data?.text || '';
}

async function decodeBarcodeFromImage(file) {
  if (!file) throw new Error('Selecione ou fotografe uma etiqueta.');
  if (!('BarcodeDetector' in window)) return '';
  const formats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'pdf417', 'aztec', 'data_matrix'];
  const detector = new BarcodeDetector({ formats });
  const bitmap = await createImageBitmap(file);
  const codes = await detector.detect(bitmap);
  return codes.map((item) => item.rawValue).filter(Boolean).join('\n');
}

async function handlePackageLabelImage(file) {
  const msg = $('[data-package-scan-message]');
  const useOcr = $('[data-package-ocr-enabled]')?.checked !== false;
  if (msg) msg.textContent = 'Lendo código de barras/QR da etiqueta...';
  try {
    let decoded = await decodeBarcodeFromImage(file);
    if (!decoded && useOcr) {
      if (msg) msg.textContent = 'Nenhum código encontrado. Iniciando OCR local da imagem...';
      decoded = await readTextFromImageWithOcr(file, (progress) => { if (msg) msg.textContent = `Lendo texto da etiqueta: ${progress}`; });
    }
    if (!decoded) throw new Error('Não consegui ler a etiqueta. Tente fotografar mais perto, com boa luz, ou cole o texto manualmente.');
    const textArea = $('[data-package-label-text]');
    if (textArea) textArea.value = decoded;
    applyPackageLabelFields(parsePackageLabelText(decoded));
  } catch (error) {
    if (msg) msg.textContent = error.message || 'Erro ao ler etiqueta.';
  }
}

function packageMessage(pkg) {
  return `Olá. Há uma encomenda na portaria para a unidade ${pkg.apartment}. Destinatário: ${pkg.recipient}. ${pkg.carrier ? `Transportadora: ${pkg.carrier}.` : ''} ${pkg.code ? `Código: ${pkg.code}.` : ''}`;
}

function clearPackageScan() {
  const form = $('[data-package-form]');
  if (!form) return;
  if (form.labelText) form.labelText.value = '';
  if (form.recipient) form.recipient.value = '';
  if (form.carrier) form.carrier.value = '';
  if (form.code) form.code.value = '';
  if (form.notes) form.notes.value = '';
  const result = $('[data-package-scan-result]');
  if (result) { result.hidden = true; result.innerHTML = ''; }
  const msg = $('[data-package-scan-message]');
  if (msg) msg.textContent = 'Leitura limpa. Fotografe a etiqueta ou cole o texto para preencher automaticamente.';
}

function setupPackages() {
  $('[data-package-label-image]')?.addEventListener('change', (event) => handlePackageLabelImage(event.target.files?.[0]));
  $('[data-parse-package-label]')?.addEventListener('click', () => {
    const text = $('[data-package-label-text]')?.value || '';
    applyPackageLabelFields(parsePackageLabelText(text));
  });
  $('[data-clear-package-scan]')?.addEventListener('click', clearPackageScan);
  $('[data-package-label-text]')?.addEventListener('blur', (event) => {
    if (event.target.value.trim().length >= 8) applyPackageLabelFields(parsePackageLabelText(event.target.value));
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-use-package-code]');
    if (!button) return;
    const form = $('[data-package-form]');
    if (form?.code) form.code.value = button.dataset.usePackageCode || '';
  });
  $('[data-package-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const pkg = {
      id: uid('package'),
      apartment: data.get('apartment'),
      recipient: data.get('recipient').trim(),
      carrier: data.get('carrier').trim(),
      code: data.get('code').trim(),
      labelText: data.get('labelText')?.trim() || '',
      storageLocation: data.get('storageLocation')?.trim() || '',
      packageType: data.get('packageType') || 'Encomenda',
      notes: data.get('notes').trim(),
      status: 'open',
      createdAt: nowISO(),
    };
    savePackages([pkg, ...getPackages()]);
    logPortariaActivity('Registrou encomenda', { ...pkg, summary: `Encomenda registrada para ${pkg.recipient} na unidade ${pkg.apartment}` }, 'encomenda');
    const resident = approvedResidentByApartment(pkg.apartment);
    const msg = packageMessage(pkg);
    $('[data-package-message]').textContent = 'Encomenda registrada.';
    form.reset(); fillApartmentSelects();
    const result = $('[data-package-scan-result]');
    if (result) { result.hidden = true; result.innerHTML = ''; }
    renderAll();
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
      <div class="item-row"><div><div class="item-title">Unidade ${escapeHTML(pkg.apartment)} • ${escapeHTML(pkg.recipient)}</div><div class="item-sub">${escapeHTML(pkg.packageType || 'Encomenda')} • ${escapeHTML(pkg.carrier || 'Transportadora não informada')} • ${escapeHTML(pkg.code || 'sem código')} • ${formatDateTime(pkg.createdAt)}${pkg.storageLocation ? `<br>Local: ${escapeHTML(pkg.storageLocation)}` : ''}${pkg.notes ? `<br>${escapeHTML(pkg.notes)}` : ''}</div></div><span class="status status--pending">Aguardando retirada</span></div>
      <div class="item-actions">${resident ? `<button class="btn btn--success btn--sm" data-auto-package-whatsapp="${pkg.id}">Auto WhatsApp</button><button class="btn btn--success btn--sm" data-auto-package-email="${pkg.id}">Auto e-mail</button><a class="btn btn--outline btn--sm" target="_blank" href="${whatsAppLink(resident.whatsapp, msg)}">Manual WhatsApp</a><a class="btn btn--outline btn--sm" href="mailto:${encodeURIComponent(resident.email)}?subject=${encodeURIComponent('Encomenda na portaria')}&body=${encodeURIComponent(msg)}">Manual e-mail</a>` : ''}<button class="btn btn--success btn--sm" data-deliver-package="${pkg.id}">Marcar retirada</button></div>
    </div>`;
  }).join('') : empty('Nenhuma encomenda pendente.');
}
function deliverPackage(id) {
  const original = getPackages().find((item) => item.id === id);
  savePackages(getPackages().map((item) => item.id === id ? { ...item, status: 'delivered', deliveredAt: nowISO() } : item));
  if (original) logPortariaActivity('Marcou encomenda como retirada', { ...original, summary: `Encomenda de ${original.recipient} retirada na unidade ${original.apartment}` }, 'encomenda');
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


function staffStatusLabel(status) {
  return {
    disponivel: 'Disponível',
    afastado: 'Afastado',
    ausente: 'Ausente',
    ferias: 'Férias',
  }[status] || 'Disponível';
}
function staffStatusClass(status) {
  return status === 'disponivel' || !status ? 'approved' : 'pending';
}
function todayLocalISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function currentShift(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'Manhã';
  if (hour >= 12 && hour < 18) return 'Tarde';
  return 'Noite';
}
function shiftOrder(shift) {
  return { 'Manhã': 1, 'Tarde': 2, 'Noite': 3 }[shift] || 9;
}
function staffAvailable(person, dateISO = todayLocalISO()) {
  if (!person || person.active === false) return false;
  const status = person.status || 'disponivel';
  if (status !== 'disponivel') return false;
  const from = person.awayFrom || '';
  const to = person.awayTo || '';
  if (from && dateISO < from) return true;
  if (from && to && dateISO >= from && dateISO <= to) return false;
  if (from && !to && dateISO >= from) return false;
  return true;
}
function onDutyStaff({ role = 'porteiro', date = todayLocalISO(), shift = currentShift() } = {}) {
  const staff = getStaff();
  const scheduledIds = getStaffSchedules()
    .filter((item) => item.date === date && item.shift === shift)
    .map((item) => item.staffId);
  return staff.filter((person) => {
    if (role && person.role !== role) return false;
    if (!scheduledIds.includes(person.id)) return false;
    return staffAvailable(person, date);
  });
}
function onDutyPorters(date = todayLocalISO(), shift = currentShift()) {
  return onDutyStaff({ role: 'porteiro', date, shift });
}
function availableStaffByRole(roleList, date = todayLocalISO()) {
  const roles = Array.isArray(roleList) ? roleList : [roleList];
  return getStaff().filter((item) => roles.includes(item.role) && staffAvailable(item, date));
}
function recipientHintForTarget(target) {
  if (target === 'portaria') {
    const shift = currentShift();
    const list = isResident() ? onDutyPorters(todayLocalISO(), shift) : availableStaffByRole('porteiro');
    if (!list.length) return `Nenhum porteiro disponível no turno ${shift}. O envio fica bloqueado até haver escala ativa.`;
    return `Destinatário disponível: ${list.map((p) => p.name).join(', ')} • turno ${shift}.`;
  }
  const admins = availableStaffByRole(['sindico', 'subsindico']);
  if (!admins.length) return 'Nenhum síndico/subsíndico disponível para receber mensagens.';
  return `Destinatário(s) disponível(is): ${admins.map((p) => `${p.name} (${roleLabel(p.role)})`).join(', ')}.`;
}

function roleLabel(role) {
  return { sindico: 'Síndico', subsindico: 'Subsíndico', porteiro: 'Porteiro' }[role] || role || '-';
}
function activeStaffFor(target) {
  if (target === 'sindico') return availableStaffByRole(['sindico', 'subsindico']);
  if (target === 'portaria') {
    if (isResident()) return onDutyPorters(todayLocalISO(), currentShift());
    return availableStaffByRole('porteiro');
  }
  return getStaff().filter((item) => staffAvailable(item));
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
      status: data.get('status') || 'disponivel',
      awayFrom: data.get('awayFrom') || '',
      awayTo: data.get('awayTo') || '',
      notes: data.get('notes').trim(),
      canManageSchedule: Boolean(data.get('canManageSchedule')),
      createdAt: nowISO(),
    };
    saveStaff([item, ...getStaff()]);
    form.reset();
    form.active.checked = true;
    if (form.status) form.status.value = 'disponivel';
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
          <div class="item-title">${escapeHTML(item.name)} <span class="badge">${escapeHTML(roleLabel(item.role))}</span> ${item.active === false ? '<span class="badge badge--danger">Inativo</span>' : '<span class="badge badge--approved">Ativo</span>'} <span class="status status--${staffStatusClass(item.status)}">${escapeHTML(staffStatusLabel(item.status))}</span></div>
          <div class="item-sub">E-mail: ${escapeHTML(item.email || 'não informado')} • WhatsApp: ${escapeHTML(item.whatsapp || 'não informado')}</div>
          ${(item.awayFrom || item.awayTo) ? `<div class="item-sub">Período informado: ${escapeHTML(item.awayFrom || '-')} até ${escapeHTML(item.awayTo || '-')}</div>` : ''}
          ${!staffAvailable(item) ? `<div class="item-sub"><strong>Bloqueado para mensagens automáticas enquanto estiver ${escapeHTML(staffStatusLabel(item.status).toLowerCase())}.</strong></div>` : ''}
          ${item.canManageSchedule ? `<div class="item-sub"><strong>Autorizado a alterar escala.</strong></div>` : ''}
          ${item.notes ? `<div class="item-sub">${escapeHTML(item.notes)}</div>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn--outline btn--sm" data-edit-staff="${item.id}">Editar</button>
        <button class="btn btn--danger btn--sm" data-remove-staff="${item.id}">Excluir</button>
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
  const status = prompt('Situação (disponivel, afastado, ausente ou ferias):', item.status || 'disponivel') ?? item.status;
  const awayFrom = prompt('Início do afastamento/ausência/férias (AAAA-MM-DD), se houver:', item.awayFrom || '') ?? item.awayFrom;
  const awayTo = prompt('Fim do afastamento/ausência/férias (AAAA-MM-DD), se houver:', item.awayTo || '') ?? item.awayTo;
  const notes = prompt('Observações:', item.notes || '') ?? item.notes;
  const canManageSchedule = confirm('Autorizar este usuário a alterar a escala?');
  const active = confirm('Manter este cadastro ativo? Clique em Cancelar para inativar/excluir do recebimento.');
  saveStaff(getStaff().map((staff) => staff.id === id ? { ...staff, name: name.trim(), role: String(role || item.role).trim(), email: String(email || '').trim(), whatsapp: String(whatsapp || '').trim(), status: String(status || 'disponivel').trim(), awayFrom: String(awayFrom || '').trim(), awayTo: String(awayTo || '').trim(), notes: String(notes || '').trim(), canManageSchedule, active, updatedAt: nowISO() } : staff));
  logActivity('Alterou cadastro de equipe', { entityId: id, summary: `Cadastro de ${name} alterado`, role, canManageSchedule }, 'equipe');
  fillStaffScheduleSelects(); renderAll();
}
function removeStaff(id) {
  if (!isSyndic()) return;
  if (!confirm('Remover este cadastro de equipe?')) return;
  const person = getStaff().find((item) => item.id === id);
  saveStaff(getStaff().filter((item) => item.id !== id));
  saveStaffSchedules(getStaffSchedules().filter((item) => item.staffId !== id));
  if (person) logActivity('Excluiu cadastro de equipe', { entityId: id, summary: `Equipe removida: ${person.name}`, role: person.role }, 'equipe');
  fillStaffScheduleSelects(); renderAll();
}

function fillStaffScheduleSelects() {
  const options = getStaff()
    .filter((item) => item.active !== false)
    .sort((a, b) => String(a.role).localeCompare(String(b.role)) || String(a.name).localeCompare(String(b.name)))
    .map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} — ${escapeHTML(roleLabel(item.role))}${staffAvailable(item) ? '' : ' — indisponível'}</option>`)
    .join('');
  $$('[data-schedule-staff-select]').forEach((select) => { select.innerHTML = options || '<option value="">Cadastre a equipe primeiro</option>'; });
}

function parseDateListFromScheduleForm(data) {
  const dates = new Set();
  const start = String(data.get('date') || '').trim();
  const end = String(data.get('dateEnd') || '').trim();
  if (start) dates.add(start);
  if (start && end && end >= start) {
    const d = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (d <= last) { dates.add(toISODate(d)); d.setDate(d.getDate() + 1); }
  }
  String(data.get('datesBulk') || '').split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).forEach((item) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item)) dates.add(item);
  });
  return Array.from(dates).sort();
}
function scheduleRecordFor(person, date, shift, notes = '') {
  return { id: uid('schedule'), staffId: person.id, staffName: person.name, staffRole: person.role, date, shift, notes, createdAt: nowISO(), createdBy: session?.email || '' };
}
async function logActivity(action, details = {}, entityType = '') {
  if (!backendAvailable || !['portaria', 'sindico'].includes(currentRole())) return;
  const safeDetails = sanitizeDetailsForLog(details);
  const payload = { action, entityType, entityId: safeDetails.id || safeDetails.entityId || '', apartment: safeDetails.apartment || '', summary: safeDetails.summary || '', details: safeDetails };
  try { await apiRequest('/api/activity-logs', { method: 'POST', body: JSON.stringify(payload) }); }
  catch (error) { console.warn('Não foi possível registrar log de atividade:', error.message); }
}
function logScheduleChange(action, details = {}) { return logActivity(action, details, 'escala'); }
function setupStaffSchedules() {
  const form = $('[data-staff-schedule-form]');
  if (!form) return;
  const dateField = $('[data-schedule-date-filter]');
  const formDate = form.querySelector('[name="date"]');
  if (formDate && !formDate.value) formDate.value = todayLocalISO();
  if (dateField && !dateField.value) dateField.value = scheduleFilterDate;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canManageSchedule()) { $('[data-schedule-message]').textContent = 'Você não tem permissão para alterar a escala.'; return; }
    const data = new FormData(form);
    const staffId = data.get('staffId');
    const person = getStaff().find((item) => item.id === staffId);
    if (!person) { $('[data-schedule-message]').textContent = 'Selecione um funcionário cadastrado.'; return; }
    const dates = parseDateListFromScheduleForm(data);
    if (!dates.length) { $('[data-schedule-message]').textContent = 'Informe pelo menos uma data.'; return; }
    const shift = data.get('shift');
    const notes = data.get('notes')?.trim() || '';
    const existing = getStaffSchedules();
    const newSchedules = [];
    const skipped = [];
    for (const date of dates) {
      const duplicate = existing.some((item) => item.staffId === staffId && item.date === date && item.shift === shift);
      if (duplicate) { skipped.push(date); continue; }
      newSchedules.push(scheduleRecordFor(person, date, shift, notes));
    }
    if (!newSchedules.length) { $('[data-schedule-message]').textContent = 'Nenhum turno novo incluído; todos já existiam.'; return; }
    saveStaffSchedules([...newSchedules, ...existing]);
    await logScheduleChange('Incluiu turno(s) na escala', { summary: `${person.name} incluído em ${newSchedules.length} turno(s)`, staffId, staffName: person.name, shift, dates: newSchedules.map((i) => i.date), skipped });
    $('[data-schedule-message]').textContent = `Escala salva: ${newSchedules.length} turno(s) incluído(s). ${skipped.length ? `${skipped.length} duplicado(s) ignorado(s).` : ''}`;
    form.reset();
    if (formDate) formDate.value = dates[0] || todayLocalISO();
    renderAll();
  });
  dateField?.addEventListener('change', () => { scheduleFilterDate = dateField.value || todayLocalISO(); renderStaffSchedules(); });
  $('[data-import-schedule-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importScheduleFile(file); }
    catch (error) { $('[data-schedule-message]').textContent = `Erro ao importar escala: ${error.message}`; }
    finally { event.target.value = ''; }
  });
}
function renderStaffSchedules() {
  fillStaffScheduleSelects();
  const filter = $('[data-schedule-date-filter]');
  if (filter && !filter.value) filter.value = scheduleFilterDate;
  const date = filter?.value || scheduleFilterDate || todayLocalISO();
  const box = $('[data-staff-schedule-list]');
  if (!box) return;
  const canEditScale = canManageSchedule();
  const form = $('[data-staff-schedule-form]');
  if (form) form.classList.toggle('is-readonly', !canEditScale);
  if (!canEditScale) { box.innerHTML = empty('A escala é visível, mas apenas o síndico ou o funcionário autorizado pelo síndico pode alterar.'); }
  const staff = getStaff();
  const list = getStaffSchedules()
    .filter((item) => item.date === date)
    .sort((a, b) => shiftOrder(a.shift) - shiftOrder(b.shift) || String(a.staffName).localeCompare(String(b.staffName)));
  const currentBox = $('[data-current-shift-summary]');
  if (currentBox) {
    const shift = currentShift();
    const porters = onDutyPorters(todayLocalISO(), shift);
    currentBox.innerHTML = `<strong>Agora: turno ${escapeHTML(shift)}</strong><br>${porters.length ? `Porteiro em atendimento: ${porters.map((p) => escapeHTML(p.name)).join(', ')}` : 'Nenhum porteiro disponível/escalado para o turno atual.'}`;
  }
  box.innerHTML = list.length ? list.map((item) => {
    const person = staff.find((s) => s.id === item.staffId) || {};
    const available = staffAvailable(person, item.date);
    return `<div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHTML(item.shift)} • ${escapeHTML(item.staffName || person.name || 'Equipe')} <span class="badge">${escapeHTML(roleLabel(item.staffRole || person.role))}</span></div>
          <div class="item-sub">${available ? 'Disponível para atendimento/mensagens' : `Indisponível: ${escapeHTML(staffStatusLabel(person.status).toLowerCase())}`} ${item.notes ? `• ${escapeHTML(item.notes)}` : ''}</div>
        </div>
        ${canEditScale ? `<button class="btn btn--danger btn--sm" data-remove-staff-schedule="${item.id}">Excluir turno</button>` : ''}
      </div>
    </div>`;
  }).join('') : empty('Nenhum turno cadastrado para a data selecionada.');
}
function removeStaffSchedule(id) {
  if (!canManageSchedule()) return;
  if (!confirm('Excluir este turno da escala?')) return;
  const removed = getStaffSchedules().find((item) => item.id === id);
  saveStaffSchedules(getStaffSchedules().filter((item) => item.id !== id));
  if (removed) logScheduleChange('Excluiu turno da escala', { ...removed, summary: `${removed.staffName} removido do turno ${removed.shift} em ${removed.date}` });
  renderAll();
}
function parseScheduleCSV(text = '') {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(separator).map((h) => normalizeText(h).replace(/\s+/g, ''));
  const idx = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);
  const dateIndex = idx(['data', 'date']);
  const shiftIndex = idx(['turno', 'shift']);
  const emailIndex = idx(['email', 'e-mail']);
  const nameIndex = idx(['nome', 'funcionario', 'funcionário', 'porteiro']);
  const notesIndex = idx(['observacoes', 'observações', 'notas', 'notes']);
  if (dateIndex < 0 || shiftIndex < 0 || (emailIndex < 0 && nameIndex < 0)) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(separator).map((c) => c.trim());
    return { date: cols[dateIndex] || '', shift: cols[shiftIndex] || '', email: emailIndex >= 0 ? cols[emailIndex] : '', name: nameIndex >= 0 ? cols[nameIndex] : '', notes: notesIndex >= 0 ? cols[notesIndex] : '' };
  }).filter((row) => row.date && row.shift && (row.email || row.name));
}



async function importScheduleFile(file) {
  if (!canManageSchedule()) throw new Error('Você não tem permissão para importar escala.');
  const text = await readFileAsText(file);
  const rows = parseScheduleCSV(text);
  if (!rows.length) throw new Error('Arquivo inválido. Use as colunas: data;turno;email;observacoes ou data;turno;nome;observacoes.');
  const staff = getStaff();
  const existing = getStaffSchedules();
  const created = [];
  const ignored = [];
  for (const row of rows) {
    const person = staff.find((item) => (row.email && normalizeEmail(item.email) === normalizeEmail(row.email)) || (row.name && normalizeText(item.name) === normalizeText(row.name)));
    if (!person) { ignored.push({ ...row, reason: 'funcionário não encontrado' }); continue; }
    const duplicate = existing.concat(created).some((item) => item.staffId === person.id && item.date === row.date && item.shift === row.shift);
    if (duplicate) { ignored.push({ ...row, reason: 'duplicado' }); continue; }
    created.push(scheduleRecordFor(person, row.date, row.shift, row.notes || `Importado de ${file.name}`));
  }
  if (!created.length) throw new Error('Nenhum turno novo importado. Verifique funcionários, datas e duplicidades.');
  saveStaffSchedules([...created, ...existing]);
  await logScheduleChange('Importou escala de arquivo', { summary: `${created.length} turno(s) importado(s) de ${file.name}`, fileName: file.name, created: created.length, ignored });
  $('[data-schedule-message]').textContent = `Importação concluída: ${created.length} turno(s) incluído(s), ${ignored.length} ignorado(s).`;
  renderAll();
}
function downloadScheduleTemplate() {
  const content = ['data;turno;email;observacoes', `${todayLocalISO()};Manhã;porteiro@email.com;Turno normal`, `${addDaysISO(todayLocalISO(), 1)};Tarde;porteiro@email.com;Cobertura`, `${addDaysISO(todayLocalISO(), 2)};Noite;porteiro@email.com;Plantão`].join('\n');
  downloadTextFile('modelo-importacao-escala-vitoria-regia.csv', content, 'text/csv;charset=utf-8');
}
function exportScheduleICS() {
  const events = getStaffSchedules().map((item) => {
    const [start, end] = shiftTimes(item.shift);
    return { uid: item.id, date: item.date, start, end, summary: `Escala: ${item.staffName} (${item.shift})`, location: getSettings().condominiumName, description: `${roleLabel(item.staffRole)} - ${item.notes || ''}` };
  });
  if (!events.length) { alert('Não há escala para exportar.'); return; }
  downloadTextFile('escala-equipe-vitoria-regia.ics', makeICS(events), 'text/calendar;charset=utf-8');
}


function setupContactCenter() {
  const form = $('[data-contact-form]');
  form?.querySelector('[name="target"]')?.addEventListener('change', () => renderContactCenter());
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const target = data.get('target');
    const channel = data.get('channel');
    const recipients = activeStaffFor(target);
    if (!recipients.length) { $('[data-contact-message]').textContent = recipientHintForTarget(target); renderContactCenter(); return; }
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
  const info = $('[data-current-contact-recipients]');
  const form = $('[data-contact-form]');
  const target = form ? (new FormData(form).get('target') || 'sindico') : 'sindico';
  if (info) {
    const recipients = activeStaffFor(target);
    info.innerHTML = recipients.length
      ? `<div class="item"><div class="item-title">${escapeHTML(recipientHintForTarget(target))}</div><div class="item-sub">O morador não visualiza e-mail nem WhatsApp dos destinatários.</div></div>`
      : `<div class="empty-state">${escapeHTML(recipientHintForTarget(target))}</div>`;
  }
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
      let extra = '';
      try {
        const debug = await apiRequest('/api/integrations/whatsapp/debug');
        const problems = debug?.whatsapp?.problems || [];
        if (problems.length) extra = ` | Diagnóstico: ${problems.join(' ')}`;
      } catch (_) {}
      msg.textContent = `Erro no teste de WhatsApp: ${error.message}${extra}`;
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
  if (form.whatsappProvider) form.whatsappProvider.value = whatsapp.provider || 'meta';
  form.whatsappApiVersion.value = whatsapp.apiVersion || 'v20.0';
  form.whatsappPhoneNumberId.value = whatsapp.phoneNumberId || '';
  form.whatsappToken.value = '';
  form.whatsappToken.placeholder = whatsapp.tokenSaved ? 'Token Meta salvo — deixe em branco para manter' : 'Token da Meta';
  form.whatsappCountryCode.value = whatsapp.countryCode || '55';
  const evolution = whatsapp.evolution || {};
  if (form.evolutionApiUrl) form.evolutionApiUrl.value = evolution.serverUrl || '';
  if (form.evolutionInstanceName) form.evolutionInstanceName.value = evolution.instanceName || '';
  if (form.evolutionApiKey) {
    form.evolutionApiKey.value = '';
    form.evolutionApiKey.placeholder = evolution.apiKeySaved ? 'API Key salva — deixe em branco para manter' : 'API Key da Evolution';
  }
  if (form.evolutionCountryCode) form.evolutionCountryCode.value = evolution.countryCode || whatsapp.countryCode || '55';
  if (form.evolutionLinkPreview) form.evolutionLinkPreview.checked = Boolean(evolution.linkPreview);
  if (form.testWhatsappTo) form.testWhatsappTo.value = evolution.testTo || whatsapp.testTo || '';
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
      <div><strong>WhatsApp:</strong> ${whatsapp.enabled ? 'ativado' : 'desativado'} • provedor: ${escapeHTML(whatsapp.provider || 'meta')} ${whatsapp.provider === 'evolution' ? (whatsapp.evolution?.apiKeySaved ? '• API Key Evolution salva' : '• API Key Evolution não salva') : (whatsapp.tokenSaved ? '• token Meta salvo' : '• token Meta não salvo')}</div>
      <div><strong>Asaas:</strong> ${asaas.enabled ? 'ativado' : 'desativado'} • ${escapeHTML(asaas.environment || 'sandbox')} ${asaas.apiKeySaved ? '• API Key salva' : '• API Key não salva'}</div>
      <div><small>Para funcionar em produção, o backend precisa estar rodando com banco inicializado e as credenciais corretas.</small></div>`;
  }
}

async function notifyVisitorById(id, channels) {
  const visitor = getVisitors().find((item) => item.id === id);
  const resident = visitor ? approvedResidentByApartment(visitor.apartment) : null;
  if (!visitor || !resident) { alert('Visitante ou morador não encontrado.'); return; }
  const response = await notifyResidentEntity(resident, 'Visitante registrado — Condomínio Vitória Régia', visitorMessage(visitor, resident), channels);
  logPortariaActivity(`Enviou aviso de visitante por ${channels.join('/')}`, { ...visitor, summary: `Aviso sobre visitante ${visitor.name} enviado para unidade ${visitor.apartment}` }, 'visitante');
  alert(`Notificação: ${resultSummary(response)}`);
}

async function notifyPackageById(id, channels) {
  const pkg = getPackages().find((item) => item.id === id);
  const resident = pkg ? approvedResidentByApartment(pkg.apartment) : null;
  if (!pkg || !resident) { alert('Encomenda ou morador não encontrado.'); return; }
  const response = await notifyResidentEntity(resident, 'Encomenda na portaria — Condomínio Vitória Régia', packageMessage(pkg), channels);
  logPortariaActivity(`Enviou aviso de encomenda por ${channels.join('/')}`, { ...pkg, summary: `Aviso de encomenda enviado para unidade ${pkg.apartment}` }, 'encomenda');
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
  return '';
}
async function fileMeta(file) {
  if (!file || !file.size) return null;
  return { name: file.name, type: file.type, size: file.size, uploadedAt: nowISO(), storage: 'metadata-only', note: 'Arquivo/foto não foi salvo no banco de dados.' };
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
    ['data-remove-visitor', (id) => { const v = getVisitors().find((item) => item.id === id); saveVisitors(getVisitors().filter((item) => item.id !== id)); if (v) logPortariaActivity('Removeu visitante', { ...v, summary: `Visitante ${v.name} removido da unidade ${v.apartment}` }, 'visitante'); renderAll(); }],
    ['data-deliver-package', deliverPackage], ['data-remove-notice', (id) => { saveNotices(getNotices().filter((item) => item.id !== id)); renderAll(); }],
    ['data-remove-space', removeSpace],
    ['data-auto-visitor-whatsapp', (id) => notifyVisitorById(id, ['whatsapp'])], ['data-auto-visitor-email', (id) => notifyVisitorById(id, ['email'])],
    ['data-auto-package-whatsapp', (id) => notifyPackageById(id, ['whatsapp'])], ['data-auto-package-email', (id) => notifyPackageById(id, ['email'])],
    ['data-auto-resident-whatsapp', (id) => notifyResidentById(id, ['whatsapp'])], ['data-auto-resident-email', (id) => notifyResidentById(id, ['email'])],
    ['data-edit-staff', editStaff], ['data-remove-staff', removeStaff], ['data-remove-staff-schedule', removeStaffSchedule],
    ['data-edit-service', editService], ['data-remove-service', removeService],
    ['data-approve-service-request', (id) => updateServiceRequest(id, 'approved')], ['data-cancel-service-request', (id) => updateServiceRequest(id, 'canceled')],
    ['data-refresh-activity-logs', async () => { await renderActivityLogs(true); }], ['data-export-activity-logs', exportActivityLogsCSV],
    ['data-print-guests', printGuestList], ['data-export-guests', exportGuestListCSV],
    ['data-export-calendar-google', exportReservationsICS], ['data-export-schedule-google', exportScheduleICS], ['data-download-schedule-template', downloadScheduleTemplate],
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
  if (target.matches('[data-activity-log-search]')) renderActivityLogsFromCache();
  if (target.matches('[data-schedule-date-filter]')) { scheduleFilterDate = target.value || todayLocalISO(); renderStaffSchedules(); }
}

function setupPrint() { $('[data-print-boleto]')?.addEventListener('click', () => window.print()); }

async function init() {
  await loadBackendState();
  if (!backendAvailable && REQUIRE_BACKEND) {
    clearAppLocalCache();
    showBackendRequiredBanner();
    console.error('Backend/banco indisponível: o sistema operacional exige Render Web Service com PostgreSQL configurado.');
  }
  if (!read(keys.settings, null)) write(keys.settings, defaultSettings);
  fillApartmentSelects();
  fillSpaceSelects();
  fillServiceSelects();
  fillStaffScheduleSelects();
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
  setupStaffSchedules();
  setupContactCenter();
  setupServices();
  setupSettings();
  if (backendAvailable) { await loadNotificationConfig(); await loadAsaasConfig(); }
  setupPrint();
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('change', handleDocumentChange);
  document.addEventListener('input', (event) => { if (event.target.matches('[data-activity-log-search]')) renderActivityLogsFromCache(); });
  const url = new URL(window.location.href);
  const authError = url.searchParams.get('authError');
  const serverUser = await getBackendSession();
  if (backendAvailable && serverUser?.role) {
    cleanAuthQueryParams();
    startSession(serverUser);
    return;
  }
  const saved = read(keys.session, null);
  if (backendAvailable && saved?.role) {
    try {
      const result = await createBackendSession(saved);
      startSession(result?.user || saved);
    } catch {
      endSession();
    }
  } else {
    endSession();
  }
  if (authError) {
    const message = $('[data-login-message]');
    if (message) message.textContent = authError;
    cleanAuthQueryParams();
  }
}

document.addEventListener('DOMContentLoaded', init);
