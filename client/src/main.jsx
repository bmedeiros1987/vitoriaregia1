import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home, Users, Package, DoorOpen, FileText, AlertTriangle, Settings, Bell, ShieldCheck, LogOut, Menu,
  X, Search, Plus, Save, Camera, ScanLine, Send, CheckCircle2, Smartphone, Building2, Palette,
  Moon, Sun, Mail, Siren, KeyRound, UserPlus, Eye, EyeOff, Lock, Megaphone, CalendarDays,
  WalletCards, Wrench, Activity, Download, Crown, Phone, AppWindow, UploadCloud, PanelLeft,
  Clock3, MessageCircle, BriefcaseBusiness, CalendarPlus, UserCheck, CloudSun, BadgeDollarSign,
  FileSignature, ClipboardList, MapPin, RefreshCcw, ShieldAlert, ChevronLeft, ChevronRight
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '';
const VERSION = import.meta.env.VITE_APP_VERSION || 'Vitória Régia Pro v9.7';
const demoMode = new URLSearchParams(location.search).get('demo') === '1';

const defaultSettings = {
  THEME_ACCENT: '#126b5f', MENU_ORIENTATION: 'vertical', UI_DENSITY: 'comfort', APPEARANCE: 'light',
  CONDO_NAME: 'Condomínio Vitória Régia', CONDO_ADDRESS: '', WEATHER_CITY: 'João Pessoa', WEATHER_LAT: '-7.1195', WEATHER_LON: '-34.8450',
  ELEVATOR_OPERATOR_NAME: 'Operadora do elevador', ELEVATOR_EMERGENCY_PHONE: '',
  DELIVERY_DEFAULT_CHANNELS: '{"app":true,"browser":true,"email":true,"telegram":false,"whatsapp":false}',
  RESERVATION_DEFAULT_RULES: 'Declaro que li e aceito as normas de uso do espaço comum.',
  RESERVATION_MAX_GUESTS_DEFAULT: '30', RESERVATION_COUNT_CHILDREN: 'true', RESERVATION_COUNT_INFANTS: 'false',
  APK_BASE_URL: 'https://vitoriaregia1.onrender.com', APK_PORTARIA_URL: '', APK_SINDICO_URL: '', APK_MORADOR_URL: '',
  ENABLE_EMAIL: 'true', ENABLE_TELEGRAM: 'false', ENABLE_WHATSAPP: 'false', ENABLE_BROWSER_PUSH: 'true',
  ENABLE_APP_PORTARIA: 'true', ENABLE_APP_SINDICO: 'true', ENABLE_APP_MORADOR: 'true',
  REGISTRATION_REQUIRE_EMAIL: 'true', REGISTRATION_REQUIRE_WHATSAPP: 'false', REGISTRATION_REQUIRE_TELEGRAM: 'false',
  BANK_PROVIDER: 'manual', BANK_API_BASE_URL: '', BANK_CLIENT_ID: '', BANK_ACCOUNT: '', BANK_AGENCY: '', BANK_WALLET: '', BANK_CONTRACT: '', BANK_PIX_KEY: '', BOLETO_AUTO_GENERATE: 'false',
  ENABLE_SYSTEM_UPDATES: 'true', UPDATE_CHANNEL: 'stable', UPDATE_FEED_URL: '', UPDATE_APPLY_MODE: 'github', UPDATE_GITHUB_REPO: 'bmedeiros1987/vitoriaregia1', UPDATE_GITHUB_BRANCH: 'main'
};

const permissionGroups = [
  { title: 'Moradores e usuários', items: [['residents.view', 'Ver moradores'], ['residents.manage', 'Cadastrar moradores'], ['users.manage', 'Gerenciar usuários']] },
  { title: 'Portaria', items: [['packages.view', 'Ver encomendas'], ['packages.manage', 'Cadastrar encomendas'], ['visitors.view', 'Ver visitantes'], ['visitors.manage', 'Gerenciar visitantes']] },
  { title: 'Reservas e financeiro', items: [['reservations.view', 'Ver reservas'], ['reservations.manage', 'Gerenciar reservas'], ['finance.view', 'Ver financeiro'], ['finance.manage', 'Gerenciar financeiro'], ['boletos.manage', 'Vincular boletos']] },
  { title: 'Equipe', items: [['employees.manage', 'Funcionários'], ['shifts.manage', 'Escalas'], ['messages.view', 'Ver mensagens'], ['messages.manage', 'Responder mensagens']] },
  { title: 'Administração', items: [['settings.manage', 'Configurações'], ['platform.manage', 'Liberações do sistema'], ['bank.manage', 'Banco e boletos'], ['system.update', 'Atualizações'], ['audit.view', 'Auditoria'], ['emergency.approve', 'Aprovar emergências']] }
];
const allPermissions = permissionGroups.flatMap(g => g.items.map(i => i[0]));
const roleDefaultPermissions = {
  master: Object.fromEntries([...allPermissions, 'dashboard.view', 'apps.view', 'emergency.use', 'notices.view', 'notices.manage', 'invoices.view', 'invoices.manage', 'incidents.view', 'incidents.manage', 'maintenance.view', 'maintenance.manage'].map(p => [p, true])),
  sindico: Object.fromEntries([...allPermissions, 'dashboard.view', 'apps.view', 'emergency.use', 'notices.view', 'notices.manage', 'invoices.view', 'invoices.manage', 'incidents.view', 'incidents.manage', 'maintenance.view', 'maintenance.manage'].map(p => [p, true])),
  portaria: { 'dashboard.view': true, 'residents.view': true, 'packages.view': true, 'packages.manage': true, 'visitors.view': true, 'visitors.manage': true, 'reservations.view': true, 'messages.view': true, 'messages.manage': true, 'emergency.use': true, 'emergency.approve': true, 'apps.view': true },
  funcionario: { 'dashboard.view': true, 'messages.view': true, 'messages.manage': true, 'incidents.view': true, 'maintenance.view': true, 'emergency.use': true, 'apps.view': true },
  financeiro: { 'dashboard.view': true, 'finance.view': true, 'finance.manage': true, 'boletos.manage': true, 'reservations.view': true, 'apps.view': true },
  morador: { 'dashboard.view': true, 'packages.view': true, 'visitors.view': true, 'reservations.view': true, 'reservations.manage': true, 'finance.view': true, 'notices.view': true, 'messages.manage': true, 'emergency.use': true, 'apps.view': true }
};
const weekDays = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']];
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (v) => v ? new Date(String(v)).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-';
const todayISO = () => new Date().toISOString().slice(0, 10);

const asBool = (v, fallback=false) => v === undefined || v === null || v === '' ? fallback : ['1','true','sim','yes','on','ativo','liberado'].includes(String(v).trim().toLowerCase());
function enabledChannels(settings = {}) {
  return {
    app: true,
    browser: asBool(settings.ENABLE_BROWSER_PUSH, true),
    email: asBool(settings.ENABLE_EMAIL, true),
    telegram: asBool(settings.ENABLE_TELEGRAM, false),
    whatsapp: asBool(settings.ENABLE_WHATSAPP, false)
  };
}
function appEnabled(settings = {}, key) { return asBool(settings[key], true); }
function channelLabel(k) { return ({ app:'Sistema', browser:'Navegador', email:'E-mail', telegram:'Telegram', whatsapp:'WhatsApp' }[k] || k); }
const tabAliases = { usuarios:'cadastros', encomendas:'portaria', visitantes:'portaria', escalas:'portaria', boletos:'financeiro', notas:'financeiro', mensagens:'comunicacao', comunicados:'comunicacao', atualizacoes:'central', apps:'central' };
function tabFromHash() { const tab = String(location.hash || '').replace(/^#\/?/, '').replace(/^\/+/, '').split('?')[0].split('/')[0]; return tabAliases[tab] || tab; }


async function downloadIcs(id) {
  if (demoMode) {
    const blob = new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Reserva Vitória Régia\r\nEND:VEVENT\r\nEND:VCALENDAR'], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `reserva-${id}.ics`; a.click(); URL.revokeObjectURL(url); return;
  }
  const token = localStorage.getItem('vr_token');
  const res = await fetch(API + `/api/reservations/${id}/ics`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) throw new Error('Não consegui exportar o calendário.');
  const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `reserva-${id}.ics`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}


function urlBase64ToUint8Array(base64String = '') {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function request(path, opts = {}) {
  if (demoMode) return demoRequest(path, opts);
  const token = localStorage.getItem('vr_token');
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na operação');
  return data;
}
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });

function initialForms() {
  return {
    login: { email: 'admin@vitoriaregia.local', password: '123456' },
    register: { name: '', email: '', phone: '', whatsapp_phone: '', telegram_chat_id: '', unit: '', document: '', role: 'morador' },
    forgot: { email: '' },
    resident: { name: '', unit: '', phone: '', whatsapp_phone: '', email: '', document: '', vehicle: '', telegram_chat_id: '', notes: '', access_profile: 'morador', access_permissions: roleDefaultPermissions.morador, notification_preferences: { app: true, browser: true, email: true, telegram: false, whatsapp: false } },
    user: { name: '', email: '', password: '', role: 'morador', user_type: 'morador', is_outsourced: false, unit: '', phone: '', whatsapp_phone: '', telegram_chat_id: '', notification_preferences: { app:true, browser:true, email:true, telegram:false, whatsapp:false }, resident_id: '', employee_id: '', active: true, permissions: roleDefaultPermissions.morador },
    employee: { name: '', role: 'portaria', phone: '', email: '', active: true, notes: '' },
    shift: { employee_id: '', role: 'portaria', starts_at: '', ends_at: '', notes: '' },
    message: { subject: '', body: '', unit: '' },
    package: { tracking: '', recipient: '', unit: '', label: '', notes: '', extracted_text: '', photo_url: '', notification_channels: { app: true, browser: true, email: true, telegram: false, whatsapp: false } },
    invoice: { supplier: '', document_number: '', access_key: '', amount: '', issue_date: '', due_date: '', unit: '', category: 'nota fiscal', extracted_text: '' },
    visitor: { name: '', document: '', phone: '', unit: '', authorized_by: '', plate: '', recurring: false, weekdays: [], valid_from: '', valid_until: '', announce_required: true, announcement_channel: 'interfone', notification_channels: { app: true, browser: true }, photo_data: '', notes: '' },
    notice: { title: '', body: '', priority: 'normal', target_role: 'todos', target_criteria: {} },
    profile: { name: '', email: '', phone: '', whatsapp_phone: '', telegram_chat_id: '', unit: '', criteria: {}, notification_preferences: { app:true, browser:true, email:true, telegram:false, whatsapp:false }, current_password:'', new_password:'' },
    notificationTest: { channel: 'email', to: '', phone: '', chat_id: '', message: 'Mensagem de teste do sistema Vitória Régia.' },
    manualUpload: { title: '', audience: 'geral' },
    criterion: { label: '' },
    reservation: { area: 'Salão de festas', unit: '', resident: '', reserved_for: todayISO(), start_time: '19:00', end_time: '23:00', shift: 'noite', terms_accepted: false, document_text: '', fee_amount: '' },
    reservationVisitors: { reservation_id: '', bulk: '' },
    reservationGuest: { reservation_id: '', name: '', document: '', phone: '', plate: '', age_group: 'adulto', visitor_type: 'convidado', counts_as_guest: true, notes: '', photo_data: '' },
    finance: { title: '', amount: '', type: 'receita', due_date: '', unit: '', category: 'geral', generate_boleto: false, digitable_line: '', payment_link: '', bank_name: '' },
    boleto: { title: '', amount: '', due_date: '', unit: '', bank_name: '', digitable_line: '', barcode: '', pdf_url: '', payment_link: '' },
    systemUpdate: { validation_code: '', mode: 'github' },
    incident: { title: '', description: '', unit: '', severity: 'normal' },
    maintenance: { title: '', supplier: '', scheduled_for: '', cost: '', notes: '' },
    emergency: { type: 'elevador', unit: '', message: '' },
    settings: {}
  };
}

function App() {
  const appParam = new URLSearchParams(location.search).get('app');
  const [session, setSession] = useState(() => demoMode ? demoUser(appParam) : JSON.parse(localStorage.getItem('vr_user') || 'null'));
  const [forms, setForms] = useState(initialForms());
  const [showPass, setShowPass] = useState(false);
  const [loginMode, setLoginMode] = useState('login');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [active, setActive] = useState(() => tabFromHash() || (appParam === 'portaria' ? 'portaria' : appParam === 'morador' ? 'morador' : 'dashboard'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosed, setMenuClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [ocrBusy, setOcrBusy] = useState('');
  const [configTab, setConfigTab] = useState('aparencia');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [data, setData] = useState(emptyData());

  const can = (perm) => session?.role === 'master' || session?.role === 'admin' || (session?.role === 'sindico' && !['platform.manage','bank.manage'].includes(perm)) || Boolean(session?.permissions?.[perm]);
  const settings = { ...defaultSettings, ...(data.settings || {}) };
  const appearance = settings.APPEARANCE || localStorage.getItem('vr_appearance') || 'light';
  const accent = settings.THEME_ACCENT || defaultSettings.THEME_ACCENT;
  const menuMode = settings.MENU_ORIENTATION || 'vertical';

  useEffect(() => {
    document.body.dataset.appearance = appearance;
    document.body.dataset.density = settings.UI_DENSITY || 'comfort';
    document.documentElement.style.setProperty('--accent', accent);
    localStorage.setItem('vr_appearance', appearance);
  }, [appearance, accent, settings.UI_DENSITY]);

  useEffect(() => { if (session) loadAll(); else request('/api/public-config').then(s => setData(d => ({ ...d, settings: { ...d.settings, ...s } }))).catch(() => null); }, [session]);
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => null); }, []);
  useEffect(() => { const syncHash = () => { const tab = tabFromHash(); if (tab) setActive(tab); }; window.addEventListener('hashchange', syncHash); return () => window.removeEventListener('hashchange', syncHash); }, []);
  useEffect(() => { if (session) { const t = setInterval(() => safe('/api/notifications', []).then(showBrowserNotifications), 45000); return () => clearInterval(t); } }, [session]);

  async function safe(path, fallback) { try { return await request(path); } catch { return fallback; } }
  async function loadAll() {
    if (demoMode) { setData(demoData()); setForms(f => ({ ...f, settings: demoData().settings })); return; }
    const [settingsRes, dashboard, residents, users, employees, shifts, messages, packagesRes, visitors, invoices, notices, reservations, finance, boletos, commonAreas, incidents, maintenance, emergencyTypes, emergencyRequests, registrationRequests, notifications, audit, weather, systemUpdates, residentCriteria, manuals, notificationStatus] = await Promise.all([
      safe('/api/settings', defaultSettings), safe('/api/dashboard', null), safe('/api/residents', []), safe('/api/users', []), safe('/api/employees', []), safe('/api/shifts', []), safe('/api/messages', []), safe('/api/packages', []), safe('/api/visitors', []), safe('/api/invoices', []), safe('/api/notices', []), safe('/api/reservations', []), safe('/api/finance', []), safe('/api/boletos', []), safe('/api/common-areas', []), safe('/api/incidents', []), safe('/api/maintenance', []), safe('/api/emergency-types', []), safe('/api/emergency-requests', []), safe('/api/registration-requests', []), safe('/api/notifications', []), safe('/api/audit', []), safe('/api/weather', null), safe('/api/system-updates', []), safe('/api/resident-criteria', []), safe('/api/manuals', []), safe('/api/notification-config/status', null)
    ]);
    setData({ settings: settingsRes, dashboard, residents, users, employees, shifts, messages, packages: packagesRes, visitors, invoices, notices, reservations, finance, boletos, commonAreas, incidents, maintenance, emergencyTypes, emergencyRequests, registrationRequests, notifications, audit, weather, systemUpdates, updates: systemUpdates, residentCriteria, manuals, notificationStatus });
    setForms(f => ({ ...f, settings: settingsRes }));
    showBrowserNotifications(notifications);
  }
  function setForm(group, patch) { setForms(f => ({ ...f, [group]: { ...f[group], ...patch } })); }
  function notify(message, fail = false) { setToast(message); if (fail) document.body.classList.add('shake'); setTimeout(() => { setToast(''); document.body.classList.remove('shake'); }, 3400); }
  async function action(path, body, message, method = 'POST') { try { if (method === 'PUT') await put(path, body); else if (method === 'DELETE') await request(path, { method:'DELETE' }); else await post(path, body); notify(message); await loadAll(); return true; } catch (e) { notify(e.message, true); return false; } }
  async function doLogin(e) { e.preventDefault(); setErr(''); try { const result = await post('/api/login', forms.login); localStorage.setItem('vr_token', result.token); localStorage.setItem('vr_user', JSON.stringify(result.user)); setSession(result.user); notify('Login realizado com segurança'); } catch (e) { setErr(e.message); } }
  function logout() { localStorage.removeItem('vr_token'); localStorage.removeItem('vr_user'); setSession(null); }
  async function registerRequest(e) { e.preventDefault(); const ok = await action('/api/register', forms.register, 'Solicitação enviada para aprovação'); if (ok) setLoginMode('login'); }
  async function forgotPassword(e) { e.preventDefault(); await action('/api/forgot-password', forms.forgot, 'Se o e-mail existir, a senha temporária será enviada'); }
  async function enableBrowserNotifications() {
    if (!('Notification' in window)) return notify('Navegador sem suporte a notificações', true);
    const p = await Notification.requestPermission();
    if (p !== 'granted') return notify('Permissão não concedida', true);
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const { publicKey } = await safe('/api/push/vapid-public-key', { publicKey: '' });
        if (publicKey) {
          const registration = await navigator.serviceWorker.ready;
          let sub = await registration.pushManager.getSubscription();
          if (!sub) sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
          await post('/api/push/subscribe', sub.toJSON());
          return notify('Notificações push do navegador ativadas');
        }
      }
    } catch (e) { console.warn('Push do navegador indisponível:', e.message); }
    notify('Notificações do navegador ativadas enquanto o app estiver aberto');
  }
  function showBrowserNotifications(notifications = []) { if (!('Notification' in window) || Notification.permission !== 'granted') return; const seen = new Set(JSON.parse(localStorage.getItem('vr_seen_notifications') || '[]')); const next = [...seen]; notifications.filter(n => n.status === 'nova' && !seen.has(n.id)).slice(0, 3).forEach(n => { const critical=/incêndio|fogo|invasão|emergência/i.test((n.title||'') + ' ' + (n.body||'')); try { new Notification(n.title || 'Vitória Régia', { body: n.body || '', tag: 'vr-' + n.id, requireInteraction: critical, silent: false, vibrate: critical ? [1200,300,1200,300,1200] : [200,100,200] }); } catch { new Notification(n.title || 'Vitória Régia', { body: n.body || '', tag: 'vr-' + n.id }); } if (critical && navigator.vibrate) navigator.vibrate([1200,300,1200,300,1200]); next.push(n.id); }); localStorage.setItem('vr_seen_notifications', JSON.stringify(next.slice(-100))); }
  async function runOcr(file, type) { if (!file) return; setOcrBusy(type); try { const { createWorker } = await import('tesseract.js'); const worker = await createWorker('por'); const result = await worker.recognize(file); await worker.terminate(); const text = result?.data?.text || ''; const parsed = await post(type === 'package' ? '/api/ocr/parse-package' : '/api/ocr/parse-invoice', { text }); if (type === 'package') setForm('package', { tracking: parsed.tracking || forms.package.tracking, recipient: parsed.recipient || forms.package.recipient, unit: parsed.unit || forms.package.unit, label: parsed.label || forms.package.label, extracted_text: text }); else setForm('invoice', { supplier: parsed.supplier || forms.invoice.supplier, document_number: parsed.document_number || forms.invoice.document_number, access_key: parsed.access_key || forms.invoice.access_key, amount: parsed.amount || forms.invoice.amount, issue_date: parsed.issue_date || forms.invoice.issue_date, due_date: parsed.due_date || forms.invoice.due_date, extracted_text: text }); notify('leitura automática concluída. Confira os campos antes de salvar.'); } catch (e) { notify('Não consegui ler a imagem: ' + e.message, true); } finally { setOcrBusy(''); } }
  function fileToDataUrl(file, cb) { if (!file) return; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file); }

  if (!session) return <LoginScreen forms={forms} setForm={setForm} mode={loginMode} setMode={setLoginMode} doLogin={doLogin} registerRequest={registerRequest} forgotPassword={forgotPassword} err={err} showPass={showPass} setShowPass={setShowPass} settings={settings} />;

  const menuItems = [
    ['dashboard', 'Início', Home, 'dashboard.view'],
    ['perfil', 'Meu perfil', UserCheck, 'dashboard.view'],
    ['portaria', 'Portaria', DoorOpen, 'packages.view'],
    ['morador', 'Morador', Users, 'dashboard.view'],
    ['reservas', 'Reservas', CalendarDays, 'reservations.view'],
    ['financeiro', 'Financeiro', WalletCards, 'finance.view'],
    ['cadastros', 'Cadastros', ShieldCheck, 'users.manage'],
    ['comunicacao', 'Comunicação', Bell, 'notices.view'],
    ['emergencia', 'Emergência', Siren, 'emergency.use'],
    ['configuracoes', 'Configurações', Settings, 'settings.manage'],
    ['central', 'Central Pro', Crown, 'apps.view']
  ].filter(([key, , , perm]) => can(perm) && (key !== 'central' || session?.role === 'master' || appEnabled(settings,'ENABLE_APP_PORTARIA') || appEnabled(settings,'ENABLE_APP_SINDICO') || appEnabled(settings,'ENABLE_APP_MORADOR')));

  const contentProps = { data, forms, setForm, action, can, session, query, setQuery, runOcr, ocrBusy, notify, settings, enableBrowserNotifications, fileToDataUrl, calendarMonth, setCalendarMonth, loadAll };
  return <div className={`appShell menu-${menuMode} ${menuClosed ? 'menu-closed' : ''} ${menuOpen ? 'mobile-open' : ''}`}>
    <button className="mobileMenu" onClick={() => setMenuOpen(true)}><Menu /></button>
    <aside>
      <div className="brand"><div className="brandMark towerMark"><Building2 /></div><div><b>{settings.CONDO_NAME || 'Vitória Régia'}</b><small>{VERSION}</small></div><button className="insideClose" onClick={() => { setMenuOpen(false); setMenuClosed(!menuClosed); }}><X /></button></div>
      <nav>{menuItems.map(([key, label, Icon]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => { setActive(key); location.hash = '/' + key; setMenuOpen(false); }}><Icon /><span>{label}</span></button>)}</nav>
      <div className="sideBottom"><button onClick={() => setMenuClosed(!menuClosed)}><PanelLeft /><span>{menuClosed ? 'Abrir menu' : 'Recolher'}</span></button><button onClick={logout}><LogOut /><span>Sair</span></button></div>
    </aside>
    <div className="overlay" onClick={() => setMenuOpen(false)} />
    {can('emergency.use') && <button className={`floatingEmergency ${active === 'emergencia' ? 'is-open' : ''}`} onClick={() => { setActive('emergencia'); location.hash = '/emergencia'; setMenuOpen(false); }}><Siren /><span>Emergência</span></button>}
    <main className="content">
      <header className="topbar"><div><small>Olá, {session.name || session.email}</small><h1>{titleFor(active)}</h1></div><div className="topActions"><button onClick={loadAll}><RefreshCcw />Atualizar</button><button onClick={enableBrowserNotifications}><Bell />Navegador</button></div></header>
      {toast && <div className="toast">{toast}</div>}
      {active === 'perfil' && <ProfilePage {...contentProps} />}
      {active === 'dashboard' && <DashboardPage {...contentProps} setActive={setActive} />}
      {active === 'portaria' && <PortariaPage {...contentProps} />}
      {active === 'morador' && <MoradorPage {...contentProps} />}
      {active === 'reservas' && <ReservationsPage {...contentProps} />}
      {active === 'financeiro' && <FinanceiroPage {...contentProps} />}
      {active === 'cadastros' && <UsersResidentsPage {...contentProps} />}
      {active === 'comunicacao' && <CommunicationPage {...contentProps} />}
      {active === 'emergencia' && <EmergencyPage {...contentProps} />}
      {active === 'configuracoes' && <SettingsPage {...contentProps} configTab={configTab} setConfigTab={setConfigTab} />}
      {active === 'central' && <CentralProPage {...contentProps} />}
      <footer><span>{settings.CONDO_NAME}</span><span>{VERSION}</span></footer>
    </main>
  </div>;
}

function titleFor(active) { return ({ perfil: 'Meu perfil', dashboard: 'Painel inicial', portaria: 'Portaria e operação', morador: 'Área do morador', reservas: 'Calendário de reservas', financeiro: 'Financeiro e boletos', cadastros: 'Cadastros e acessos', comunicacao: 'Comunicação e notificações', emergencia: 'Emergência', configuracoes: 'Configurações', central: 'Central Pro' }[active] || 'Vitória Régia'); }

function LoginScreen({ forms, setForm, mode, setMode, doLogin, registerRequest, forgotPassword, err, showPass, setShowPass, settings }) {
  const channels = enabledChannels(settings);
  const atLeastOneExternal = channels.email || channels.whatsapp || channels.telegram;
  return <div className="loginPage"><div className="loginVisual"><div className="loginBadge"><Building2 />{settings.CONDO_NAME || 'Condomínio Vitória Régia'}</div><h1>Gestão condominial premium para portaria, síndico e moradores.</h1><p>Reservas, escalas, encomendas, leitura automática, visitantes recorrentes, notificações e financeiro em uma única plataforma.</p></div><section className="loginCard"><div className="loginTabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Cadastro</button><button className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>Esqueci a senha</button></div>{mode === 'login' && <form onSubmit={doLogin}><h2>Acesso seguro</h2><label>E-mail ou usuário<input value={forms.login.email} onChange={e => setForm('login', { email: e.target.value })} /></label><label>Senha<div className="password"><input type={showPass ? 'text' : 'password'} value={forms.login.password} onChange={e => setForm('login', { password: e.target.value })} /><button type="button" onClick={() => setShowPass(!showPass)}>{showPass ? <EyeOff /> : <Eye />}</button></div></label>{err && <p className="error">{err}</p>}<button className="primary"><Lock />Entrar</button><small>Acesse com o usuário informado na implantação. Altere a senha antes de vender.</small></form>}{mode === 'register' && <form onSubmit={registerRequest}><h2>Solicitar cadastro</h2><div className="formGrid single"><input placeholder="Nome completo" value={forms.register.name} onChange={e => setForm('register', { name: e.target.value })} />{channels.email && <input placeholder="E-mail" value={forms.register.email} onChange={e => setForm('register', { email: e.target.value })} />}{channels.whatsapp && <input placeholder="WhatsApp com DDD" value={forms.register.whatsapp_phone || forms.register.phone} onChange={e => setForm('register', { whatsapp_phone: e.target.value, phone: e.target.value })} />}{channels.telegram && <input placeholder="Telegram Chat ID" value={forms.register.telegram_chat_id} onChange={e => setForm('register', { telegram_chat_id: e.target.value })} />}<input placeholder="Unidade/apartamento" value={forms.register.unit} onChange={e => setForm('register', { unit: e.target.value })} /><input placeholder="CPF/documento" value={forms.register.document} onChange={e => setForm('register', { document: e.target.value })} />{!atLeastOneExternal && <small>Nenhum canal externo foi liberado; o síndico poderá cadastrar manualmente.</small>}<button><UserPlus />Enviar para aprovação</button></div></form>}{mode === 'forgot' && <form onSubmit={forgotPassword}><h2>Recuperar acesso</h2><label>E-mail cadastrado<input value={forms.forgot.email} onChange={e => setForm('forgot', { email: e.target.value })} /></label><button><KeyRound />Gerar senha temporária</button><small>O síndico também pode resetar a senha e enviar pelos canais liberados.</small></form>}</section></div>;
}


function ProfilePage({ data, forms, setForm, action, session, settings, loadAll }) {
  const [loaded, setLoaded] = useState(false);
  const criteria = data.residentCriteria || [];
  useEffect(() => { if (loaded) return; request('/api/profile').then(p => { const u=p.user || {}; const r=p.resident || {}; setForm('profile', { name:u.name || r.name || '', email:u.email || r.email || '', phone:u.phone || r.phone || '', whatsapp_phone:u.whatsapp_phone || r.whatsapp_phone || '', telegram_chat_id:u.telegram_chat_id || r.telegram_chat_id || '', unit:u.unit || r.unit || '', criteria: parseJsonLike(r.criteria || {}), notification_preferences: u.notification_preferences || r.notification_preferences || { app:true,browser:true,email:true,telegram:false,whatsapp:false }, current_password:'', new_password:'' }); setLoaded(true); }).catch(()=>setLoaded(true)); }, [session?.id]);
  const save = async (e) => { e.preventDefault(); const ok = await action('/api/profile', forms.profile, 'Perfil atualizado'); if (ok) loadAll?.(); };
  const changePass = async (e) => { e.preventDefault(); await action('/api/profile/change-password', { current_password: forms.profile.current_password, new_password: forms.profile.new_password }, 'Senha alterada'); };
  return <Panel title="Meu perfil" subtitle="Atualize seus dados de contato e escolha por onde deseja receber avisos do condomínio." icon={<UserCheck />}>
    <div className="split"><form className="formGrid" onSubmit={save}><label>Nome completo<input required value={forms.profile.name || ''} onChange={e => setForm('profile', { name:e.target.value })} /></label><label>E-mail<input type="email" value={forms.profile.email || ''} onChange={e => setForm('profile', { email:e.target.value })} /></label><label>Telefone<input value={forms.profile.phone || ''} onChange={e => setForm('profile', { phone:e.target.value })} /></label>{asBool(settings.ENABLE_WHATSAPP,false) && <label>WhatsApp<input value={forms.profile.whatsapp_phone || ''} onChange={e => setForm('profile', { whatsapp_phone:e.target.value })} /></label>}{asBool(settings.ENABLE_TELEGRAM,false) && <label>Telegram<input value={forms.profile.telegram_chat_id || ''} onChange={e => setForm('profile', { telegram_chat_id:e.target.value })} /></label>}<label>Unidade<input value={forms.profile.unit || ''} disabled /></label><ChannelPicker value={forms.profile.notification_preferences} onChange={v => setForm('profile', { notification_preferences:v })} settings={settings} /><div className="criteriaBox"><b>Características do cadastro</b><small>Essas opções ajudam o síndico a enviar avisos corretos para cada perfil de morador.</small>{criteria.map(c => <label className="check" key={c.key}><input type="checkbox" checked={Boolean(forms.profile.criteria?.[c.key])} onChange={e => setForm('profile', { criteria:{ ...(forms.profile.criteria||{}), [c.key]: e.target.checked } })} />{c.label}</label>)}</div><button><Save />Salvar meu perfil</button></form><form className="formGrid single" onSubmit={changePass}><h3>Alterar senha</h3><label>Senha atual<input type="password" value={forms.profile.current_password || ''} onChange={e => setForm('profile', { current_password:e.target.value })} /></label><label>Nova senha<input type="password" value={forms.profile.new_password || ''} onChange={e => setForm('profile', { new_password:e.target.value })} /></label><button><KeyRound />Alterar senha</button><small>O síndico pode gerar uma senha temporária para você, mas a senha nunca aparece para ele.</small></form></div>
  </Panel>;
}
function parseJsonLike(v) { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return {}; } }

function DashboardPage({ data, setActive, session }) {
  const m = data.dashboard?.metrics || {};
  const shortcuts = [['reservas', 'Reservar espaço', CalendarPlus], ['encomendas', 'Nova encomenda', Package], ['visitantes', 'Visitante recorrente', UserCheck], ['emergencia', 'Solicitar emergência', Siren], ['mensagens', 'Mensagem à portaria', MessageCircle], ['financeiro', 'Meu financeiro', WalletCards]];
  return <Panel title="Resumo operacional" subtitle="Indicadores alinhados, atalhos rápidos e clima atualizado pelo servidor." icon={<Home />}>
    <div className="hero"><div><span className="eyebrow">{session.role}</span><h2>Vitória Régia pronto para operação</h2><p>Controle integrado de portaria, moradores, reservas, escalas, notificações e financeiro.</p></div><WeatherCard weather={data.weather || data.dashboard?.weather} /></div>
    <div className="metricStrip aligned"><Metric icon={<Users />} label="Moradores" value={m.residents || 0} /><Metric icon={<Package />} label="Encomendas" value={m.pendingPackages || 0} sub="pendentes" /><Metric icon={<CalendarDays />} label="Reservas" value={m.reservationsPending || 0} sub="pré-agendadas" /><Metric icon={<MessageCircle />} label="Mensagens" value={m.messagesNew || 0} sub="novas" /><Metric icon={<Siren />} label="Emergências" value={m.emergencyPending || 0} sub="aprovação" /><Metric icon={<BadgeDollarSign />} label="Boletos" value={m.boletosPending || 0} sub="em aberto" /></div>
    <div className="cards shortcutCards">{shortcuts.map(([key, label, Icon]) => <article key={key} onClick={() => { setActive(key); location.hash = '/' + key; }}><Icon /><h3>{label}</h3><p>Abrir módulo</p></article>)}</div>
  </Panel>;
}
function WeatherCard({ weather }) { return <div className="weather"><CloudSun /><div><b>{weather?.temperature ?? '--'}°C</b><small>{weather?.city || 'Clima'}</small><small>Vento {weather?.wind ?? '--'} km/h · Umidade {weather?.humidity ?? '--'}%</small></div></div>; }

function PortariaPage(props) { return <div className="stack"><PackagesPage {...props} compact /><VisitorsPage {...props} compact /><ReservationsPage {...props} compact /></div>; }
function MoradorPage(props) { return <div className="stack moradorStack"><MessagesPage {...props} compact /><PackagesPage {...props} compact /><ReservationsPage {...props} compact /><FinancePage {...props} compact /></div>; }

function PackagesPage({ data, forms, setForm, action, runOcr, ocrBusy, fileToDataUrl, compact, settings }) {
  return <Panel title="Encomendas" subtitle="leitura automática, vínculo automático ao morador, código de retirada e notificação por todos os canais." icon={<Package />} compact={compact}>
    <form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/packages', forms.package, 'Encomenda cadastrada e morador notificado'); }}>
      <input placeholder="Código de rastreio" value={forms.package.tracking} onChange={e => setForm('package', { tracking: e.target.value })} />
      <input placeholder="Destinatário" value={forms.package.recipient} onChange={e => setForm('package', { recipient: e.target.value })} />
      <input placeholder="Unidade" value={forms.package.unit} onChange={e => setForm('package', { unit: e.target.value })} />
      <input placeholder="Transportadora/etiqueta" value={forms.package.label} onChange={e => setForm('package', { label: e.target.value })} />
      <label className="fileButton"><ScanLine />{ocrBusy === 'package' ? 'Lendo etiqueta...' : 'leitura automática etiqueta'}<input type="file" accept="image/*" capture="environment" onChange={e => runOcr(e.target.files?.[0], 'package')} /></label>
      <label className="fileButton"><Camera />Foto<input type="file" accept="image/*" capture="environment" onChange={e => fileToDataUrl(e.target.files?.[0], url => setForm('package', { photo_url: url }))} /></label>
      <ChannelPicker value={forms.package.notification_channels} onChange={v => setForm('package', { notification_channels: v })} settings={settings} />
      <textarea placeholder="Observações" value={forms.package.notes} onChange={e => setForm('package', { notes: e.target.value })} />
      <button><Plus />Cadastrar e notificar</button>
    </form>
    <Table rows={data.packages} render={p => <><td><b>{p.tracking}</b><small>{p.recipient} · Unidade {p.unit}</small></td><td><Code>{p.pickup_code || '-'}</Code></td><td><Status ok={p.status === 'entregue'}>{p.status}</Status><small>{p.delivery_preference}</small></td><td className="actions"><button onClick={() => action(`/api/packages/${p.id}/preference`, { delivery_preference: 'receber_elevador' }, 'Preferência registrada')}>Elevador</button><button onClick={() => action(`/api/packages/${p.id}/preference`, { delivery_preference: 'retirar_portaria' }, 'Preferência registrada')}>Buscar</button><button onClick={() => action(`/api/packages/${p.id}/deliver`, {}, 'Encomenda entregue')}>Entregar</button></td></>} />
  </Panel>;
}


function reservationStatusLabel(status='') {
  return ({ pre_agendada:'Pré-agendada', pendente_pagamento:'Pendente pagamento', pendente_aceite_regras:'Pendente aceite das regras', confirmada:'Confirmada', cancelada:'Cancelada' }[status] || status || 'pré-agendada');
}
function ReservationsPage({ data, forms, setForm, action, calendarMonth, setCalendarMonth, compact, settings, fileToDataUrl }) {
  const [selected, setSelected] = useState('');
  const areas = data.commonAreas || [];
  const area = areas.find(a => a.name === forms.reservation.area) || areas[0] || {};
  const maxGuests = Number(area.max_guests || settings?.RESERVATION_MAX_GUESTS_DEFAULT || 30);
  const rules = forms.reservation.document_text || area?.rules_document || data.settings.RESERVATION_DEFAULT_RULES || '';
  useEffect(() => { if (area?.name && !forms.reservation.area) setForm('reservation', { area: area.name }); }, [area?.name]);
  useEffect(() => { if (area?.name) setForm('reservation', { fee_amount: area.fee_amount, document_text: area.rules_document || rules }); }, [forms.reservation.area]);
  const submitReservation = async (e) => {
    e.preventDefault();
    const ok = await action('/api/reservations', { ...forms.reservation, terms_accepted: Boolean(forms.reservation.terms_accepted) }, 'Reserva criada, data bloqueada e morador notificado');
    if (ok) setForm('reservation', { terms_accepted: false });
  };
  return <Panel title="Reservas" subtitle="Calendário, taxa, boleto interno, aceite digital, convidados e avisos automáticos por e-mail/notificação." icon={<CalendarDays />} compact={compact}>
    <Calendar reservations={data.reservations} month={calendarMonth} setMonth={setCalendarMonth} onPick={d => setForm('reservation', { reserved_for: d })} />
    <form className="formGrid reservationForm" onSubmit={submitReservation}>
      <label>Espaço comum<select required value={forms.reservation.area} onChange={e => setForm('reservation', { area: e.target.value })}>{areas.map(a => <option key={a.id || a.name}>{a.name}</option>)}</select></label>
      <label>Unidade<input required placeholder="Ex.: 101" value={forms.reservation.unit} onChange={e => setForm('reservation', { unit: e.target.value })} /></label>
      <label>Morador responsável<input required placeholder="Nome do morador" value={forms.reservation.resident} onChange={e => setForm('reservation', { resident: e.target.value })} /></label>
      <label>Data<input required type="date" value={forms.reservation.reserved_for} onChange={e => setForm('reservation', { reserved_for: e.target.value })} /></label>
      <label>Início<input required type="time" value={forms.reservation.start_time} onChange={e => setForm('reservation', { start_time: e.target.value })} /></label>
      <label>Término<input required type="time" value={forms.reservation.end_time} onChange={e => setForm('reservation', { end_time: e.target.value })} /></label>
      <div className="terms"><FileSignature /><span>{rules}</span><label><input required type="checkbox" checked={forms.reservation.terms_accepted} onChange={e => setForm('reservation', { terms_accepted: e.target.checked })} />Li e aceito digitalmente as normas do espaço</label></div>
      <div className="noticeBox reservationRules"><b>Fluxo automático</b><small>Ao salvar, o morador recebe e-mail/notificação. Se houver taxa, o sistema marca como pendente pagamento e gera cobrança. Se faltar aceite, marca como pendente aceite das regras.</small><small>Limite de convidados configurado: {maxGuests}</small></div>
      <button><CalendarPlus />Solicitar reserva {Number(area?.fee_amount) > 0 ? `· ${money(area.fee_amount)}` : ''}</button>
    </form>
    <ReservationGuestsManager data={data} forms={forms} setForm={setForm} action={action} selected={selected} setSelected={setSelected} fileToDataUrl={fileToDataUrl} settings={settings} />
    <Table rows={data.reservations} render={r => <><td><b>{r.area}</b><small>Unidade {r.unit} · {r.resident}</small></td><td>{date(r.reserved_for)}<small>{r.start_time} às {r.end_time}</small></td><td>{money(r.fee_amount)}<small>{r.digitable_line || r.payment_link || ''}</small></td><td><Status ok={r.status === 'confirmada'}>{reservationStatusLabel(r.status)}</Status></td><td className="actions reservationActions"><button onClick={() => downloadIcs(r.id)}>ICS</button><button onClick={() => request(`/api/reservations/${r.id}/google`).then(x => window.open(x.url, '_blank'))}>Google</button><button onClick={() => action(`/api/reservations/${r.id}/status`, { status:'pendente_pagamento' }, 'Morador avisado sobre pagamento pendente')}>Pagamento</button><button onClick={() => action(`/api/reservations/${r.id}/status`, { status:'pendente_aceite_regras' }, 'Morador avisado sobre aceite pendente')}>Aceite</button><button onClick={() => action(`/api/reservations/${r.id}/approve`, {}, 'Reserva confirmada e morador notificado')}>Confirmar</button><button onClick={() => action(`/api/reservations/${r.id}/cancel`, { reason: 'Cancelado pelo sistema' }, 'Reserva cancelada e morador notificado')}>Cancelar</button></td></>} />
  </Panel>;
}

function ReservationGuestsManager({ data, forms, setForm, action, selected, setSelected, fileToDataUrl, settings }) {
  const currentId = forms.reservationGuest.reservation_id || forms.reservationVisitors.reservation_id || selected;
  const currentReservation = data.reservations.find(r => String(r.id) === String(currentId));
  const currentArea = data.commonAreas.find(a => a.name === currentReservation?.area);
  const maxGuests = Number(currentArea?.max_guests || settings?.RESERVATION_MAX_GUESTS_DEFAULT || 30);
  const guestRows = (currentReservation?.visitors || data.reservationVisitors || []).filter(v => !currentId || String(v.reservation_id) === String(currentId));
  const setReservationId = (value) => { setSelected(value); setForm('reservationGuest', { reservation_id: value }); setForm('reservationVisitors', { reservation_id: value }); };
  const submitGuest = async (e) => {
    e.preventDefault();
    if (!currentId) return alert('Selecione a reserva antes de adicionar convidados.');
    const ok = await action(`/api/reservations/${currentId}/visitors`, { visitors: [forms.reservationGuest] }, 'Convidado adicionado à reserva');
    if (ok) setForm('reservationGuest', { name:'', document:'', phone:'', plate:'', age_group:'adulto', visitor_type:'convidado', counts_as_guest:true, notes:'', photo_data:'', reservation_id: currentId });
  };
  return <div className="subpanel guestManager"><h3><ClipboardList />Convidados da reserva</h3><p>Campos principais padronizados para a portaria. O síndico define o limite e se crianças/bebês entram na contagem.</p><div className="formGrid"><label>Reserva<select required value={currentId || ''} onChange={e => setReservationId(e.target.value)}><option value="">Selecione a reserva</option>{data.reservations.map(r => <option key={r.id} value={r.id}>{r.area} · {date(r.reserved_for)} · unidade {r.unit}</option>)}</select></label><div className="noticeBox"><b>Limite do evento</b><small>{guestRows.length} cadastrados de {maxGuests} permitidos.</small><small>Crianças contam: {asBool(settings?.RESERVATION_COUNT_CHILDREN, true) ? 'sim' : 'não'} · Bebês de colo contam: {asBool(settings?.RESERVATION_COUNT_INFANTS, false) ? 'sim' : 'não'}</small></div></div><form className="formGrid" onSubmit={submitGuest}><label>Nome do convidado<input required placeholder="Nome completo" value={forms.reservationGuest.name} onChange={e => setForm('reservationGuest', { name: e.target.value })} /></label><label>Documento<input required placeholder="RG/CPF" value={forms.reservationGuest.document} onChange={e => setForm('reservationGuest', { document: e.target.value })} /></label><label>Telefone<input placeholder="Telefone" value={forms.reservationGuest.phone} onChange={e => setForm('reservationGuest', { phone: e.target.value })} /></label><label>Placa<input placeholder="Placa" value={forms.reservationGuest.plate} onChange={e => setForm('reservationGuest', { plate: e.target.value })} /></label><label>Tipo<select value={forms.reservationGuest.visitor_type} onChange={e => setForm('reservationGuest', { visitor_type: e.target.value })}><option value="convidado">Convidado</option><option value="fornecedor">Fornecedor</option><option value="buffet">Buffet</option><option value="decoracao">Decoração</option><option value="musica">Música/fotografia</option></select></label><label>Faixa<select value={forms.reservationGuest.age_group} onChange={e => setForm('reservationGuest', { age_group: e.target.value, counts_as_guest: e.target.value === 'bebe' ? asBool(settings?.RESERVATION_COUNT_INFANTS,false) : e.target.value === 'crianca' ? asBool(settings?.RESERVATION_COUNT_CHILDREN,true) : true })}><option value="adulto">Adulto</option><option value="crianca">Criança</option><option value="bebe">Bebê de colo</option></select></label><label className="check"><input type="checkbox" checked={Boolean(forms.reservationGuest.counts_as_guest)} onChange={e => setForm('reservationGuest', { counts_as_guest: e.target.checked })} />Conta no limite de convidados</label><label className="fileButton"><Camera />Foto<input type="file" accept="image/*" capture="environment" onChange={e => fileToDataUrl?.(e.target.files?.[0], url => setForm('reservationGuest', { photo_data: url }))} /></label><textarea placeholder="Observações para a portaria" value={forms.reservationGuest.notes} onChange={e => setForm('reservationGuest', { notes: e.target.value })} /><button><Plus />Adicionar convidado</button></form><div className="subpanel"><h3>Importação rápida</h3><div className="formGrid"><textarea placeholder="Um convidado por linha: Nome; Documento; Telefone; Placa; adulto/crianca/bebe" value={forms.reservationVisitors.bulk} onChange={e => setForm('reservationVisitors', { bulk: e.target.value })} /><button onClick={() => currentId ? action(`/api/reservations/${currentId}/visitors`, { bulk: forms.reservationVisitors.bulk }, 'Lista de convidados importada') : alert('Selecione a reserva')}>Importar lista</button></div></div><Table rows={guestRows} render={v => <><td>{v.photo_data ? <img src={v.photo_data} className="avatar" /> : <UserCheck />}<b>{v.name}</b><small>{v.document || 'sem documento'}</small></td><td>{v.visitor_type || 'convidado'}<small>{v.age_group || 'adulto'}</small></td><td>{v.phone || '-'}</td><td>{v.plate || '-'}</td></>} /></div>;
}

function Calendar({ reservations, month, setMonth, onPick }) {
  const year = month.getFullYear(); const m = month.getMonth(); const first = new Date(year, m, 1); const start = new Date(first); start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const monthStr = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const byDay = (iso) => reservations.filter(r => String(r.reserved_for).slice(0, 10) === iso && r.status !== 'cancelada');
  return <div className="calendarBox"><div className="calendarHead"><button onClick={() => setMonth(new Date(year, m - 1, 1))}><ChevronLeft /></button><b>{monthStr}</b><button onClick={() => setMonth(new Date(year, m + 1, 1))}><ChevronRight /></button></div><div className="weekLabels">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x => <span key={x}>{x}</span>)}</div><div className="calendarGrid">{days.map(d => { const iso = d.toISOString().slice(0, 10); const items = byDay(iso); return <button key={iso} className={d.getMonth() !== m ? 'mutedDay' : ''} onClick={() => onPick(iso)}><b>{d.getDate()}</b>{items.slice(0, 2).map(r => <small key={r.id}>{r.area}</small>)}</button>; })}</div></div>;
}

function VisitorsPage({ data, forms, setForm, action, query, setQuery, fileToDataUrl, compact }) {
  const rows = data.visitors.filter(v => !query || String(v.unit || '').toLowerCase().includes(query.toLowerCase()) || String(v.name || '').toLowerCase().includes(query.toLowerCase()));
  const toggleDay = (code) => setForm('visitor', { weekdays: forms.visitor.weekdays.includes(code) ? forms.visitor.weekdays.filter(x => x !== code) : [...forms.visitor.weekdays, code] });
  return <Panel title="Visitantes" subtitle="Visitantes recorrentes, busca por unidade, dias da semana, anúncio por interfone/notificação e foto." icon={<UserCheck />} compact={compact}>
    <SearchBox query={query} setQuery={setQuery} placeholder="Buscar por unidade ou visitante" />
    <form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/visitors', forms.visitor, 'Visitante cadastrado'); }}>
      <input placeholder="Nome" value={forms.visitor.name} onChange={e => setForm('visitor', { name: e.target.value })} /><input placeholder="Documento" value={forms.visitor.document} onChange={e => setForm('visitor', { document: e.target.value })} /><input placeholder="Unidade" value={forms.visitor.unit} onChange={e => setForm('visitor', { unit: e.target.value })} /><input placeholder="Telefone" value={forms.visitor.phone} onChange={e => setForm('visitor', { phone: e.target.value })} /><input placeholder="Placa" value={forms.visitor.plate} onChange={e => setForm('visitor', { plate: e.target.value })} />
      <select value={forms.visitor.announcement_channel} onChange={e => setForm('visitor', { announcement_channel: e.target.value })}><option value="interfone">Anunciar no interfone</option><option value="app">Notificação no sistema</option><option value="whatsapp">WhatsApp</option><option value="nao_anunciar">Não anunciar</option></select>
      <label className="check"><input type="checkbox" checked={forms.visitor.recurring} onChange={e => setForm('visitor', { recurring: e.target.checked })} />Visitante recorrente</label><label className="check"><input type="checkbox" checked={forms.visitor.announce_required} onChange={e => setForm('visitor', { announce_required: e.target.checked })} />Porteiro deve anunciar</label>
      <div className="weekPicker">{weekDays.map(([c, l]) => <button type="button" key={c} className={forms.visitor.weekdays.includes(c) ? 'active' : ''} onClick={() => toggleDay(c)}>{l}</button>)}</div>
      <label className="fileButton"><Camera />Foto do visitante<input type="file" accept="image/*" capture="environment" onChange={e => fileToDataUrl(e.target.files?.[0], url => setForm('visitor', { photo_data: url }))} /></label>
      <textarea placeholder="Observações" value={forms.visitor.notes} onChange={e => setForm('visitor', { notes: e.target.value })} />
      <button><Plus />Cadastrar visitante</button>
    </form>
    <Table rows={rows} render={v => <><td>{v.photo_data ? <img src={v.photo_data} className="avatar" /> : <UserCheck />}<b>{v.name}</b><small>Unidade {v.unit} · {v.document}</small></td><td>{v.recurring ? 'Recorrente' : 'Avulso'}<small>{Array.isArray(v.weekdays) ? v.weekdays.join(', ') : ''}</small></td><td><Status ok={v.status === 'autorizado'}>{v.status}</Status><small>{v.announcement_channel}</small></td></>} />
  </Panel>;
}

function EmployeesShiftsPage({ data, forms, setForm, action }) {
  const onDuty = data.shifts.find(s => new Date(s.starts_at) <= new Date() && new Date(s.ends_at) >= new Date());
  return <Panel title="Funcionários e escalas" subtitle="Mensagens dos moradores são direcionadas ao funcionário em serviço pela escala." icon={<Clock3 />}>
    <div className="metricStrip"><Metric icon={<BriefcaseBusiness />} label="Funcionários" value={data.employees.length} /><Metric icon={<Clock3 />} label="Em serviço" value={onDuty?.employee_name || 'Nenhum'} /></div>
    <div className="split"><form className="formGrid single" onSubmit={e => { e.preventDefault(); action('/api/employees', forms.employee, 'Funcionário cadastrado'); }}><h3>Funcionário</h3><input placeholder="Nome" value={forms.employee.name} onChange={e => setForm('employee', { name: e.target.value })} /><select value={forms.employee.role} onChange={e => setForm('employee', { role: e.target.value })}><option value="portaria">Portaria</option><option value="zeladoria">Zeladoria</option><option value="manutencao">Manutenção</option><option value="seguranca">Segurança</option></select><input placeholder="Telefone" value={forms.employee.phone} onChange={e => setForm('employee', { phone: e.target.value })} /><input placeholder="E-mail" value={forms.employee.email} onChange={e => setForm('employee', { email: e.target.value })} /><button><Plus />Salvar funcionário</button></form><form className="formGrid single" onSubmit={e => { e.preventDefault(); action('/api/shifts', forms.shift, 'Escala cadastrada'); }}><h3>Escala</h3><select value={forms.shift.employee_id} onChange={e => setForm('shift', { employee_id: e.target.value })}><option value="">Funcionário</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={forms.shift.role} onChange={e => setForm('shift', { role: e.target.value })}><option value="portaria">Portaria</option><option value="zeladoria">Zeladoria</option><option value="manutencao">Manutenção</option><option value="seguranca">Segurança</option></select><input type="datetime-local" value={forms.shift.starts_at} onChange={e => setForm('shift', { starts_at: e.target.value })} /><input type="datetime-local" value={forms.shift.ends_at} onChange={e => setForm('shift', { ends_at: e.target.value })} /><button><CalendarPlus />Salvar escala</button></form></div>
    <Table rows={data.shifts} render={s => <><td><b>{s.employee_name}</b><small>{s.role}</small></td><td>{new Date(s.starts_at).toLocaleString('pt-BR')}</td><td>{new Date(s.ends_at).toLocaleString('pt-BR')}</td><td><Status ok={s.status !== 'cancelada'}>{s.status}</Status></td></>} />
  </Panel>;
}

function MessagesPage({ data, forms, setForm, action, compact }) {
  return <Panel title="Mensagens" subtitle="Morador envia e a escala direciona para o funcionário em serviço." icon={<MessageCircle />} compact={compact}>
    <form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/messages', forms.message, 'Mensagem enviada para funcionário em serviço'); }}><input placeholder="Unidade" value={forms.message.unit} onChange={e => setForm('message', { unit: e.target.value })} /><input placeholder="Assunto" value={forms.message.subject} onChange={e => setForm('message', { subject: e.target.value })} /><textarea placeholder="Mensagem" value={forms.message.body} onChange={e => setForm('message', { body: e.target.value })} /><button><Send />Enviar</button></form>
    <Table rows={data.messages} render={m => <><td><b>{m.subject}</b><small>{m.body}</small></td><td>Unidade {m.unit}<small>{m.employee_name ? 'Responsável: ' + m.employee_name : 'Sem escala vinculada'}</small></td><td><Status ok={m.status === 'respondida'}>{m.status}</Status></td><td className="actions"><button onClick={() => { const response = prompt('Resposta ao morador'); if (response) action(`/api/messages/${m.id}/respond`, { response }, 'Resposta enviada'); }}>Responder</button></td></>} />
  </Panel>;
}


function UsersResidentsPage({ data, forms, setForm, action, settings, session, loadAll }) {
  const [tab, setTab] = useState('moradores');
  const [editingResident, setEditingResident] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const role = forms.user.role;
  const channels = enabledChannels(settings);
  const showUnit = !(role === 'funcionario' || role === 'portaria' || role === 'financeiro' || role === 'master' || (role === 'sindico' && forms.user.is_outsourced));
  const roleChange = (r) => setForm('user', { role: r, user_type: r, permissions: roleDefaultPermissions[r] || roleDefaultPermissions.morador, unit: ['master','funcionario', 'portaria', 'financeiro'].includes(r) ? '' : forms.user.unit });
  const roleOptions = [['morador','Morador'], ['sindico','Síndico'], ['portaria','Portaria'], ['funcionario','Funcionário'], ['financeiro','Financeiro'], ...(session?.role === 'master' ? [['master','Administrador do sistema']] : [])];
  const saveResident = async (e) => { e.preventDefault(); const path = editingResident ? `/api/residents/${editingResident}` : '/api/residents'; const ok = await action(path, forms.resident, editingResident ? 'Morador atualizado' : 'Morador cadastrado', editingResident ? 'PUT' : 'POST'); if (ok) { setEditingResident(null); loadAll?.(); } };
  const saveUser = async (e) => { e.preventDefault(); const path = editingUser ? `/api/users/${editingUser}` : '/api/users'; const ok = await action(path, forms.user, editingUser ? 'Usuário atualizado' : 'Usuário criado', editingUser ? 'PUT' : 'POST'); if (ok) { setEditingUser(null); loadAll?.(); } };
  const loadResident = (r) => { setEditingResident(r.id); setTab('moradores'); setForm('resident', { ...forms.resident, ...r, criteria: parseJsonLike(r.criteria || {}), notification_preferences: parseJsonLike(r.notification_preferences || forms.resident.notification_preferences) }); window.scrollTo({ top:0, behavior:'smooth' }); };
  const loadUser = (u) => { setEditingUser(u.id); setTab('usuarios'); setForm('user', { ...forms.user, ...u, permissions: u.permissions || roleDefaultPermissions[u.role] || {}, notification_preferences: u.notification_preferences || forms.user.notification_preferences, password:'' }); window.scrollTo({ top:0, behavior:'smooth' }); };
  return <Panel title="Cadastros" subtitle="Moradores, usuários e aprovações em abas separadas. O morador cuida dos próprios dados em Meu perfil." icon={<ShieldCheck />}>
    <div className="subTabs"><button className={tab === 'moradores' ? 'active' : ''} onClick={() => setTab('moradores')}><Users />Moradores</button><button className={tab === 'usuarios' ? 'active' : ''} onClick={() => setTab('usuarios')}><KeyRound />Usuários</button><button className={tab === 'solicitacoes' ? 'active' : ''} onClick={() => setTab('solicitacoes')}><UserPlus />Aprovações</button></div>
    {tab === 'moradores' && <div className="stack"><form className="formGrid" onSubmit={saveResident}><h3>{editingResident ? 'Editar morador' : 'Novo morador'}</h3><label>Nome completo<input required placeholder="Nome completo" value={forms.resident.name} onChange={e => setForm('resident', { name: e.target.value })} /></label><label>Unidade<input required placeholder="Ex.: 101" value={forms.resident.unit} onChange={e => setForm('resident', { unit: e.target.value })} /></label>{channels.email && <label>E-mail<input required={asBool(settings.REGISTRATION_REQUIRE_EMAIL, true)} type="email" placeholder="email@dominio.com" value={forms.resident.email} onChange={e => setForm('resident', { email: e.target.value })} /></label>}{channels.whatsapp && <label>WhatsApp<input placeholder="DDD + número" value={forms.resident.whatsapp_phone} onChange={e => setForm('resident', { whatsapp_phone: e.target.value })} /></label>}{channels.telegram && <label>Telegram<input placeholder="Chat ID ou usuário Telegram" value={forms.resident.telegram_chat_id} onChange={e => setForm('resident', { telegram_chat_id: e.target.value })} /></label>}<label>Documento<input placeholder="CPF/RG" value={forms.resident.document} onChange={e => setForm('resident', { document: e.target.value })} /></label><label>Veículo<input placeholder="Placa/modelo" value={forms.resident.vehicle} onChange={e => setForm('resident', { vehicle: e.target.value })} /></label><ChannelPicker value={forms.resident.notification_preferences} onChange={v => setForm('resident', { notification_preferences: v })} settings={settings} /><CriteriaPicker criteria={data.residentCriteria || []} value={forms.resident.criteria || {}} onChange={v => setForm('resident', { criteria: v })} /><textarea placeholder="Observações" value={forms.resident.notes} onChange={e => setForm('resident', { notes: e.target.value })} /><button><Save />{editingResident ? 'Salvar alterações' : 'Salvar morador'}</button>{editingResident && <button type="button" className="secondary" onClick={() => setEditingResident(null)}>Cancelar edição</button>}</form><Table rows={data.residents} render={r => <><td><b>{r.name}</b><small>Unidade {r.unit}</small></td><td>{r.email || '-'}<small>{r.whatsapp_phone || r.phone || ''}</small></td><td>{r.telegram_chat_id ? 'Telegram configurado' : 'Sem Telegram'}</td><td className="actions"><button onClick={() => loadResident(r)}>Editar</button></td></>} /></div>}
    {tab === 'usuarios' && <div className="stack"><form className="formGrid" onSubmit={saveUser}><h3>{editingUser ? 'Editar usuário' : 'Novo usuário'}</h3><label>Nome do usuário<input required placeholder="Nome completo" value={forms.user.name} onChange={e => setForm('user', { name: e.target.value })} /></label>{channels.email && <label>E-mail/login<input required={asBool(settings.REGISTRATION_REQUIRE_EMAIL, true)} type="email" placeholder="email@dominio.com" value={forms.user.email} onChange={e => setForm('user', { email: e.target.value })} /></label>}{channels.whatsapp && <label>WhatsApp<input placeholder="DDD + número" value={forms.user.whatsapp_phone || forms.user.phone} onChange={e => setForm('user', { whatsapp_phone: e.target.value, phone: e.target.value })} /></label>}{channels.telegram && <label>Telegram<input placeholder="Chat ID ou usuário Telegram" value={forms.user.telegram_chat_id} onChange={e => setForm('user', { telegram_chat_id: e.target.value })} /></label>}<label>Perfil<select required value={forms.user.role} onChange={e => roleChange(e.target.value)}>{roleOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>{role === 'sindico' && <label className="check"><input type="checkbox" checked={forms.user.is_outsourced} onChange={e => setForm('user', { is_outsourced: e.target.checked, unit: e.target.checked ? '' : forms.user.unit })} />Síndico terceirizado, sem unidade vinculada</label>}{showUnit && <label>Unidade vinculada<input placeholder="Ex.: 101" value={forms.user.unit} onChange={e => setForm('user', { unit: e.target.value })} /></label>}{!['funcionario','master'].includes(role) && <label>Morador vinculado<select value={forms.user.resident_id} onChange={e => setForm('user', { resident_id: e.target.value })}><option value="">Selecionar morador</option>{data.residents.map(r => <option key={r.id} value={r.id}>{r.name} · {r.unit}</option>)}</select></label>}{role === 'funcionario' && <label>Funcionário vinculado<select value={forms.user.employee_id} onChange={e => setForm('user', { employee_id: e.target.value })}><option value="">Selecionar funcionário</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}<label>Senha temporária opcional<input placeholder="Deixe vazio para gerar automaticamente" value={forms.user.password} onChange={e => setForm('user', { password: e.target.value })} /></label><ChannelPicker value={forms.user.notification_preferences} onChange={v => setForm('user', { notification_preferences: v })} settings={settings} /><PermissionsEditor value={forms.user.permissions} onChange={v => setForm('user', { permissions: v })} /><button><Save />{editingUser ? 'Salvar usuário' : 'Criar usuário'}</button>{editingUser && <button type="button" className="secondary" onClick={() => setEditingUser(null)}>Cancelar edição</button>}</form><Table rows={data.users} render={u => <><td><b>{u.name}</b><small>{u.email}</small></td><td>{u.role === 'master' ? 'Administrador' : u.role}<small>{u.unit || (u.is_outsourced ? 'terceirizado' : '')}</small></td><td><Status ok={u.active}>{u.active ? 'ativo' : 'inativo'}</Status></td><td className="actions"><button onClick={() => loadUser(u)}>Editar</button><button onClick={() => action(`/api/users/${u.id}/reset-password`, {}, 'Senha temporária enviada somente ao usuário')}>Reset senha</button></td></>} /></div>}
    {tab === 'solicitacoes' && <div className="stack"><Table rows={data.registrationRequests} render={r => <><td><b>{r.name}</b><small>{[r.email, r.whatsapp_phone || r.phone, r.telegram_chat_id && 'Telegram ' + r.telegram_chat_id].filter(Boolean).join(' · ')} · unidade {r.unit}</small></td><td><Status ok={r.status === 'aprovada'}>{r.status}</Status></td><td className="actions"><button onClick={() => action(`/api/registration-requests/${r.id}/approve`, {}, 'Cadastro aprovado')}>Aprovar</button><button onClick={() => action(`/api/registration-requests/${r.id}/reject`, { note: 'Dados não conferem' }, 'Cadastro rejeitado')}>Rejeitar</button></td></>} /></div>}
  </Panel>;
}

function CriteriaPicker({ criteria=[], value={}, onChange }) { return <div className="criteriaBox"><b>Critérios do morador</b><small>Use para filtrar comunicados e notificações.</small>{criteria.map(c => <label className="check" key={c.key}><input type="checkbox" checked={Boolean(value?.[c.key])} onChange={e => onChange({ ...(value||{}), [c.key]: e.target.checked })} />{c.label}</label>)}</div>; }

function PermissionsEditor({ value = {}, onChange }) { return <details className="permissions"><summary>Delimitar acessos</summary>{permissionGroups.map(g => <div key={g.title}><b>{g.title}</b>{g.items.map(([k, label]) => <label key={k}><input type="checkbox" checked={Boolean(value[k])} onChange={e => onChange({ ...value, [k]: e.target.checked })} />{label}</label>)}</div>)}</details>; }


function FinanceiroPage(props) {
  return <div className="stack"><FinancePage {...props} /><BoletosPage {...props} /><InvoicesPage {...props} /></div>;
}

function FinancePage({ data, forms, setForm, action, compact, can }) {
  const saldo = data.finance.reduce((a, f) => a + (f.type === 'receita' ? 1 : -1) * Number(f.amount || 0), 0);
  return <Panel title="Financeiro" subtitle="Usuários acompanham lançamentos e boletos de seus apartamentos." icon={<WalletCards />} compact={compact}>
    <div className="metricStrip"><Metric icon={<WalletCards />} label="Saldo previsto" value={money(saldo)} /><Metric icon={<BadgeDollarSign />} label="Boletos" value={data.boletos.length} /></div>
    {(!can || can('finance.manage')) && <form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/finance', forms.finance, 'Lançamento criado'); }}><label>Descrição<input required placeholder="Descrição" value={forms.finance.title} onChange={e => setForm('finance', { title: e.target.value })} /></label><label>Valor<input required type="number" placeholder="Valor" value={forms.finance.amount} onChange={e => setForm('finance', { amount: e.target.value })} /></label><label>Tipo<select value={forms.finance.type} onChange={e => setForm('finance', { type: e.target.value })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label><label>Unidade<input placeholder="Unidade" value={forms.finance.unit} onChange={e => setForm('finance', { unit: e.target.value })} /></label><label>Vencimento<input type="date" value={forms.finance.due_date} onChange={e => setForm('finance', { due_date: e.target.value })} /></label><label className="check"><input type="checkbox" checked={forms.finance.generate_boleto} onChange={e => setForm('finance', { generate_boleto: e.target.checked })} />Gerar/vincular boleto</label><button><Plus />Adicionar</button></form>}
    <Table rows={data.finance} render={f => <><td><b>{f.title}</b><small>{f.category} · unidade {f.unit || '-'}</small></td><td>{money(f.amount)}<small>{date(f.due_date)}</small></td><td><Status ok={f.status === 'pago'}>{f.status}</Status></td><td>{f.digitable_line && <Code>{f.digitable_line}</Code>}</td></>} />
  </Panel>;
}

function BoletosPage({ data, forms, setForm, action, settings }) { const bankProvider = settings.BANK_PROVIDER || settings.BOLETO_PROVIDER || 'manual'; return <Panel title="Boletos" subtitle="Vincule boleto de qualquer banco ou gere cobrança pelo banco configurado pela administração." icon={<BadgeDollarSign />}><div className="noticeBox"><b>Banco ativo:</b> {bankProvider === 'manual' ? 'vinculação manual' : bankProvider}<small>{bankProvider === 'manual' ? 'Cole linha digitável, link ou PDF do boleto.' : 'A cobrança usa o conector configurado em Configurações → Banco.'}</small></div><form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/boletos', { ...forms.boleto, provider: bankProvider === 'manual' ? 'manual' : 'auto' }, 'Boleto vinculado/gerado'); }}><input placeholder="Título" value={forms.boleto.title} onChange={e => setForm('boleto', { title: e.target.value })} /><input type="number" placeholder="Valor" value={forms.boleto.amount} onChange={e => setForm('boleto', { amount: e.target.value })} /><input placeholder="Unidade" value={forms.boleto.unit} onChange={e => setForm('boleto', { unit: e.target.value })} /><input type="date" value={forms.boleto.due_date} onChange={e => setForm('boleto', { due_date: e.target.value })} /><input placeholder="Banco" value={forms.boleto.bank_name} onChange={e => setForm('boleto', { bank_name: e.target.value })} />{bankProvider === 'manual' && <><input placeholder="Linha digitável" value={forms.boleto.digitable_line} onChange={e => setForm('boleto', { digitable_line: e.target.value })} /><input placeholder="Link/PDF do boleto" value={forms.boleto.payment_link} onChange={e => setForm('boleto', { payment_link: e.target.value })} /></>}<button><Plus />{bankProvider === 'manual' ? 'Vincular boleto' : 'Gerar boleto'}</button></form><Table rows={data.boletos} render={b => <><td><b>{b.title}</b><small>Unidade {b.unit} · {b.bank_name || b.provider}</small></td><td>{money(b.amount)}<small>{date(b.due_date)}</small></td><td><Status ok={b.status === 'pago'}>{b.status}</Status></td><td><Code>{b.digitable_line || b.payment_link || b.external_id || '-'}</Code></td></>} /></Panel>; }

function InvoicesPage({ data, forms, setForm, action, runOcr, ocrBusy }) { return <Panel title="Notas fiscais" subtitle="leitura automática para foto de nota fiscal, com conferência antes do cadastro." icon={<FileText />}><form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/invoices', forms.invoice, 'Nota fiscal cadastrada'); }}><input placeholder="Fornecedor" value={forms.invoice.supplier} onChange={e => setForm('invoice', { supplier: e.target.value })} /><input placeholder="Número" value={forms.invoice.document_number} onChange={e => setForm('invoice', { document_number: e.target.value })} /><input placeholder="Chave de acesso" value={forms.invoice.access_key} onChange={e => setForm('invoice', { access_key: e.target.value })} /><input type="number" placeholder="Valor" value={forms.invoice.amount} onChange={e => setForm('invoice', { amount: e.target.value })} /><input type="date" value={forms.invoice.issue_date} onChange={e => setForm('invoice', { issue_date: e.target.value })} /><input type="date" value={forms.invoice.due_date} onChange={e => setForm('invoice', { due_date: e.target.value })} /><label className="fileButton"><ScanLine />{ocrBusy === 'invoice' ? 'Lendo nota...' : 'leitura automática nota fiscal'}<input type="file" accept="image/*" capture="environment" onChange={e => runOcr(e.target.files?.[0], 'invoice')} /></label><button><Plus />Cadastrar nota</button></form><Table rows={data.invoices} render={i => <><td><b>{i.supplier}</b><small>NF {i.document_number}</small></td><td>{money(i.amount)}</td><td>{date(i.due_date)}</td></>} /></Panel>; }


function CommunicationPage(props) {
  return <div className="stack"><NotificationsCenter {...props} /><NoticesPage {...props} /><MessagesPage {...props} /></div>;
}
function NotificationsCenter({ data, action }) {
  const rows = data.notifications || [];
  return <Panel title="Notificações" subtitle="Central limpa com avisos do sistema, navegador, reservas, encomendas e atualizações." icon={<Bell />}>
    <Table rows={rows} render={n => <><td><b>{n.title}</b><small>{n.body}</small></td><td><Status ok={n.status === 'lida'}>{n.status}</Status><small>{date(n.created_at)}</small></td><td><Code>{n.channel || 'app'}</Code></td><td className="actions"><button onClick={() => action(`/api/notifications/${n.id}/read`, {}, 'Notificação marcada como lida')}>Marcar lida</button></td></>} />
  </Panel>;
}

function EmergencyPage({ data, forms, setForm, action, can, settings }) {
  const fallbackTypes = [
    { code:'elevador', label:'Preso no elevador', supplier:settings.ELEVATOR_OPERATOR_NAME || 'Operadora do elevador', phone:settings.ELEVATOR_EMERGENCY_PHONE || '', instructions:'Mantenha a calma. A solicitação irá para a portaria/síndico e o telefone da operadora aparece aqui.', notify_all:false },
    { code:'incendio', label:'Fogo / fumaça', supplier:'Corpo de Bombeiros', phone:'193', instructions:'Acione a emergência e deixe o local com segurança.', notify_all:true },
    { code:'invasao', label:'Invasão do prédio', supplier:'Polícia Militar', phone:'190', instructions:'Evite confronto e procure local seguro.', notify_all:true },
    { code:'saude', label:'Emergência médica', supplier:'SAMU', phone:'192', instructions:'Informe unidade, nome e ponto de referência.', notify_all:false }
  ];
  const types = (data.emergencyTypes && data.emergencyTypes.length ? data.emergencyTypes : fallbackTypes).filter(t => t.active !== false);
  const selected = types.find(t => t.code === forms.emergency.type) || types[0] || fallbackTypes[0];
  useEffect(() => { if (!forms.emergency.type && selected?.code) setForm('emergency', { type: selected.code }); }, [selected?.code]);
  const submitEmergency = async (e) => { e.preventDefault(); await action('/api/emergency', { ...forms.emergency, type: selected.code }, 'Solicitação enviada para aprovação da portaria/síndico'); };
  return <Panel title="Emergência" subtitle="Solicitação passa primeiro pela portaria e/ou síndico. Somente fogo/fumaça ou invasão notificam todos os moradores." icon={<Siren />}>
    <div className="noticeBox emergencyNotice"><b>Tipo selecionado: {selected.label}</b><small>{selected.instructions || 'Escolha o tipo de emergência e informe a unidade/local.'}</small>{selected.phone && <a className="buttonlike emergencyPhone" href={`tel:${selected.phone}`}><Phone />{selected.supplier || 'Contato'} · {selected.phone}</a>}</div>
    <div className="emergencyGrid">{types.map(t => <button type="button" key={t.code} className={forms.emergency.type === t.code ? 'emergency active' : 'emergency'} onClick={() => setForm('emergency', { type: t.code })}><Siren /><b>{t.label}</b><small>{t.supplier || 'Equipe do condomínio'} {t.phone ? '· ' + t.phone : ''}</small><span>{t.notify_all ? 'Pode notificar todos após aprovação' : 'Notifica somente equipe após aprovação'}</span></button>)}</div>
    <form className="formGrid emergencyForm" onSubmit={submitEmergency}>
      <input placeholder="Unidade/local" value={forms.emergency.unit} onChange={e => setForm('emergency', { unit: e.target.value })} />
      <textarea placeholder="Descreva rapidamente o que está acontecendo" value={forms.emergency.message} onChange={e => setForm('emergency', { message: e.target.value })} />
      <button className="danger"><Siren />Enviar solicitação</button>
    </form>
    {can('emergency.approve') && <section className="wide"><h3><ShieldCheck />Aprovações pendentes</h3><Table rows={data.emergencyRequests} render={r => <><td><b>{r.type_label}</b><small>Unidade/local {r.unit || '-'} · {r.message || ''}</small></td><td><Status ok={r.status === 'aprovada'}>{r.status}</Status><small>{r.notify_all ? 'aviso geral permitido' : 'sem aviso geral'}</small></td><td className="actions"><button onClick={() => action(`/api/emergency-requests/${r.id}/approve`, { note:'Aprovado pelo painel' }, 'Emergência aprovada')}>Aprovar</button><button onClick={() => action(`/api/emergency-requests/${r.id}/reject`, { note:'Rejeitado pelo painel' }, 'Emergência rejeitada')}>Rejeitar</button></td></>} /></section>}
  </Panel>;
}

function NoticesPage({ data, forms, setForm, action }) {
  const toggleCriterion = (key) => setForm('notice', { target_criteria: { ...(forms.notice.target_criteria || {}), [key]: !forms.notice.target_criteria?.[key] } });
  return <Panel title="Comunicados" subtitle="Envie para todos ou filtre por características do cadastro do morador." icon={<Megaphone />}><form className="formGrid" onSubmit={e => { e.preventDefault(); action('/api/notices', forms.notice, 'Comunicado publicado e notificações enviadas'); }}><input required placeholder="Título" value={forms.notice.title} onChange={e => setForm('notice', { title: e.target.value })} /><select value={forms.notice.priority} onChange={e => setForm('notice', { priority: e.target.value })}><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select><select value={forms.notice.target_role} onChange={e => setForm('notice', { target_role: e.target.value })}><option value="todos">Todos</option><option value="morador">Moradores</option><option value="portaria">Portaria</option></select><textarea required placeholder="Mensagem" value={forms.notice.body} onChange={e => setForm('notice', { body: e.target.value })} /><div className="criteriaBox wideForm"><b>Filtrar por perfil do morador</b><small>Marque somente quando o comunicado for específico. Ex.: avisar apenas moradores com pet.</small>{(data.residentCriteria || []).map(c => <label className="check" key={c.key}><input type="checkbox" checked={Boolean(forms.notice.target_criteria?.[c.key])} onChange={() => toggleCriterion(c.key)} />{c.label}</label>)}</div><button><Send />Publicar e notificar</button></form><Table rows={data.notices} render={n => <><td><b>{n.title}</b><small>{n.body}</small></td><td><Status ok={n.priority !== 'critica'}>{n.priority}</Status></td><td>{date(n.created_at)}</td></>} /></Panel>;
}

function SettingsPage({ data, forms, setForm, action, configTab, setConfigTab, enableBrowserNotifications, session, loadAll }) {
  const s = forms.settings || {};
  const setS = patch => setForm('settings', { ...s, ...patch });
  const admin = session?.role === 'master';
  const tabs = [['aparencia', 'Aparência'], ['menu', 'Menu'], ['comunicacao', 'Notificações'], ['criterios', 'Critérios'], ['reservas', 'Reservas'], ['emergencia', 'Emergência'], ['condominio', 'Condomínio'], ['apps', 'Apps'], ...(admin ? [['master', 'Liberações'], ['banco', 'Banco'], ['atualizacoes', 'Atualizações']] : [])];
  const savePath = ['master', 'banco', 'atualizacoes'].includes(configTab) ? '/api/platform-settings' : '/api/settings';
  const status = data.notificationStatus || {};
  const test = forms.notificationTest || {};
  const saveCriterion = async (e) => { e.preventDefault(); const ok = await action('/api/resident-criteria', forms.criterion, 'Critério salvo'); if (ok) { setForm('criterion', { label:'' }); loadAll?.(); } };
  const testNotification = async (e) => { e.preventDefault(); await action('/api/notify/test', test, 'Teste enviado'); };
  return <Panel title="Configurações" subtitle="Configurações agrupadas por assunto, com informações sensíveis protegidas." icon={<Settings />}>
    <div className="configTabs">{tabs.map(([k, label]) => <button key={k} className={configTab === k ? 'active' : ''} onClick={() => setConfigTab(k)}>{label}</button>)}</div><div className="settingsGrid">
    {configTab === 'aparencia' && <><SettingCard title="Tema" icon={<Palette />}><label>Cor principal<input type="color" value={s.THEME_ACCENT || '#126b5f'} onChange={e => setS({ THEME_ACCENT: e.target.value })} /></label><label>Modo<select value={s.APPEARANCE || 'light'} onChange={e => setS({ APPEARANCE: e.target.value })}><option value="light">Claro</option><option value="dark">Escuro</option></select></label></SettingCard><SettingCard title="Densidade" icon={<Activity />}><select value={s.UI_DENSITY || 'comfort'} onChange={e => setS({ UI_DENSITY: e.target.value })}><option value="comfort">Confortável</option><option value="compact">Compacto</option></select></SettingCard></>}
    {configTab === 'menu' && <SettingCard title="Orientação do menu" icon={<PanelLeft />} wide><select value={s.MENU_ORIENTATION || 'vertical'} onChange={e => setS({ MENU_ORIENTATION: e.target.value })}><option value="vertical">Lateral</option><option value="top">Superior</option><option value="floating">Flutuante</option></select><p>O botão de fechar fica dentro do menu e o celular usa gaveta responsiva.</p></SettingCard>}
    {configTab === 'comunicacao' && <><SettingCard title="E-mail" icon={<Mail />}><span className="miniRow">Canal <small>{status.email?.enabled ? 'liberado' : 'bloqueado'}</small></span><span className="miniRow">Provedor <small>{status.email?.provider || 'não informado'}</small></span><span className="miniRow">Chave SendGrid <small>{status.email?.sendgrid_key ? 'configurada no Render' : 'não configurada'}</small></span><label>Remetente verificado<input value={s.SENDGRID_FROM_EMAIL || ''} onChange={e => setS({ SENDGRID_FROM_EMAIL: e.target.value })} /></label><label>Nome remetente<input value={s.SENDGRID_FROM_NAME || ''} onChange={e => setS({ SENDGRID_FROM_NAME: e.target.value })} /></label></SettingCard><SettingCard title="Telegram" icon={<MessageCircle />}><span className="miniRow">Canal <small>{status.telegram?.enabled ? 'liberado' : 'bloqueado'}</small></span><span className="miniRow">Token <small>{status.telegram?.token || 'não configurado'}</small></span><label>Chat ID padrão<input value={s.TELEGRAM_CHAT_ID || ''} onChange={e => setS({ TELEGRAM_CHAT_ID: e.target.value })} /></label></SettingCard><SettingCard title="WhatsApp" icon={<Phone />}><span className="miniRow">Canal <small>{status.whatsapp?.enabled ? 'liberado' : 'bloqueado'}</small></span><span className="miniRow">Token <small>{status.whatsapp?.token || 'não configurado'}</small></span><label>Phone Number ID<input value={s.WHATSAPP_PHONE_NUMBER_ID || ''} onChange={e => setS({ WHATSAPP_PHONE_NUMBER_ID: e.target.value })} /></label></SettingCard><SettingCard title="Teste de envio" icon={<Send />} wide><form className="formGrid" onSubmit={testNotification}><select value={test.channel} onChange={e => setForm('notificationTest', { channel:e.target.value })}><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="browser">Navegador</option></select>{test.channel === 'email' && <input placeholder="E-mail de destino" value={test.to || ''} onChange={e => setForm('notificationTest', { to:e.target.value })} />}{test.channel === 'whatsapp' && <input placeholder="WhatsApp com DDI/DDD" value={test.phone || ''} onChange={e => setForm('notificationTest', { phone:e.target.value })} />}{test.channel === 'telegram' && <input placeholder="Chat ID opcional" value={test.chat_id || ''} onChange={e => setForm('notificationTest', { chat_id:e.target.value })} />}<textarea placeholder="Mensagem de teste" value={test.message || ''} onChange={e => setForm('notificationTest', { message:e.target.value })} /><button><Send />Enviar teste</button><button type="button" className="secondary" onClick={enableBrowserNotifications}><Bell />Ativar navegador neste aparelho</button></form></SettingCard></>}
    {configTab === 'criterios' && <><SettingCard title="Critérios dos moradores" icon={<Users />} wide><p>Cadastre características simples para filtrar comunicados. Elas aparecem em formato de checkbox nos cadastros e no perfil do morador.</p><form className="formGrid" onSubmit={saveCriterion}><input required placeholder="Ex.: Possui pet, Imóvel alugado, Possui carro" value={forms.criterion?.label || ''} onChange={e => setForm('criterion', { label:e.target.value })} /><button><Plus />Adicionar critério</button></form><div className="chipList">{(data.residentCriteria || []).map(c => <span key={c.id}>{c.label}<button onClick={() => action(`/api/resident-criteria/${c.id}`, {}, 'Critério removido', 'DELETE')}>×</button></span>)}</div></SettingCard></>}
    {configTab === 'reservas' && <><SettingCard title="Normas e taxa padrão" icon={<FileSignature />} wide><textarea value={s.RESERVATION_DEFAULT_RULES || ''} onChange={e => setS({ RESERVATION_DEFAULT_RULES: e.target.value })} /><small>As áreas comuns podem ter taxas próprias. A reserva gera pré-agendamento, boleto interno e e-mail ao morador a cada atualização.</small></SettingCard><SettingCard title="Convidados de eventos" icon={<UserCheck />}><label>Máximo padrão de convidados<input type="number" value={s.RESERVATION_MAX_GUESTS_DEFAULT || '30'} onChange={e => setS({ RESERVATION_MAX_GUESTS_DEFAULT: e.target.value })} /></label><label className="check"><input type="checkbox" checked={asBool(s.RESERVATION_COUNT_CHILDREN, true)} onChange={e => setS({ RESERVATION_COUNT_CHILDREN: String(e.target.checked) })} />Crianças contam no limite</label><label className="check"><input type="checkbox" checked={asBool(s.RESERVATION_COUNT_INFANTS, false)} onChange={e => setS({ RESERVATION_COUNT_INFANTS: String(e.target.checked) })} />Bebês de colo contam no limite</label></SettingCard></>}
    {configTab === 'emergencia' && <><SettingCard title="Elevador" icon={<Siren />}><label>Operadora<input value={s.ELEVATOR_OPERATOR_NAME || ''} onChange={e => setS({ ELEVATOR_OPERATOR_NAME: e.target.value })} /></label><label>Telefone<input value={s.ELEVATOR_EMERGENCY_PHONE || ''} onChange={e => setS({ ELEVATOR_EMERGENCY_PHONE: e.target.value })} /></label><label className="check"><input type="checkbox" checked={asBool(s.EMERGENCY_STRONG_VIBRATION, true)} onChange={e => setS({ EMERGENCY_STRONG_VIBRATION: String(e.target.checked) })} />Vibração forte em avisos críticos no navegador/app</label></SettingCard><SettingCard title="Tipos" icon={<ShieldAlert />}>{data.emergencyTypes.map(t => <span className="miniRow" key={t.code}>{t.label}<small>{t.notify_all ? 'notifica todos' : 'somente equipe'} · {t.phone}</small></span>)}</SettingCard></>}
    {configTab === 'condominio' && <SettingCard title="Dados e clima" icon={<Building2 />} wide><label>Nome<input value={s.CONDO_NAME || ''} onChange={e => setS({ CONDO_NAME: e.target.value })} /></label><label>Endereço<input value={s.CONDO_ADDRESS || ''} onChange={e => setS({ CONDO_ADDRESS: e.target.value })} /></label><label>Cidade<input value={s.WEATHER_CITY || ''} onChange={e => setS({ WEATHER_CITY: e.target.value })} /></label><label>Latitude<input value={s.WEATHER_LAT || ''} onChange={e => setS({ WEATHER_LAT: e.target.value })} /></label><label>Longitude<input value={s.WEATHER_LON || ''} onChange={e => setS({ WEATHER_LON: e.target.value })} /></label></SettingCard>}
    {configTab === 'apps' && <SettingCard title="Apps e downloads" icon={<AppWindow />} wide><label>URL pública do sistema<input value={s.APK_BASE_URL || ''} onChange={e => setS({ APK_BASE_URL: e.target.value })} /></label><label>APK Portaria<input value={s.APK_PORTARIA_URL || ''} onChange={e => setS({ APK_PORTARIA_URL: e.target.value })} placeholder="URL do APK Portaria gerado" /></label><label>APK Síndico<input value={s.APK_SINDICO_URL || ''} onChange={e => setS({ APK_SINDICO_URL: e.target.value })} placeholder="URL do APK Síndico gerado" /></label><label>APK Morador<input value={s.APK_MORADOR_URL || ''} onChange={e => setS({ APK_MORADOR_URL: e.target.value })} placeholder="URL do APK Morador gerado" /></label><p>Na Central Pro, o usuário vê botões limpos de download, sem links técnicos expostos.</p></SettingCard>}
    {configTab === 'master' && <><SettingCard title="Canais liberados" icon={<Crown />}><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_EMAIL, true)} onChange={e => setS({ ENABLE_EMAIL: String(e.target.checked) })} />E-mail / SendGrid</label><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_WHATSAPP, false)} onChange={e => setS({ ENABLE_WHATSAPP: String(e.target.checked) })} />WhatsApp</label><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_TELEGRAM, false)} onChange={e => setS({ ENABLE_TELEGRAM: String(e.target.checked) })} />Telegram</label><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_BROWSER_PUSH, true)} onChange={e => setS({ ENABLE_BROWSER_PUSH: String(e.target.checked) })} />Notificação do navegador</label></SettingCard><SettingCard title="Apps liberados" icon={<Smartphone />}><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_APP_PORTARIA, true)} onChange={e => setS({ ENABLE_APP_PORTARIA: String(e.target.checked) })} />APK Portaria</label><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_APP_SINDICO, true)} onChange={e => setS({ ENABLE_APP_SINDICO: String(e.target.checked) })} />APK Síndico</label><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_APP_MORADOR, true)} onChange={e => setS({ ENABLE_APP_MORADOR: String(e.target.checked) })} />APK Morador</label></SettingCard><SettingCard title="Cadastro pela tela de login" icon={<UserPlus />} wide><label className="check"><input type="checkbox" checked={asBool(s.REGISTRATION_REQUIRE_EMAIL, true)} onChange={e => setS({ REGISTRATION_REQUIRE_EMAIL: String(e.target.checked) })} />Exigir e-mail quando o canal estiver liberado</label><label className="check"><input type="checkbox" checked={asBool(s.REGISTRATION_REQUIRE_WHATSAPP, false)} onChange={e => setS({ REGISTRATION_REQUIRE_WHATSAPP: String(e.target.checked), ENABLE_WHATSAPP: String(e.target.checked || asBool(s.ENABLE_WHATSAPP,false)) })} />Exibir WhatsApp no cadastro</label><label className="check"><input type="checkbox" checked={asBool(s.REGISTRATION_REQUIRE_TELEGRAM, false)} onChange={e => setS({ REGISTRATION_REQUIRE_TELEGRAM: String(e.target.checked), ENABLE_TELEGRAM: String(e.target.checked || asBool(s.ENABLE_TELEGRAM,false)) })} />Exibir Telegram no cadastro</label></SettingCard></>}
    {configTab === 'atualizacoes' && <><SettingCard title="Central de atualizações" icon={<UploadCloud />}><label className="check"><input type="checkbox" checked={asBool(s.ENABLE_SYSTEM_UPDATES, true)} onChange={e => setS({ ENABLE_SYSTEM_UPDATES: String(e.target.checked) })} />Permitir atualização por ZIP validado</label><label>Canal<select value={s.UPDATE_CHANNEL || 'stable'} onChange={e => setS({ UPDATE_CHANNEL: e.target.value })}><option value="stable">Estável</option><option value="beta">Beta</option><option value="cliente">Cliente específico</option></select></label><label>Modo de aplicação<select value={s.UPDATE_APPLY_MODE || 'github'} onChange={e => setS({ UPDATE_APPLY_MODE: e.target.value })}><option value="github">GitHub + Render</option><option value="manual">Somente validar</option><option value="local">Local/VPS</option></select></label></SettingCard><SettingCard title="GitHub e feed" icon={<Download />}><label>Repositório<input value={s.UPDATE_GITHUB_REPO || ''} onChange={e => setS({ UPDATE_GITHUB_REPO: e.target.value })} /></label><label>Branch<input value={s.UPDATE_GITHUB_BRANCH || 'main'} onChange={e => setS({ UPDATE_GITHUB_BRANCH: e.target.value })} /></label><label>URL do feed de atualizações<input value={s.UPDATE_FEED_URL || ''} onChange={e => setS({ UPDATE_FEED_URL: e.target.value })} /></label><small>Tokens e deploy hook ficam no Render, nunca no GitHub.</small></SettingCard></>}
    {configTab === 'banco' && <><SettingCard title="Banco para boletos" icon={<BadgeDollarSign />}><label>Provedor<select value={s.BANK_PROVIDER || 'manual'} onChange={e => setS({ BANK_PROVIDER: e.target.value, BOLETO_PROVIDER: e.target.value })}><option value="manual">Manual / qualquer banco</option><option value="efi">Efí / Gerencianet</option><option value="sicoob">Sicoob</option><option value="sicredi">Sicredi</option><option value="inter">Banco Inter</option><option value="asaas">Asaas</option><option value="outro">Outro via API</option></select></label><label>URL base da API<input value={s.BANK_API_BASE_URL || ''} onChange={e => setS({ BANK_API_BASE_URL: e.target.value })} /></label><label>Client ID / identificador<input value={s.BANK_CLIENT_ID || ''} onChange={e => setS({ BANK_CLIENT_ID: e.target.value })} /></label><small>Client Secret, certificados e tokens ficam no Render, nunca no GitHub.</small></SettingCard><SettingCard title="Dados bancários" icon={<WalletCards />}><label>Agência<input value={s.BANK_AGENCY || ''} onChange={e => setS({ BANK_AGENCY: e.target.value })} /></label><label>Conta<input value={s.BANK_ACCOUNT || ''} onChange={e => setS({ BANK_ACCOUNT: e.target.value })} /></label><label>Carteira/convênio<input value={s.BANK_WALLET || ''} onChange={e => setS({ BANK_WALLET: e.target.value })} /></label><label>Contrato<input value={s.BANK_CONTRACT || ''} onChange={e => setS({ BANK_CONTRACT: e.target.value })} /></label><label>Chave Pix<input value={s.BANK_PIX_KEY || ''} onChange={e => setS({ BANK_PIX_KEY: e.target.value })} /></label><label className="check"><input type="checkbox" checked={asBool(s.BOLETO_AUTO_GENERATE, false)} onChange={e => setS({ BOLETO_AUTO_GENERATE: String(e.target.checked) })} />Gerar boleto automaticamente nas taxas</label></SettingCard></>}
  </div><button className="saveConfig" onClick={() => action(savePath, s, 'Configurações salvas')}><Save />Salvar configurações</button></Panel>;
}

function SettingCard({ title, icon, children, wide }) { return <section className={wide ? 'settingsCard wideCard' : 'settingsCard'}><h3>{icon}{title}</h3>{children}</section>; }

function CentralProPage(props) {
  return <div className="stack"><AppsPage {...props} /><ManualsPage {...props} /><UpdatesPage {...props} /></div>;
}


function ManualsPage({ data, forms, setForm, notify, loadAll, session }) {
  const [busy, setBusy] = useState(false);
  async function uploadManual(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) return notify('Envie um arquivo PDF.', true);
    setBusy(true);
    try { const fd = new FormData(); fd.append('manual', file); fd.append('title', forms.manualUpload.title || file.name.replace(/\.pdf$/i,'')); fd.append('audience', forms.manualUpload.audience || 'geral'); const token = localStorage.getItem('vr_token'); const res = await fetch(API + '/api/manuals', { method:'POST', headers: token ? { Authorization:'Bearer ' + token } : {}, body: fd }); const result = await res.json().catch(()=>({})); if (!res.ok) throw new Error(result.error || 'Falha ao enviar manual.'); notify('Manual enviado para o sistema'); await loadAll?.(); } catch(e){ notify(e.message, true); } finally { setBusy(false); }
  }
  return <Panel title="Manuais do sistema" subtitle="Documentos de ajuda disponíveis para moradores, portaria e administração." icon={<FileText />}>
    {session?.role === 'master' && <div className="manualUpload"><div className="formGrid"><input placeholder="Título do manual" value={forms.manualUpload.title || ''} onChange={e => setForm('manualUpload', { title:e.target.value })} /><select value={forms.manualUpload.audience || 'geral'} onChange={e => setForm('manualUpload', { audience:e.target.value })}><option value="geral">Geral</option><option value="morador">Morador</option><option value="portaria">Portaria</option><option value="sindico">Síndico</option><option value="reservado">Reservado</option></select><label className="fileButton"><UploadCloud />{busy ? 'Enviando...' : 'Enviar manual PDF'}<input disabled={busy} type="file" accept="application/pdf,.pdf" onChange={e => uploadManual(e.target.files?.[0])} /></label></div></div>}
    <Table rows={data.manuals || []} render={m => <><td><b>{m.title}</b><small>{m.filename}</small></td><td>{m.audience}</td><td>{Math.round((m.size_bytes||0)/1024)} KB</td><td className="actions"><a className="buttonlike" href={`${API}/api/manuals/${m.id}/download`} target="_blank" rel="noreferrer"><Download />Baixar</a></td></>} />
  </Panel>;
}

function UpdatesPage({ data, notify, loadAll, action }) {
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(null);
  const updates = data.updates || [];
  useEffect(() => { request('/api/system-updates/config').then(setCfg).catch(() => null); }, []);
  async function uploadUpdate(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return notify('Envie um arquivo .zip de atualização.', true);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('update_zip', file);
      const token = localStorage.getItem('vr_token');
      const res = await fetch(API + '/api/system-updates/upload', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: fd });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Falha ao enviar atualização.');
      notify(result.message || 'Atualização validada e notificação enviada');
      await loadAll();
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }
  async function checkFeed() {
    setBusy(true);
    try { const r = await post('/api/system-updates/check-feed', {}); notify(r?.latest?.version ? 'Verificação concluída. Veja as notificações.' : 'Feed verificado.'); await loadAll(); }
    catch(e){ notify(e.message, true); }
    finally{ setBusy(false); }
  }
  return <Panel title="Central de atualizações" subtitle="Atualize o sistema pelo próprio painel enviando o ZIP oficial com código e token exclusivos." icon={<UploadCloud />}>
    <div className="noticeBox"><b>Como funciona</b><small>O administrador envia o ZIP criado oficialmente. O sistema valida produto, código, token interno, checksum, caminhos perigosos e possíveis segredos. Depois pode publicar no GitHub e acionar o deploy do Render quando as variáveis estiverem configuradas.</small></div>
    <div className="metricStrip aligned">
      <Metric icon={<Activity />} label="Versão atual" value={cfg?.currentVersion || VERSION} />
      <Metric icon={<UploadCloud />} label="GitHub" value={cfg?.githubTokenConfigured ? 'Pronto' : 'Configurar'} />
      <Metric icon={<RefreshCcw />} label="Deploy hook" value={cfg?.renderDeployHookConfigured ? 'Ativo' : 'Manual'} />
      <Metric icon={<ShieldCheck />} label="Pacotes" value={updates.length} />
      <Metric icon={<Bell />} label="Notificação" value="Automática" />
      <Metric icon={<KeyRound />} label="Token" value="Por ZIP" />
    </div>
    <div className="split">
      <section className="updateDrop">
        <UploadCloud />
        <h3>Enviar pacote .zip</h3>
        <p>O arquivo deve conter <Code>vr-update.json</Code>, <Code>payload.zip</Code>, código <Code>VRUPD-...</Code>, token único <Code>VRTK-...</Code> e hash do pacote.</p>
        <label className="fileButton"><UploadCloud />{busy ? 'Processando...' : 'Selecionar ZIP'}<input disabled={busy} type="file" accept=".zip,application/zip" onChange={e => uploadUpdate(e.target.files?.[0])} /></label>
      </section>
      <section className="settingsCard">
        <h3><Settings />Configuração necessária</h3>
        <span className="miniRow">Repositório <small>{cfg?.githubRepo || 'configure UPDATE_GITHUB_REPO'}</small></span>
        <span className="miniRow">Branch <small>{cfg?.githubBranch || 'main'}</small></span>
        <span className="miniRow">Token GitHub <small>{cfg?.githubTokenConfigured ? 'configurado no Render' : 'falta UPDATE_GITHUB_TOKEN'}</small></span>
        <span className="miniRow">Deploy Render <small>{cfg?.renderDeployHookConfigured ? 'deploy automático' : 'Manual Deploy no Render'}</small></span>
        <button className="saveConfig" onClick={checkFeed}><RefreshCcw />Verificar feed de atualização</button>
      </section>
    </div>
    <section className="wide"><h3><ShieldCheck />Atualizações recebidas</h3><Table rows={updates} render={u => <><td><b>{u.title || u.label || u.version || u.update_code}</b><small>{u.update_code}</small><small>{u.source_filename}</small></td><td><Status ok={['publicada','aplicado','validado'].includes(u.status)}>{u.status || 'validada'}</Status><small>{u.validated_at ? 'validada em ' + date(u.validated_at) : date(u.created_at)}</small></td><td><Code>{u.payload_sha256 || '-'}</Code></td><td className="actions"><button onClick={() => action(`/api/system-updates/${u.id}/notify`, {}, 'Aviso reenviado') }><Bell />Notificar</button><button onClick={() => action(`/api/system-updates/${u.id}/apply`, {}, 'Atualização publicada no GitHub/Render') }><CheckCircle2 />Aplicar</button></td></>} /></section>
    <section className="wide"><h3><Download />Primeira ativação</h3><p>A versão v9.1 ainda não tinha atualização automática completa. Suba esta versão pelo Mac/GitHub quando a Central ainda não estiver ativa. Depois disso, as próximas atualizações poderão ser enviadas por aqui como ZIP validado.</p></section>
  </Panel>;
}


function AppsPage({ settings, session }) {
  const profileUrl = (kind) => `${location.origin}/?app=${kind}#/${kind === 'sindico' ? 'dashboard' : kind}`;
  const apkUrl = (kind) => settings[`APK_${kind.toUpperCase()}_URL`] || `${API}/api/apps/download/${kind}`;
  const apps = [
    ['portaria','Portaria APK','Visitantes, encomendas, calendário e leitura automática.',DoorOpen,'ENABLE_APP_PORTARIA'],
    ['sindico','Síndico APK','Administração completa, aprovações, reservas e financeiro.',Crown,'ENABLE_APP_SINDICO'],
    ['morador','Morador APK','Reservas, financeiro da unidade, mensagens e encomendas.',Users,'ENABLE_APP_MORADOR']
  ].filter(a => session?.role === 'master' || appEnabled(settings, a[4]));
  return <Panel title="Baixar aplicativos" subtitle="Downloads claros dentro do sistema. O administrador define quais apps aparecem para cada condomínio." icon={<Smartphone />}>
    <div className="appCards downloadApps">{apps.map(([kind, title, desc, Icon, key]) => { const enabled = appEnabled(settings, key); return <article key={kind} className={!enabled ? 'disabledCard' : ''}><Icon /><h3>{title}</h3><p>{desc}</p><div className="appActions">{enabled ? <><a className="buttonlike" href={apkUrl(kind)} target="_blank" rel="noreferrer"><Download />Baixar APK</a><a className="buttonlike secondary" href={profileUrl(kind)} target="_blank" rel="noreferrer"><AppWindow />Abrir versão web/app</a></> : <span className="noticeBox">Bloqueado pelo plano</span>}</div></article>; })}</div>
    <section className="wide noticeBox"><b>Geração dos APKs</b><small>Quando os APKs forem gerados pelo GitHub Actions, configure APK_PORTARIA_URL, APK_SINDICO_URL e APK_MORADOR_URL. Enquanto isso, o botão usa o download interno do servidor e informa se o arquivo ainda não existe.</small></section>
  </Panel>;
}


function ChannelPicker({ value = {}, onChange, settings = {} }) { const available = enabledChannels(settings); const channels = Object.entries(available).filter(([, enabled]) => enabled).map(([k]) => [k, channelLabel(k)]); return <div className="channels">{channels.map(([k, label]) => <label key={k}><input type="checkbox" checked={Boolean(value[k])} onChange={e => onChange({ ...value, [k]: e.target.checked })} />{label}</label>)}</div>; }
function Panel({ title, subtitle, icon, children, compact }) { return <section className={compact ? 'panel compactPanel' : 'panel'}><div className="panelHead"><div>{icon}<div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div></div>{children}</section>; }
function Metric({ icon, label, value, sub }) { return <article className="metric"><span>{icon}</span><div><b>{value}</b><small>{label}</small>{sub && <em>{sub}</em>}</div></article>; }
function Status({ ok, children }) { return <span className={ok ? 'status ok' : 'status warn'}>{children}</span>; }
function Code({ children }) { return <code className="code">{children}</code>; }
function SearchBox({ query, setQuery, placeholder }) { return <div className="search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder || 'Buscar'} /></div>; }
function Table({ rows = [], render }) { return <div className="tableWrap"><table><tbody>{rows.length ? rows.map((row, i) => <tr key={row.id || i}>{render(row)}</tr>) : <tr><td><small>Nenhum registro encontrado.</small></td></tr>}</tbody></table></div>; }

function emptyData() { return { dashboard: null, residents: [], users: [], employees: [], shifts: [], messages: [], packages: [], visitors: [], invoices: [], notices: [], reservations: [], finance: [], boletos: [], commonAreas: [], incidents: [], maintenance: [], settings: defaultSettings, emergencyTypes: [], emergencyRequests: [], registrationRequests: [], notifications: [], systemUpdates: [], audit: [], weather: null, updates: [], residentCriteria: [], manuals: [], notificationStatus: null }; }
function demoUser(app) { const role = app === 'morador' ? 'morador' : app === 'portaria' ? 'portaria' : 'sindico'; return { id: 1, name: role === 'morador' ? 'Maria Oliveira' : role === 'portaria' ? 'Carlos Portaria' : 'Síndico', email: 'demo@vitoriaregia.local', role, resident_id: role === 'morador' ? 1 : null, permissions: roleDefaultPermissions[role] || roleDefaultPermissions.sindico }; }
function demoData() { return { ...emptyData(), settings: { ...defaultSettings, APPEARANCE: localStorage.getItem('vr_appearance') || 'light', ENABLE_WHATSAPP: 'true', ENABLE_TELEGRAM: 'true' }, weather: { city: 'João Pessoa', temperature: 28, humidity: 72, wind: 12 }, dashboard: { metrics: { residents: 128, pendingPackages: 9, reservationsPending: 3, messagesNew: 4, emergencyPending: 1, boletosPending: 16 } }, residents: [{ id: 1, name: 'Maria Oliveira', unit: '101', email: 'morador@example.com', whatsapp_phone: '5583999990000' }], employees: [{ id: 1, name: 'Carlos Portaria', role: 'portaria', email: 'portaria@example.com', active: true }], shifts: [{ id: 1, employee_id: 1, employee_name: 'Carlos Portaria', role: 'portaria', starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 3600000 * 7).toISOString(), status: 'em serviço' }], messages: [{ id: 1, subject: 'Barulho na garagem', body: 'Pode verificar?', unit: '101', employee_name: 'Carlos Portaria', status: 'nova' }], packages: [{ id: 1, tracking: 'BR123456789BR', recipient: 'Maria Oliveira', unit: '101', pickup_code: 'A7K92P', status: 'pendente', delivery_preference: 'receber_elevador' }], visitors: [{ id: 1, name: 'João Silva', document: '1234567', unit: '101', recurring: true, weekdays: ['seg', 'qua', 'sex'], status: 'autorizado', announcement_channel: 'interfone' }], commonAreas: [{ id: 1, name: 'Salão de festas', fee_amount: 250, rules_document: defaultSettings.RESERVATION_DEFAULT_RULES }, { id: 2, name: 'Churrasqueira', fee_amount: 120, rules_document: defaultSettings.RESERVATION_DEFAULT_RULES }], reservations: [{ id: 1, area: 'Salão de festas', unit: '101', resident: 'Maria Oliveira', reserved_for: todayISO(), start_time: '19:00', end_time: '23:00', status: 'pre_agendada', fee_amount: 250, digitable_line: 'VR000123456' }], finance: [{ id: 1, title: 'Taxa de reserva - Salão', amount: 250, type: 'receita', status: 'pendente', unit: '101', due_date: todayISO(), digitable_line: 'VR000123456' }], boletos: [{ id: 1, title: 'Taxa de reserva - Salão', amount: 250, status: 'pendente', unit: '101', bank_name: 'Banco exemplo', digitable_line: 'VR000123456' }], emergencyTypes: [{ code: 'elevador', label: 'Preso no elevador', supplier: 'Operadora', phone: '0800 000 000', instructions: 'Ligue para a operadora cadastrada.', notify_all: false }, { code: 'incendio', label: 'Fogo / fumaça', supplier: 'Bombeiros', phone: '193', instructions: 'Evacue com segurança.', notify_all: true }, { code: 'invasao', label: 'Invasão do prédio', supplier: 'Polícia Militar', phone: '190', instructions: 'Evite confronto.', notify_all: true }], emergencyRequests: [{ id: 1, type_label: 'Preso no elevador', unit: 'Bloco A', message: 'Pessoa presa', status: 'pendente', notify_all: false }], registrationRequests: [{ id: 1, name: 'Ana Paula', email: 'ana@example.com', unit: '203', status: 'pendente' }], invoices: [{ id: 1, supplier: 'Manutenção Elevadores LTDA', document_number: '4567', amount: 680, due_date: todayISO() }], notices: [{ id: 1, title: 'Assembleia', body: 'Reunião no salão às 19h.', priority: 'alta' }], notifications: [{ id: 1, title: 'Encomenda chegou', body: 'Código A7K92P', status: 'nova' }], systemUpdates: [{ id: 1, update_code: 'VRUPD-DEMO', version: 'v9.4', title: 'Central de atualizações', status: 'validado', payload_sha256: 'demo' }], users: [{ id: 2, name: 'Síndico', email: 'admin@vitoriaregia.local', role: 'sindico', active: true }], residentCriteria: [{ id:1, key:'pet', label:'Possui pet' }, { id:2, key:'imovel_alugado', label:'Imóvel alugado' }, { id:3, key:'possui_carro', label:'Possui carro' }], manuals: [{ id:1, title:'Manual do morador', audience:'morador', filename:'manual-morador.pdf', size_bytes:102400 }], notificationStatus: { email:{enabled:true, provider:'sendgrid', sendgrid_key:true}, whatsapp:{enabled:true, token:'configurado'}, telegram:{enabled:true, token:'configurado'}, browser:{enabled:true} }, updates: [{ id: 1, update_code: 'VRUP-DEMO-9200-0001', version: '9.4.0', label: 'Central de Atualizações', status: 'validada', source_filename: 'atualizacao-demo.zip', file_count: 85, payload_size: 5734400, payload_sha256: 'demo' }] }; }
async function demoRequest(path, opts) { if (path === '/api/login') return { token: 'demo', user: demoUser('sindico') }; if (path.includes('/google')) return { url: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Reserva' }; return { ok: true }; }

createRoot(document.getElementById('root')).render(<App />);
