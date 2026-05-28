import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Tesseract from 'tesseract.js';
import {
  Home, Menu, X, LogOut, Building2, Users, Package, CalendarDays, WalletCards, Bell, AlertTriangle,
  Settings, ShieldCheck, UserPlus, Search, Plus, Save, Camera, ScanLine, Send, CheckCircle2, Download,
  UploadCloud, Palette, Mail, MessageCircle, Smartphone, KeyRound, Eye, EyeOff, Siren, ClipboardList,
  BadgeDollarSign, FileText, Wrench, Activity, RefreshCcw, Trash2, Edit3, MapPin, UserCheck, CloudSun,
  AppWindow, Phone, Banknote, History, Paintbrush, PanelLeft, CheckSquare, Info, ChevronRight, Flame, ShieldAlert, Ambulance, Droplets, Zap, BellRing, FireExtinguisher, CircleAlert, Clock, CalendarClock, Repeat, UserCog, Briefcase, ArrowRightLeft, BookOpen, FileUp, HelpCircle, FileSearch, MessageSquareText, ClipboardCheck
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '';
const VERSION = import.meta.env.VITE_APP_VERSION || 'Vitória Régia Pro v12.6.4';
const DEFAULT_TELEGRAM_CHAT_ID = '8188648317';
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const date = (v) => v ? new Date(String(v)).toLocaleDateString('pt-BR', { timeZone:'UTC' }) : '-';
const todayISO = () => new Date().toISOString().slice(0, 10);
const bool = (v, fallback=false) => v === undefined || v === null || v === '' ? fallback : ['1','true','sim','yes','on','ativo','liberado'].includes(String(v).trim().toLowerCase());
const roleLabel = (role) => role === 'master' || role === 'admin' ? 'Administrador' : ({ sindico:'Síndico', subsindico:'Subsíndico', portaria:'Portaria', morador:'Morador', funcionario:'Funcionário', financeiro:'Financeiro' }[role] || role || 'Usuário');
const channelNames = { app:'Sistema', browser:'Navegador', email:'E-mail', telegram:'Telegram', whatsapp:'WhatsApp' };
const deliveryPreferenceLabel = (v) => ({ receber_elevador:'Autorizou envio pelo elevador', retirar_portaria:'Vai retirar na portaria', buscar_portaria:'Vai retirar na portaria', retirar_mais_tarde:'Vai retirar mais tarde', retirar_agora:'Está indo retirar agora', chamar_interfone:'Pediu contato/interfone antes', nao_reconhece:'Não reconhece esta encomenda', portaria:'Vai retirar na portaria', elevador:'Autorizou envio pelo elevador', nao_informado:'Aguardando escolha do morador' }[String(v||'').toLowerCase()] || 'Aguardando escolha do morador');
function appUrl(path=''){ const clean=String(path||'').replace(/^\/+/, ''); return window.location.origin + '/' + clean; }
const sensitive = new Set(['SENDGRID_API_KEY','SMTP_PASS','TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_API_TOKEN','UPDATE_GITHUB_TOKEN','DATABASE_URL','JWT_SECRET','BANK_CLIENT_SECRET','BANK_API_TOKEN','VAPID_PRIVATE_KEY']);
function maskValue(v){ if(!v) return 'não configurado'; const s=String(v); if(s.includes('***')) return s; return s.length < 8 ? 'configurado' : s.slice(0,3)+'***'+s.slice(-3); }
function clean(obj){ return Object.fromEntries(Object.entries(obj||{}).filter(([,v]) => v !== undefined && v !== null)); }
function nonEmpty(obj){ return Object.fromEntries(Object.entries(obj||{}).filter(([,v]) => v !== undefined && v !== null && String(v).trim() !== '')); }
function parseJson(value, fallback){ try { return typeof value === 'string' ? JSON.parse(value) : (value || fallback); } catch { return fallback; } }
function defaultCriteria(settings={}){ return parseJson(settings.RESIDENT_CRITERIA, [{key:'possui_pet',label:'Possui pet'},{key:'imovel_alugado',label:'Imóvel alugado'},{key:'possui_carro',label:'Possui carro'},{key:'idoso_ou_pcd',label:'Idoso ou pessoa com deficiência'}]); }
function enabledChannels(settings={}){ return { app:true, browser:bool(settings.ENABLE_BROWSER_PUSH,true), email:bool(settings.ENABLE_EMAIL,true), telegram:bool(settings.ENABLE_TELEGRAM,true), whatsapp:bool(settings.ENABLE_WHATSAPP,false) }; }
function initialForms(){ return {
  login:{ email:'admin@vitoriaregia.local', password:'123456' }, register:{ name:'', email:'', phone:'', whatsapp_phone:'', telegram_username:'', telegram_chat_id:'', unit:'', document:'', role:'morador' }, forgot:{ email:'' },
  profile:{ name:'', email:'', phone:'', whatsapp_phone:'', telegram_username:'', telegram_chat_id:'', unit:'', document:'', vehicle:'', notification_preferences:{ app:true, browser:true, email:true, telegram:true, whatsapp:false }, password:'' }, householdMember:{ name:'', email:'', phone:'', whatsapp_phone:'', telegram_username:'', telegram_chat_id:'', document:'' },
  resident:{ id:'', name:'', unit:'', phone:'', whatsapp_phone:'', email:'', telegram_username:'', telegram_chat_id:'', document:'', vehicle:'', vehicle_model:'', vehicle_plate:'', pet_name:'', notes:'', resident_tags:{}, notification_preferences:{ app:true, browser:true, email:true, telegram:true, whatsapp:false } },
  user:{ id:'', name:'', email:'', password:'', role:'morador', user_type:'morador', unit:'', phone:'', whatsapp_phone:'', telegram_username:'', telegram_chat_id:'', resident_id:'', active:true, notification_preferences:{ app:true, browser:true, email:true, telegram:true, whatsapp:false } },
  employee:{ name:'', role:'portaria', phone:'', email:'', active:true, notes:'' }, shift:{ employee_id:'', role:'portaria', date:todayISO(), recurrence_type:'single', weekdays:[], month_days:[], shift_type:'manha', starts_at:'', ends_at:'', start_time:'', end_time:'', use_custom_time:false, temporary_for_employee_id:'', substitution_reason:'dia', allow_employee_edit:false, notes:'' },
  package:{ tracking:'', recipient:'', unit:'', label:'', notes:'', extracted_text:'', photo_url:'', notification_channels:{ app:true, browser:true, email:true, telegram:true, whatsapp:false } },
  visitor:{ name:'', document:'', phone:'', unit:'', authorized_by:'', plate:'', recurring:false, weekdays:[], valid_from:'', valid_until:'', announce_required:true, announcement_channel:'interfone', photo_data:'', notes:'' },
  reservation:{ area:'Salão de festas', unit:'', resident:'', resident_id:'', reserved_for:todayISO(), reservation_mode:'periodo', period_label:'Noite', start_time:'19:00', end_time:'23:00', shift:'noite', all_day:false, terms_accepted:false, document_text:'', fee_amount:'' },
  reservationGuest:{ reservation_id:'', name:'', document:'', phone:'', plate:'', visitor_type:'convidado', age_group:'adulto', counts_as_guest:true, notes:'', photo_data:'' }, reservationVisitors:{ reservation_id:'', bulk:'' },
  commonArea:{ id:'', name:'', fee_amount:'', rules_document:'', active:true, requires_approval:true, max_guests:'30', count_children:true, count_infants:false, reservation_periods:'dia_todo,manha,tarde,noite,horario' },
  finance:{ title:'', amount:'', type:'receita', due_date:'', unit:'', category:'geral', generate_boleto:false, digitable_line:'', payment_link:'', bank_name:'' }, boleto:{ title:'', amount:'', due_date:'', unit:'', bank_name:'', digitable_line:'', barcode:'', pdf_url:'', payment_link:'' },
  invoice:{ supplier:'', document_number:'', access_key:'', amount:'', issue_date:'', due_date:'', unit:'', category:'nota fiscal', extracted_text:'', file_name:'' },
  notice:{ title:'', body:'', priority:'normal', target_role:'todos', target_criteria:{} }, notifyTest:{ channel:'email', to:'', phone:'', chat_id:'', telegram_username:'', target_type:'padrao', resident_id:'', user_id:'', subject:'Teste Vitória Régia', message:'Mensagem de teste do Sistema Vitória Régia.' },
  message:{ subject:'', body:'', unit:'' }, emergency:{ type:'elevador', unit:'', location_type:'login', occurrence_location:'login', neighbor_unit:'', floor:'', message:'' }, settings:{ TELEGRAM_CHAT_ID:DEFAULT_TELEGRAM_CHAT_ID, TELEGRAM_TEST_CHAT_ID:DEFAULT_TELEGRAM_CHAT_ID, ELEVATOR_MAINTENANCE_WHATSAPP:'', EMERGENCY_ALLOW_GENERAL_ALERT:'true' }, systemUpdate:{ validation_code:'', mode:'github' }, document:{ title:'', description:'', audience:'publico', is_public:true }, occurrence:{ title:'', description:'', category:'queixa', priority:'normal', unit:'' }, support:{ subject:'', body:'', priority:'normal' }, financeImport:{ text:'', unit:'', previewRows:[] }
};}
function emptyData(){ return { settings:{}, dashboard:null, residents:[], users:[], employees:[], shifts:[], messages:[], packages:[], visitors:[], invoices:[], notices:[], reservations:[], finance:[], boletos:[], commonAreas:[], incidents:[], maintenance:[], emergencyTypes:[], emergencyRequests:[], registrationRequests:[], notifications:[], audit:[], weather:null, systemUpdates:[], manuals:[], documents:[], faqs:[], supportTickets:[], occurrenceBook:[], notifyConfig:null }; }
async function request(path, opts={}){
  const token = localStorage.getItem('vr_token');
  const headers = opts.raw ? (opts.headers || {}) : { 'Content-Type':'application/json', ...(opts.headers || {}) };
  const res = await fetch(API + path, { ...opts, headers:{ ...headers, ...(token ? { Authorization:'Bearer '+token } : {}) } });
  if(opts.blob) { if(!res.ok) throw new Error(await res.text()); return res.blob(); }
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || data.message || 'Erro na operação');
  return data;
}
const post = (path, body) => request(path, { method:'POST', body:JSON.stringify(body) });
const put = (path, body) => request(path, { method:'PUT', body:JSON.stringify(body) });
const del = (path) => request(path, { method:'DELETE' });

const routeDefaults = { portaria:'encomendas', reservas:'calendario', cadastros:'moradores', financeiro:'movimentos', comunicacao:'notificacoes', central:'apps', configuracoes:'aparencia' };
const routeAliases = {
  reservas:['reservas','calendario'], reserva:['reservas','calendario'], espacos:['reservas','espacos'],
  encomendas:['portaria','encomendas'], visitantes:['portaria','visitantes'], escalas:['portaria','escalas'], mensagens:['portaria','mensagens'], portaria:['portaria','encomendas'],
  boletos:['financeiro','boletos'], movimentos:['financeiro','movimentos'], financeiro:['financeiro','movimentos'],
  moradores:['cadastros','moradores'], usuarios:['cadastros','usuarios'], solicitacoes:['cadastros','solicitacoes'], cadastros:['cadastros','moradores'],
  notificacoes:['comunicacao','notificacoes'], comunicados:['comunicacao','comunicados'], testes:['comunicacao','testes'], comunicacao:['comunicacao','notificacoes'],
  apps:['central','apps'], updates:['central','updates'], manuais:['central','manuais'], documentos:['central','documentos'], central:['central','apps'], ocorrencias:['ocorrencias','livro'], suporte:['suporte','faq'],
  aparencia:['configuracoes','aparencia'], menu:['configuracoes','menu'], notificacao:['configuracoes','notificacoes'], telegram:['configuracoes','telegram'], whatsapp:['configuracoes','whatsapp'], email:['configuracoes','email'], banco:['configuracoes','banco'], auditoria:['configuracoes','auditoria'], configuracoes:['configuracoes','aparencia']
};
function routeState(raw='dashboard', explicitSub){
  const cleanRoute = String(raw || 'dashboard').replace(/^#?\/?/, '').replace(/^\//, '');
  const [first, second] = cleanRoute.split('/').filter(Boolean);
  const key = first || 'dashboard';
  if(key === 'reservas' || key === 'reserva'){
    return { active:'reservas', sub: explicitSub || second || 'calendario' };
  }
  if(routeAliases[key]){
    const [active, aliasSub] = routeAliases[key];
    return { active, sub: explicitSub || second || aliasSub || routeDefaults[active] };
  }
  return { active:key, sub: explicitSub || second || routeDefaults[key] };
}
function routeHash(active, sub){
  return '/' + active + (sub && routeDefaults[active] ? '/' + sub : '');
}
function currentRouteState(){
  const hash = window.location.hash || '#/dashboard';
  const normalized = (hash.replace(/^#/, '') || '/dashboard').replace(/^\/?/, '/');
  if (/^\/reservas(\/|$)/i.test(normalized)) return { active:'reservas', sub:'calendario' };
  return routeState(hash || 'dashboard');
}
function isReservasHash(){
  const normalized = String(window.location.hash || '').replace(/^#/, '').replace(/^\/?/, '/');
  return /^\/reservas(\/|$)/i.test(normalized);
}

function App(){
  const [session,setSession] = useState(() => JSON.parse(localStorage.getItem('vr_user') || 'null'));
  const [forms,setForms] = useState(initialForms());
  const [data,setData] = useState(emptyData());
  const initialRoute = currentRouteState();
  const [active,setActive] = useState(initialRoute.active);
  const [sub,setSub] = useState(initialRoute.sub || 'encomendas');
  const [configTab,setConfigTab] = useState('aparencia');
  const [loginMode,setLoginMode] = useState('login');
  const [menuOpen,setMenuOpen] = useState(false);
  const [menuClosed,setMenuClosed] = useState(false);
  const [showPass,setShowPass] = useState(false);
  const [toast,setToast] = useState('');
  const [err,setErr] = useState('');
  const [confirm,setConfirm] = useState(null);
  const [reading,setReading] = useState('');
  const [lookup,setLookup] = useState({});
  const settings = { ...data.settings, ...Object.fromEntries(Object.entries(forms.settings || {}).filter(([,v]) => v !== '' && v !== undefined && v !== null)) };
  const isAdminReserved = ['master','admin'].includes(session?.role);
  const can = (perm) => isAdminReserved || session?.role === 'sindico' || Boolean(session?.permissions?.[perm]);

  useEffect(() => {
    const accent = settings.THEME_ACCENT || '#126b5f';
    const accent2 = settings.THEME_ACCENT_2 || settings.THEME_SECONDARY || '#35b5a2';
    document.body.dataset.appearance = settings.APPEARANCE || 'light';
    document.body.dataset.textsize = settings.THEME_TEXT_SIZE || settings.UI_DENSITY || 'comfort';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent2', accent2);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', accent);
  }, [settings.APPEARANCE, settings.UI_DENSITY, settings.THEME_TEXT_SIZE, settings.THEME_ACCENT, settings.THEME_ACCENT_2, settings.THEME_SECONDARY]);
  useEffect(() => { if(session) loadAll(); else request('/api/public-config').then(s => setData(d => ({ ...d, settings:s }))).catch(()=>null); }, [session]);
  useEffect(() => { if(!session) return; const id=setInterval(() => { request('/api/notifications').then(notifications => setData(d => ({...d, notifications}))).catch(()=>null); }, 5000); return () => clearInterval(id); }, [session]);
  useEffect(() => {
    const syncRoute=()=>{
      const r=currentRouteState();
      setActive(r.active);
      if(r.sub) setSub(r.sub);
      if(r.active==='reservas' && window.location.hash !== '#/reservas/calendario') {
        window.history.replaceState(null, '', '#/reservas/calendario');
      }
    };
    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('focus', syncRoute);
    return()=>{ window.removeEventListener('hashchange', syncRoute); window.removeEventListener('popstate', syncRoute); window.removeEventListener('focus', syncRoute); };
  }, []);

  function setForm(group, patch){ setForms(f => ({ ...f, [group]:{ ...f[group], ...patch } })); }
  function notify(message, fail=false){ setToast(message); if(fail) document.body.classList.add('shake'); setTimeout(()=>{ setToast(''); document.body.classList.remove('shake'); }, 3800); }
  async function safe(path, fallback){ try { return await request(path); } catch { return fallback; } }
  async function loadAll(){
    const [settingsRes,dashboard,residents,users,employees,shifts,messages,packagesRes,visitors,invoices,notices,reservations,finance,boletos,commonAreas,incidents,maintenance,emergencyTypes,emergencyRequests,registrationRequests,notifications,audit,weather,systemUpdates,manuals,documents,faqs,supportTickets,occurrenceBook,notifyConfig] = await Promise.all([
      safe('/api/settings',{}), safe('/api/dashboard',null), safe('/api/residents',[]), safe('/api/users',[]), safe('/api/employees',[]), safe('/api/shifts',[]), safe('/api/messages',[]), safe('/api/packages',[]), safe('/api/visitors',[]), safe('/api/invoices',[]), safe('/api/notices',[]), safe('/api/reservations',[]), safe('/api/finance',[]), safe('/api/boletos',[]), safe('/api/common-areas',[]), safe('/api/incidents',[]), safe('/api/maintenance',[]), safe('/api/emergency-types',[]), safe('/api/emergency-requests',[]), safe('/api/registration-requests',[]), safe('/api/notifications',[]), safe('/api/audit',[]), safe('/api/weather',null), safe('/api/system-updates',[]), safe('/api/manuals',[]), safe('/api/documents',[]), safe('/api/faqs',[]), safe('/api/support-tickets',[]), safe('/api/occurrence-book',[]), safe('/api/notify/config',null)
    ]);
    setData({ settings:settingsRes, dashboard, residents, users, employees, shifts, messages, packages:packagesRes, visitors, invoices, notices, reservations, finance, boletos, commonAreas, incidents, maintenance, emergencyTypes, emergencyRequests, registrationRequests, notifications, audit, weather, systemUpdates, manuals, documents, faqs, supportTickets, occurrenceBook, notifyConfig });
    setForms(f => ({ ...f, settings:settingsRes }));
  }
  async function doLogin(e){ e.preventDefault(); setErr(''); try { const r=await post('/api/login', forms.login); localStorage.setItem('vr_token', r.token); localStorage.setItem('vr_user', JSON.stringify(r.user)); setSession(r.user); if(r.user?.force_password_change){ setActive('perfil'); notify('Senha temporária detectada. Altere sua senha no Meu Perfil para continuar com segurança.'); } else { notify('Login realizado com segurança'); } } catch(e){ setErr(e.message); } }
  function logout(){ localStorage.removeItem('vr_token'); localStorage.removeItem('vr_user'); setSession(null); setActive('dashboard'); }
  async function action(path, body, message, method='POST'){
    try {
      if (method === 'PUT') await put(path, body);
      else if (method === 'DELETE') await request(path, { method:'DELETE' });
      else await post(path, body);
      notify(message);
      await loadAll();
      return true;
    } catch(e){ notify(e.message, true); return false; }
  }
  function openConfirm(title, fields, fn){ setConfirm({ title, fields, fn }); }
  async function confirmRun(){ const c=confirm; setConfirm(null); if(c?.fn) await c.fn(); }
  function go(tab, newSub){
    const r=routeState(tab, tab==='reservas' ? (newSub || 'calendario') : newSub);
    const nextHash = '#'+routeHash(r.active, r.sub);
    setActive(r.active);
    if(r.sub) setSub(r.sub);
    if(window.location.hash !== nextHash) window.location.hash=nextHash;
    setMenuOpen(false);
  }
  async function lookupUnit(group, unit, maybeName=''){
    if(!unit) return null;
    try { const res = await request('/api/residents/lookup?unit='+encodeURIComponent(unit)+'&name='+encodeURIComponent(maybeName||'')); setLookup(l=>({ ...l, [group]:res })); const resident=res.primary || res.residents?.[0];
      if(resident){ if(group==='package') setForm('package',{ recipient:forms.package.recipient || resident.name }); if(group==='reservation') setForm('reservation',{ resident:forms.reservation.resident || resident.name, resident_id:resident.id }); }
      return res;
    } catch(e){ setLookup(l=>({ ...l, [group]:{ residents:[], message:e.message } })); return null; }
  }
  function prefillResidentFromContext(group){ const p = forms[group] || {}; setForm('resident', { ...forms.resident, name:p.recipient || p.resident || '', unit:p.unit || '', notes:p.extracted_text ? 'Criado a partir da leitura automática de encomenda.\n'+p.extracted_text.slice(0,500) : '' }); go('cadastros','moradores'); notify('Cadastro de morador pré-preenchido. Confira e salve.'); }
  async function readImage(file, type){
    if(!file) return;
    setReading(type);
    try {
      notify(type==='package' ? 'Lendo etiqueta. Segure a câmera reta e com boa luz.' : 'Lendo nota fiscal. Confira os dados ao final.');
      const result = await Tesseract.recognize(file, 'por+eng', { logger: m => { if(m?.status==='recognizing text' && m.progress) setToast(`Leitura automática ${Math.round(m.progress*100)}%`); } });
      const text = result?.data?.text || '';
      if(!text.trim()) throw new Error('não foi possível identificar texto na imagem. Tente aproximar e tirar outra foto.');
      const parsed = await post(type==='package' ? '/api/ocr/parse-package' : '/api/ocr/parse-invoice', { text });
      if(type==='package'){
        const patch = nonEmpty({ tracking:parsed.tracking, recipient:parsed.recipient, unit:parsed.unit, label:parsed.label, notes:parsed.notes, extracted_text:text });
        setForm('package', { ...forms.package, ...patch });
        if(parsed.unit) await lookupUnit('package', parsed.unit, parsed.recipient);
      } else {
        const patch = nonEmpty({ supplier:parsed.supplier, document_number:parsed.document_number, access_key:parsed.access_key, amount:parsed.amount, issue_date:parsed.issue_date, due_date:parsed.due_date, unit:parsed.unit, category:parsed.category, extracted_text:text });
        setForm('invoice', { ...forms.invoice, ...patch });
      }
      notify('Leitura automática concluída. Preenchi somente o que consegui detectar. Confira antes de salvar.');
    } catch(e){
      notify('Não consegui fazer a leitura automática: '+e.message, true);
    } finally { setReading(''); }
  }
  async function fileToData(file, cb){ if(!file) return; const reader = new FileReader(); reader.onload = () => cb(reader.result); reader.readAsDataURL(file); }

  if(!session) return <LoginPage forms={forms} setForm={setForm} mode={loginMode} setMode={setLoginMode} doLogin={doLogin} err={err} setShowPass={setShowPass} showPass={showPass} action={action} settings={settings} />;
  const menuItems = [ ['dashboard','Início',Home], ['portaria','Portaria',Package], ['reservas','Reservas',CalendarDays], ['financeiro','Financeiro',WalletCards], ['cadastros','Cadastros',Users], ['comunicacao','Comunicação',Bell], ['ocorrencias','Livro de Ocorrências',BookOpen], ['emergencia','Emergência',Siren], ['suporte','Suporte',HelpCircle], ['configuracoes','Configurações',Settings], ['central','Sistema e Apps',ShieldCheck], ['updates','Atualizações',RefreshCcw] ];
  const shellClass = ['appShell', menuOpen?'mobile-open':'', menuClosed?'menu-closed':'', `menu-${settings.MENU_ORIENTATION||'vertical'}`].join(' ');
  const routeNow = currentRouteState();
  const reservasRouteLocked = active==='reservas' || routeNow.active==='reservas' || isReservasHash();
  const visualActive = reservasRouteLocked ? 'reservas' : active;
  const props = { data, forms, setForm, action, notify, loadAll, settings, session, can, openConfirm, lookup, lookupUnit, prefillResidentFromContext, readImage, reading, fileToData, setActive:go, sub, setSub, isAdminReserved, configTab, setConfigTab, del, logout };
  return <div className={shellClass}>
    <button className="mobileMenu" onClick={()=>setMenuOpen(true)}><Menu /></button>{menuOpen && <div className="overlay" onClick={()=>setMenuOpen(false)} />}
    <aside><div className="brand brandCompact brandLogoOnly"><img src="/logo-vitoria-regia-menu.svg" className="brandLogo"/><button className="insideClose menuToggle" title={menuOpen ? 'Fechar menu' : (menuClosed?'Expandir menu':'Recolher menu')} onClick={()=>{ if(window.innerWidth < 861) setMenuOpen(false); else setMenuClosed(!menuClosed); }}>{window.innerWidth < 861 ? <X/> : (menuClosed ? <ChevronRight/> : <PanelLeft/>)}</button></div><nav>{menuItems.map(([key,label,Icon]) => <button key={key} className={visualActive===key?'active':''} aria-current={visualActive===key?'page':undefined} onClick={()=>go(key, key==='reservas'?'calendario':undefined)}><Icon /><span>{label}</span></button>)}</nav><div className="sideBottom"><button onClick={()=>go('perfil')}><UserCheck/><span>Meu perfil</span></button><button onClick={logout}><LogOut/><span>Sair</span></button></div></aside>
    {can('emergency.use') && <button className="floatingEmergency" onClick={()=>go('emergencia')}><Siren/><span>Emergência</span></button>}
    <main className="content"><Topbar session={session} settings={settings} data={data} setActive={go}/>{toast && <div className="toast">{toast}</div>}
      {visualActive==='dashboard' && <Dashboard {...props}/>} {visualActive==='portaria' && <Portaria {...props}/>} {reservasRouteLocked && <Reservations {...props}/>} {visualActive==='financeiro' && <Financeiro {...props}/>} {visualActive==='cadastros' && <Cadastros {...props}/>} {visualActive==='comunicacao' && <Comunicacao {...props}/>} {visualActive==='ocorrencias' && <OccurrenceBook {...props}/>} {visualActive==='emergencia' && <Emergency {...props}/>} {visualActive==='suporte' && <SupportPage {...props}/>} {visualActive==='configuracoes' && <SettingsPage {...props}/>} {visualActive==='central' && <CentralPro {...props}/>} {visualActive==='updates' && <Updates {...props}/>} {visualActive==='perfil' && <Profile {...props}/>} 
    </main><nav className="bottomNav"><button className={visualActive==='dashboard'?'active':''} onClick={()=>go('dashboard')}><Home/><span>Início</span></button><button className={visualActive==='reservas'?'active':''} onClick={()=>go('reservas','calendario')}><CalendarDays/><span>Reservas</span></button><button className={visualActive==='comunicacao'?'active':''} onClick={()=>go('comunicacao','notificacoes')}><Bell/><span>Comunicados</span></button><button className={visualActive==='perfil'?'active':''} onClick={()=>go('perfil')}><UserCheck/><span>Perfil</span></button></nav>{confirm && <ConfirmModal confirm={confirm} onCancel={()=>setConfirm(null)} onConfirm={confirmRun}/>}<Footer /></div>;
}
function LoginPage({ forms,setForm,mode,setMode,doLogin,err,setShowPass,showPass,action,settings }){
  const [registerStatus,setRegisterStatus] = useState(null);
  const [sendingRegister,setSendingRegister] = useState(false);
  const channels=enabledChannels(settings);
  const roleOptions = [
    ['morador','Morador'],
    ['funcionario','Funcionário do condomínio']
  ];
  const selectedRole = ['morador','funcionario'].includes(forms.register.role) ? forms.register.role : 'morador';
  const needsUnit = selectedRole === 'morador';
  const contactEnabled = [channels.email, channels.whatsapp, channels.telegram].some(Boolean);
  const submitRegister = async (e) => {
    e.preventDefault();
    setRegisterStatus(null);
    setSendingRegister(true);
    const payload = {
      ...forms.register,
      role: selectedRole,
      phone: forms.register.phone || forms.register.whatsapp_phone,
      notes: `Solicitação feita pela tela inicial. Tipo: ${roleLabel(selectedRole)}.`
    };
    try {
      const r = await post('/api/register', payload);
      setRegisterStatus({ ok:true, text:r?.message || 'Solicitação enviada para aprovação. Você receberá retorno nos canais cadastrados.' });
    } catch (ex) {
      setRegisterStatus({ ok:false, text:ex.message || 'Não foi possível enviar a solicitação. Confira os dados e tente novamente.' });
    } finally {
      setSendingRegister(false);
    }
  };
  return <div className="loginPage buildingLogin redesignedLogin cleanAccess">
    <section className="loginPhoto">
      <div className="secureNote"><ShieldCheck/><div><b>Acesso seguro e inteligente.</b><small>Seu perfil é identificado automaticamente após aprovação.</small></div></div>
    </section>
    <section className="loginCard premiumLoginCard accessCard">
      <div className="loginBrandBlock"><img src="/logo-vitoria-regia.svg" className="loginLogo"/><b>Vitória Régia</b><small className="logoVersion">{VERSION}</small></div>
      {mode==='login' && <form onSubmit={doLogin}>
        <h2>Bem-vindo de volta!</h2>
        <p>Entre com seu usuário para acessar o painel do condomínio.</p>
        {err && <p className="error">{err}</p>}
        <label>Usuário ou e-mail<div className="loginInputIcon"><UserCheck/><input required placeholder="Ex.: morador@email.com" value={forms.login.email} onChange={e=>setForm('login',{email:e.target.value})}/></div></label>
        <label>Senha<div className="password loginInputIcon"><KeyRound/><input type={showPass?'text':'password'} placeholder="Digite sua senha" required value={forms.login.password} onChange={e=>setForm('login',{password:e.target.value})}/><button type="button" onClick={()=>setShowPass(v=>!v)} aria-label="Mostrar ou ocultar senha">{showPass?<EyeOff/>:<Eye/>}</button></div></label>
        <button type="submit"><KeyRound/> Entrar</button>
        <div className="loginHelpGrid"><button type="button" className="textLink" onClick={()=>setMode('register')}>Solicitar cadastro</button><button type="button" className="textLink subtle" onClick={()=>setMode('forgot')}>Esqueci minha senha</button></div>
      </form>}
      {mode==='register' && <form className="registerForm" onSubmit={submitRegister}>
        <h2>Solicitar cadastro</h2>
        <p className="registerIntro">Escolha o tipo de acesso e preencha somente os dados necessários. e aguarde aprovação do síndico.</p>
        <div className="registerStep"><span>1</span><div><b>Tipo de cadastro</b><small>Define se o acesso será de morador ou funcionário.</small></div></div>
        <div className="roleChoiceGrid">{roleOptions.map(([v,l])=><button key={v} type="button" className={selectedRole===v?'roleChoice active':'roleChoice'} onClick={()=>setForm('register',{role:v, unit:v==='morador'?forms.register.unit:''})}>{v==='morador'?<Building2/>:<Briefcase/>}<span><b>{l}</b><small>{v==='morador'?'Informe sua unidade para receber avisos e reservas.':'Informe setor ou função para análise da administração.'}</small></span></button>)}</div>
        <div className="registerStep"><span>2</span><div><b>Dados principais</b><small>Campos com * são obrigatórios.</small></div></div>
        <div className="formGrid registerGrid">
          <label>Nome completo *<input required placeholder="Nome e sobrenome" value={forms.register.name} onChange={e=>setForm('register',{name:e.target.value})}/></label>
          {needsUnit && <label>Unidade / apartamento *<input required placeholder="Ex.: 101, 502, 1103" value={forms.register.unit} onChange={e=>setForm('register',{unit:e.target.value})}/></label>}
          {!needsUnit && <label>Setor ou função<input placeholder="Ex.: Portaria, limpeza, manutenção" value={forms.register.unit} onChange={e=>setForm('register',{unit:e.target.value})}/></label>}
          <label>Documento<input placeholder="CPF, RG ou documento funcional" value={forms.register.document} onChange={e=>setForm('register',{document:e.target.value})}/></label>
        </div>
        <div className="registerStep"><span>3</span><div><b>Contato para receber o acesso</b><small>Mostramos apenas os canais liberados pelo sistema.</small></div></div>
        {!contactEnabled && <div className="noticeBox warn"><b>Nenhum canal de contato liberado</b><small>Peça ao síndico para liberar e-mail, WhatsApp ou Telegram nas configurações.</small></div>}
        <div className="formGrid registerGrid">
          {channels.email && <label>E-mail {bool(settings.REGISTRATION_REQUIRE_EMAIL,true) ? '*' : ''}<input type="email" required={bool(settings.REGISTRATION_REQUIRE_EMAIL,true)} placeholder="seuemail@exemplo.com" value={forms.register.email} onChange={e=>setForm('register',{email:e.target.value})}/></label>}
          {channels.whatsapp && <label>WhatsApp<input inputMode="tel" placeholder="DDD + número" value={forms.register.whatsapp_phone} onChange={e=>setForm('register',{whatsapp_phone:e.target.value})}/></label>}
          {channels.telegram && <label>Usuário Telegram<input placeholder="@usuario ou @portariavr1" value={forms.register.telegram_username||''} onChange={e=>setForm('register',{telegram_username:e.target.value})}/><small>Use para identificação no cadastro. Para receber mensagem privada do bot, envie /start no @vitoriaregia_bot.</small></label>}
          {channels.telegram && <label>Chat ID Telegram<input inputMode="numeric" placeholder={DEFAULT_TELEGRAM_CHAT_ID} value={forms.register.telegram_chat_id||''} onChange={e=>setForm('register',{telegram_chat_id:e.target.value})}/><small>Opcional. Se souber o ID numérico, o sistema envia diretamente para este Telegram.</small></label>}
        </div>
        <div className="channelPreview">
          <span className={channels.email?'ok':'off'}><Mail/> E-mail</span>
          <span className={channels.whatsapp?'ok':'off'}><MessageCircle/> WhatsApp</span>
          <span className={channels.telegram?'ok':'off'}><Send/> Telegram</span>
        </div>
        {registerStatus && <div className={registerStatus.ok?'registerStatus success':'registerStatus error'}><b>{registerStatus.ok?'Solicitação enviada':'Não foi possível enviar'}</b><small>{registerStatus.text}</small></div>}
        <button type="submit" disabled={!contactEnabled || sendingRegister}><UserPlus/> {sendingRegister?'Enviando solicitação...':'Enviar para aprovação'}</button>
        <button type="button" className="textLink" onClick={()=>setMode('login')}>Voltar ao login</button>
      </form>}
      {mode==='forgot' && <form onSubmit={e=>{e.preventDefault(); action('/api/forgot-password', forms.forgot, 'Se o usuário existir, a senha temporária será enviada');}}>
        <h2>Recuperar senha</h2>
        <p>Informe seu e-mail. A senha temporária será enviada somente para o usuário.</p>
        <label>E-mail<input required type="email" placeholder="seuemail@exemplo.com" value={forms.forgot.email} onChange={e=>setForm('forgot',{email:e.target.value})}/></label>
        <button><Send/> Enviar senha temporária</button>
        <button type="button" className="textLink" onClick={()=>setMode('login')}>Voltar ao login</button>
      </form>}
    </section>
  </div>;
}


function Topbar({session,settings,data,setActive}){
  const unread = data?.notifications?.filter?.(n=>!n.read_at)?.length || 0;
  return <header className="topbar mobileAlignedTopbar">
    <div><small>{settings.CONDO_NAME || 'Condomínio Vitória Régia'}</small><h1>Olá, {roleLabel(session?.role)}! 👋</h1></div>
    <div className="topActions">
      <button className="notificationBell topBell" title="Abrir notificações" onClick={()=>setActive('comunicacao','notificacoes')}><Bell/>{unread>0 && <em>{unread}</em>}</button>
      <button className="profileBadge" onClick={()=>setActive('perfil')}><UserCheck/><span>{roleLabel(session?.role)}<small>Perfil ativo</small></span></button>
    </div>
  </header>;
}

function Dashboard({data,setActive,settings,session}){ const m=data.dashboard?.metrics || {}; const modules=[
  {key:'financeiro',sub:'movimentos',label:'Financeiro',desc:'Contas, taxas e relatórios',Icon:WalletCards},
  {key:'reservas',label:'Reservas',desc:'Áreas comuns e agendamentos',Icon:CalendarDays},
  {key:'portaria',sub:'visitantes',label:'Visitantes',desc:'Autorizações e histórico',Icon:Users},
  {key:'portaria',sub:'encomendas',label:'Encomendas',desc:'Gestão de entregas e recebimentos',Icon:Package},
  {key:'comunicacao',sub:'notificacoes',label:'Comunicados',desc:'Avisos e informativos',Icon:Bell},
  {key:'portaria',label:'Portaria',desc:'Controle de acesso e ocorrências',Icon:ShieldCheck},
  {key:'configuracoes',sub:'automacoes',label:'Automações',desc:'Regras e automatizações',Icon:Zap},
  {key:'central',sub:'manuais',label:'Ajuda',desc:'Manuais e atendimento',Icon:Info},
  {key:'configuracoes',label:'Configurações',desc:'Sistema e preferências',Icon:Settings},
  {key:'central',label:'Central Premium',desc:'Serviços exclusivos para seu condomínio',Icon:BadgeDollarSign,premium:true}
]; const metricItems=[{icon:<Users/>,label:'Moradores',value:m.residents||0,tab:'cadastros',sub:'moradores'},{icon:<Package/>,label:'Encomendas',value:m.pendingPackages||0,tab:'portaria',sub:'encomendas'},{icon:<CalendarDays/>,label:'Reservas',value:m.reservationsPending||0,tab:'reservas'},{icon:<UserCheck/>,label:'Visitantes hoje',value:m.visitorsToday||0,tab:'portaria',sub:'visitantes'},{icon:<Bell/>,label:'Mensagens',value:m.messagesNew||0,tab:'comunicacao',sub:'notificacoes'},{icon:<UserPlus/>,label:'Cadastros pendentes',value:m.pendingRegistrations||0,tab:'cadastros',sub:'solicitacoes'},{icon:<BadgeDollarSign/>,label:'Boletos',value:m.boletosPending||0,tab:'financeiro',sub:'boletos'}]; return <div className="dashboardRedesign"><section className="dashboardHero"><div><span className="eyebrow">Residencial Vitória Régia</span><h2>Bem-vindo ao Condomínio Vitória Régia</h2><p>{session?.role==='morador'?'Você visualiza as informações da sua unidade.':'Bloco único, 11 andares e 33 unidades cadastráveis de 101 a 1103.'}</p></div><div className="weather"><CloudSun/><div><b>{data.weather?.temperature ?? '--'}°C</b><small>{data.weather?.city || settings.WEATHER_CITY || 'João Pessoa'} · umidade {data.weather?.humidity ?? '--'}%</small></div></div></section>{!['morador'].includes(session?.role) && <section className="approvalStrip"><button onClick={()=>setActive('cadastros','solicitacoes')}><UserPlus/><b>{m.pendingRegistrations||0}</b><span>Cadastros aguardando aprovação</span></button><button onClick={()=>setActive('reservas')}><CalendarDays/><b>{m.reservationsPending||0}</b><span>Reservas aguardando análise</span></button></section>}<div className="moduleGrid">{modules.map(({key,sub,label,desc,Icon,premium})=><button key={label} type="button" className={premium?'moduleCard premium':'moduleCard'} onClick={()=>setActive(key,sub)}><span><Icon/></span><b>{label}</b><small>{desc}</small><ChevronRight/></button>)}</div><section className="permissionsCard"><div><h3><ShieldCheck/> Gerenciar perfis e permissões</h3><p>Controle quem acessa o sistema e o que cada um pode fazer.</p><ul><li>Síndicos podem ser moradores ou usuários terceirizados</li><li>Permissões personalizadas por função</li><li>Reatribuição de síndico de forma simples e segura</li><li>Histórico completo de alterações</li></ul></div><div className="permissionVisual"><Users/><ShieldCheck/><button onClick={()=>setActive('cadastros','usuarios')}>Gerenciar agora</button></div></section><section className="appsShowcase"><div><h3>Baixar aplicativos</h3><p>Acesse o sistema de onde estiver com nossos aplicativos oficiais.</p></div><div className="quickAppCards"><button onClick={()=>setActive('central','apps')}><Smartphone/><b>App do Morador</b><small>Tudo na palma da mão.</small></button><button onClick={()=>setActive('central','apps')}><UserCheck/><b>App do Síndico</b><small>Gestão completa.</small></button><button onClick={()=>setActive('central','apps')}><ShieldCheck/><b>App da Portaria (APK)</b><small>Controle de acesso.</small></button></div></section><div className="metricStrip aligned dashboardMetrics">{metricItems.map(item=><Metric key={item.label} {...item} onClick={()=>setActive(item.tab,item.sub)} />)}</div></div>; }
function Portaria(props){ return <Panel title="Portaria" subtitle="Encomendas, visitantes, reservas e atendimento rápido." icon={<Package/>}><SubTabs value={props.sub} setValue={props.setSub} tabs={[['encomendas','Encomendas'],['visitantes','Visitantes'],['escalas','Escalas'],['mensagens','Mensagens']]} />{props.sub==='encomendas'&&<Packages {...props}/>} {props.sub==='visitantes'&&<Visitors {...props}/>} {props.sub==='escalas'&&<Shifts {...props}/>} {props.sub==='mensagens'&&<Messages {...props}/>}</Panel>; }
function UnitLookupBox({result,onRegister}){ if(!result) return null; const arr=result.residents || []; return <div className={arr.length?'noticeBox ok':'noticeBox warn'}>{arr.length ? <><b>Morador encontrado</b><small>{arr.map(r=>`${r.name} · ${r.email || r.whatsapp_phone || r.phone || 'sem contato'}`).join(' | ')}</small></> : <><b>Nenhum morador cadastrado nesta unidade.</b><small>Recomende o cadastro antes de confirmar, principalmente para notificação automática.</small>{onRegister && <button type="button" className="buttonlike secondary" onClick={onRegister}><UserPlus/> Abrir cadastro pré-preenchido</button>}</>}</div>; }
function Packages({forms,setForm,action,openConfirm,lookup,lookupUnit,prefillResidentFromContext,readImage,reading,data,del,loadAll,session}){
  const f=forms.package;
  const isResident=session?.role==='morador';
  const summary={Código:f.tracking, Destinatário:f.recipient, Unidade:f.unit, 'Canais':Object.entries(f.notification_channels||{}).filter(([,v])=>v).map(([k])=>channelNames[k]||k).join(', ')};
  const confirmDelivery=(p,who)=>action(`/api/packages/${p.id}/${who==='resident'?'resident-confirm-delivery':'staff-confirm-delivery'}`,{}, who==='resident'?'Recebimento confirmado pelo morador':'Entrega confirmada pela portaria');
  return <div className="stack">
    <form className="formGrid" onSubmit={e=>{e.preventDefault(); openConfirm('Confirmar cadastro de encomenda', summary, ()=>action('/api/packages', f, 'Encomenda cadastrada e morador notificado'));}}>
      <label>Código/rastreio *<input required value={f.tracking} onChange={e=>setForm('package',{tracking:e.target.value})}/></label>
      <label>Unidade *<div className="inline"><input required value={f.unit} onChange={e=>setForm('package',{unit:e.target.value})} onBlur={()=>lookupUnit('package', f.unit, f.recipient)}/><button type="button" onClick={()=>lookupUnit('package', f.unit, f.recipient)}><Search/></button></div></label>
      <label>Destinatário *<input required value={f.recipient} onChange={e=>setForm('package',{recipient:e.target.value})}/></label>
      <label>Etiqueta/observação<input value={f.label} onChange={e=>setForm('package',{label:e.target.value})}/></label>
      <ChannelChooser settings={data.settings} value={f.notification_channels} onChange={v=>setForm('package',{notification_channels:v})}/>
      <label className="fileButton"><ScanLine/> {reading==='package'?'Lendo etiqueta...':'Leitura automática da etiqueta'}<input type="file" accept="image/*" capture="environment" onChange={e=>readImage(e.target.files?.[0],'package')}/></label>
      <textarea placeholder="Texto lido automaticamente / observações" value={f.extracted_text} onChange={e=>setForm('package',{extracted_text:e.target.value})}/>
      <button><Plus/> Conferir e cadastrar</button>
    </form>
    <UnitLookupBox result={lookup.package} onRegister={()=>prefillResidentFromContext('package')}/>
    <Table rows={data.packages} render={p=><>
      <td><b>{p.tracking}</b><small>{p.recipient || p.resident_name} · Unidade {p.unit}</small></td>
      <td><Code>{p.pickup_code || '-'}</Code></td>
      <td><Status ok={p.status==='entregue'}>{p.status}</Status><small>{deliveryPreferenceLabel(p.delivery_preference)}</small><small>{p.staff_delivered_at?'Portaria confirmou':'Aguardando portaria'} · {p.resident_delivered_at?'Morador confirmou':'Aguardando morador'}</small></td>
      <td className="actions packageActions">
        {isResident ? <><button onClick={()=>action(`/api/packages/${p.id}/preference`,{delivery_preference:'receber_elevador'},'Preferência enviada à portaria em serviço')}>Receber pelo elevador</button><button onClick={()=>action(`/api/packages/${p.id}/preference`,{delivery_preference:'retirar_agora'},'Preferência enviada à portaria em serviço')}>Vou retirar agora</button><button onClick={()=>action(`/api/packages/${p.id}/preference`,{delivery_preference:'retirar_mais_tarde'},'Preferência enviada à portaria em serviço')}>Retirar mais tarde</button><button className="confirmAction" onClick={()=>confirmDelivery(p,'resident')}>Confirmo recebimento</button></> : <><button className="secondaryAction" onClick={()=>action(`/api/packages/${p.id}/intercom-fallback`,{},'Telegram enviado ao morador e à portaria')}>Interfone sem contato</button><button className="confirmAction" onClick={()=>confirmDelivery(p,'staff')}>Indicar entregue</button></>}
        <button onClick={()=>openConfirm('Remover encomenda',{Código:p.tracking,Unidade:p.unit},()=>del(`/api/packages/${p.id}`).then(loadAll))}><Trash2/></button>
      </td>
    </>}/>
  </div>;
}
function Visitors({data,forms,setForm,action,fileToData,openConfirm,del,loadAll}){ const f=forms.visitor; const submit=()=>action('/api/visitors', f, 'Visitante cadastrado'); return <div className="stack"><form className="formGrid" onSubmit={e=>{e.preventDefault(); openConfirm('Confirmar visitante',{Nome:f.name,Unidade:f.unit,Documento:f.document},submit);}}><label>Nome *<input required value={f.name} onChange={e=>setForm('visitor',{name:e.target.value})}/></label><label>Unidade *<input required value={f.unit} onChange={e=>setForm('visitor',{unit:e.target.value})}/></label><label>Documento<input value={f.document} onChange={e=>setForm('visitor',{document:e.target.value})}/></label><label>Telefone<input value={f.phone} onChange={e=>setForm('visitor',{phone:e.target.value})}/></label><label>Placa<input value={f.plate} onChange={e=>setForm('visitor',{plate:e.target.value})}/></label><label className="check"><input type="checkbox" checked={f.recurring} onChange={e=>setForm('visitor',{recurring:e.target.checked})}/>Visitante recorrente</label><label className="check"><input type="checkbox" checked={f.announce_required} onChange={e=>setForm('visitor',{announce_required:e.target.checked})}/>Porteiro deve anunciar</label><label>Forma de anúncio<select value={f.announcement_channel} onChange={e=>setForm('visitor',{announcement_channel:e.target.value})}><option value="interfone">Interfone</option><option value="app">Notificação do sistema</option><option value="whatsapp">WhatsApp</option></select></label><label className="fileButton"><Camera/> Tirar foto<input type="file" accept="image/*" capture="environment" onChange={e=>fileToData(e.target.files?.[0], photo_data=>setForm('visitor',{photo_data}))}/></label><button><Plus/> Conferir e cadastrar</button></form><Table rows={data.visitors} render={v=><><td>{v.photo_data?<img src={v.photo_data} className="avatar"/>:<UserCheck/>}<b>{v.name}</b><small>Unidade {v.unit} · {v.document}</small></td><td>{v.recurring?'Recorrente':'Avulso'}<small>{v.announcement_channel}</small></td><td className="actions"><button className="secondaryAction" onClick={()=>action(`/api/visitors/${v.id}/intercom-fallback`,{},'Telegram enviado ao morador e à portaria')}>Interfone sem contato</button><button onClick={()=>openConfirm('Remover visitante',{Nome:v.name,Unidade:v.unit},()=>del(`/api/visitors/${v.id}`).then(loadAll))}><Trash2/></button></td></>}/></div>; }

function shiftPresetHours(type){ return ({manha:['07:00','12:00'], tarde:['12:00','18:00'], noite:['18:00','23:59'], dia:['00:00','23:59']}[type] || ['08:00','17:00']); }
function shiftLabel(type){ return ({manha:'Manhã',tarde:'Tarde',noite:'Noite',dia:'Dia todo',custom:'Horário específico'}[type] || type || 'Escala'); }
function googleShiftUrl(s){ const start=new Date(s.starts_at); const end=new Date(s.ends_at); const fmt=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z'); const title=encodeURIComponent(`Escala ${roleLabel(s.role) || ''} - ${s.employee_name || ''}`); const details=encodeURIComponent(`Escala Vitória Régia\nFunção: ${roleLabel(s.role) || ''}\nObservações: ${s.notes || ''}`); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${encodeURIComponent('Condomínio Vitória Régia')}`; }
function monthMatrix(baseDate){ const base=new Date((baseDate||todayISO())+'T00:00:00'); const y=base.getFullYear(), m=base.getMonth(); const first=new Date(y,m,1); const start=new Date(y,m,1-first.getDay()); const days=[]; for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); days.push(d); } return {year:y,month:m,days}; }
function sameDateISO(d){ return new Date(d).toISOString().slice(0,10); }
function ShiftCalendar({rows=[],baseDate,onOpenGoogle}){
  const {month,days}=monthMatrix(baseDate); const byDate={};
  rows.forEach(s=>{ const key=sameDateISO(s.starts_at); (byDate[key] ||= []).push(s); });
  return <div className="premiumCalendar shiftCalendarView"><div className="calendarHeader"><b>Calendário de escala</b><small>Visualização mensal com funcionário, função e turno.</small></div><div className="calendarWeekdays">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=><span key={d}>{d}</span>)}</div><div className="calendarMonthGrid">{days.map(d=>{ const iso=sameDateISO(d); const items=byDate[iso]||[]; const out=d.getMonth()!==month; return <div key={iso} className={out?'calendarDay muted':'calendarDay'}><strong>{d.getDate()}</strong>{items.slice(0,3).map(s=><button type="button" key={s.id} className="calendarEvent shiftEvent" onClick={()=>onOpenGoogle?.(s)}><span>{shiftLabel(s.shift_type)}</span><b>{s.employee_name || 'Funcionário'}</b><small>{roleLabel(s.role)}</small></button>)}{items.length>3&&<em>+{items.length-3} escalas</em>}</div>; })}</div></div>;
}
function Shifts({data,forms,setForm,action,can,session,loadAll}){
  const e=forms.employee||{}; const f=forms.shift||{}; const canManage=can('shifts.manage') || session?.role==='sindico' || session?.role==='master';
  const weekdays=[['1','Seg'],['2','Ter'],['3','Qua'],['4','Qui'],['5','Sex'],['6','Sáb'],['0','Dom']];
  const monthDays = Array.isArray(f.month_days) ? f.month_days.map(String) : String(f.month_days||'').split(',').map(x=>x.trim()).filter(Boolean);
  const selectedEmployee = data.employees.find(x=>String(x.id)===String(f.employee_id));
  const selectedHours = f.use_custom_time ? [f.start_time||'', f.end_time||''] : shiftPresetHours(f.shift_type||'manha');
  function updateShift(patch){ setForm('shift', patch); }
  function selectEmployee(id){ const emp=data.employees.find(x=>String(x.id)===String(id)); updateShift({employee_id:id, role: emp?.role || f.role || 'portaria'}); }
  function toggleWeekday(v){ const cur=Array.isArray(f.weekdays)?f.weekdays:[]; updateShift({weekdays:cur.includes(v)?cur.filter(x=>x!==v):[...cur,v]}); }
  function toggleMonthDay(v){ const cur=monthDays.map(String); updateShift({month_days:cur.includes(String(v))?cur.filter(x=>x!==String(v)):[...cur,String(v)].sort((a,b)=>Number(a)-Number(b))}); }
  function buildShiftPayload(dateValue){
    const [startH,endH]=selectedHours; const baseDate=dateValue || f.date || todayISO();
    return { ...f, starts_at:`${baseDate}T${startH || '08:00'}`, ends_at:`${baseDate}T${endH || '17:00'}`, start_time:startH, end_time:endH, shift_type:f.use_custom_time?'custom':f.shift_type, weekdays:f.weekdays||[], month_days:monthDays.join(','), substitution_reason:f.temporary_for_employee_id ? (f.substitution_reason||'dia') : '' };
  }
  function selectedDatesForSubmit(){
    const base = new Date((f.date||todayISO())+'T00:00:00');
    if((f.recurrence_type||'single')==='monthly' && monthDays.length){ const y=base.getFullYear(), m=base.getMonth(); return monthDays.map(d=>new Date(y,m,Number(d))).filter(d=>d.getMonth()===m).map(d=>d.toISOString().slice(0,10)); }
    if((f.recurrence_type||'single')==='weekly' && Array.isArray(f.weekdays) && f.weekdays.length){ const y=base.getFullYear(), m=base.getMonth(); const dates=[]; for(let d=new Date(y,m,1); d.getMonth()===m; d.setDate(d.getDate()+1)){ if(f.weekdays.includes(String(d.getDay()))) dates.push(new Date(d).toISOString().slice(0,10)); } return dates; }
    return [f.date||todayISO()];
  }
  async function submitShift(ev){ ev.preventDefault(); const dates=selectedDatesForSubmit(); if(!f.employee_id) return alert('Selecione o funcionário.'); for(const d of dates){ await post('/api/shifts', buildShiftPayload(d)); } await loadAll?.(); alert(dates.length>1 ? `${dates.length} escalas cadastradas.` : 'Escala salva.'); }
  const canEditScale = canManage || data.shifts.some(s=>String(s.employee_id)===String(session?.employee_id) && s.allow_employee_edit);
  const visibleShifts = canManage || canEditScale ? data.shifts : data.shifts.filter(s=>String(s.role||'').toLowerCase().includes('portaria') || sameDateISO(s.starts_at)===todayISO());
  return <div className="stack scaleManager premiumScale v12Scale">
    <div className="noticeBox ok scaleIntro"><b>Escalas premium de funcionários</b><small>Funcionários são cadastrados separadamente. Depois o síndico monta a escala em calendário, com turno, horário específico, substituição e exportação para Google Agenda.</small></div>
    {canManage&&<div className="shiftSectionsV12">
      <section className="subpanel employeePanel cleanEmployeePanel"><h3><Briefcase/> Cadastro de funcionário</h3><p>Cadastre a equipe uma única vez. A escala usa estes funcionários e puxa a função automaticamente.</p><form className="formGrid compactEmployeeForm" onSubmit={ev=>{ev.preventDefault(); action('/api/employees', forms.employee || {}, 'Funcionário cadastrado');}}><label>Nome *<input required value={e.name||''} onChange={ev=>setForm('employee',{...(forms.employee||{}),name:ev.target.value})}/></label><label>Função principal<select value={e.role||'portaria'} onChange={ev=>setForm('employee',{...(forms.employee||{}),role:ev.target.value})}><option value="portaria">Portaria</option><option value="zeladoria">Zeladoria</option><option value="limpeza">Limpeza</option><option value="manutencao">Manutenção</option><option value="seguranca">Segurança</option></select></label><label>Telefone / WhatsApp<input value={e.phone||''} onChange={ev=>setForm('employee',{...(forms.employee||{}),phone:ev.target.value})}/></label><label>E-mail<input value={e.email||''} onChange={ev=>setForm('employee',{...(forms.employee||{}),email:ev.target.value})}/></label><label className="full">Observações<textarea value={e.notes||''} onChange={ev=>setForm('employee',{...(forms.employee||{}),notes:ev.target.value})}/></label><button><Plus/> Salvar funcionário</button></form></section>
      <section className="subpanel shiftPanel cleanShiftPanel"><h3><CalendarClock/> Montar escala</h3><p>Selecione o funcionário, escolha a recorrência e visualize o resultado no calendário abaixo.</p><form className="formGrid shiftFormPro" onSubmit={submitShift}><label>Funcionário *<select required value={f.employee_id||''} onChange={ev=>selectEmployee(ev.target.value)}><option value="">Selecione</option>{data.employees.map(x=><option value={x.id} key={x.id}>{x.name} · {roleLabel(x.role)}</option>)}</select></label><label>Função na escala<select value={f.role||selectedEmployee?.role||'portaria'} onChange={ev=>updateShift({role:ev.target.value})}><option value="portaria">Portaria</option><option value="zeladoria">Zeladoria</option><option value="limpeza">Limpeza</option><option value="manutencao">Manutenção</option><option value="seguranca">Segurança</option></select><small>{selectedEmployee?.role ? `Função do cadastro: ${roleLabel(selectedEmployee.role)}` : 'A função é preenchida ao selecionar o funcionário.'}</small></label><label>Data base<input type="date" value={f.date||todayISO()} onChange={ev=>updateShift({date:ev.target.value})}/></label><label>Tipo de escala<select value={f.recurrence_type||'single'} onChange={ev=>updateShift({recurrence_type:ev.target.value})}><option value="single">Dia específico</option><option value="weekly">Dias da semana</option><option value="monthly">Dias no mês</option></select></label>
        <div className="weekdayBox compactChecks weekTiny"><b>Dias da semana</b><small>Ativo somente para recorrência semanal.</small><div className="miniChecks">{weekdays.map(([v,l])=><label key={v}><input type="checkbox" disabled={f.recurrence_type!=='weekly'} checked={(f.weekdays||[]).includes(v)} onChange={()=>toggleWeekday(v)}/>{l}</label>)}</div></div>
        <div className="monthCalendar monthCalendarPremium"><b>Dias do mês</b><small>Clique nos dias desejados quando escolher “Dias no mês”.</small><div>{Array.from({length:31},(_,i)=>i+1).map(d=><button type="button" disabled={f.recurrence_type!=='monthly'} className={monthDays.includes(String(d))?'active':''} onClick={()=>toggleMonthDay(d)} key={d}>{d}</button>)}</div></div>
        <label>Turno<select disabled={Boolean(f.use_custom_time)} value={f.shift_type||'manha'} onChange={ev=>updateShift({shift_type:ev.target.value, start_time:'', end_time:''})}><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option><option value="dia">Dia todo</option></select></label>
        <label className="check shiftCheck"><input type="checkbox" checked={Boolean(f.use_custom_time)} onChange={ev=>updateShift({use_custom_time:ev.target.checked, shift_type:ev.target.checked?'custom':'manha'})}/>Usar horário específico</label>
        <label>Início<input type="time" disabled={!f.use_custom_time} value={f.start_time||selectedHours[0]||''} onChange={ev=>updateShift({start_time:ev.target.value})}/></label><label>Fim<input type="time" disabled={!f.use_custom_time} value={f.end_time||selectedHours[1]||''} onChange={ev=>updateShift({end_time:ev.target.value})}/></label>
        <label>Substitui funcionário<select value={f.temporary_for_employee_id||''} onChange={ev=>updateShift({temporary_for_employee_id:ev.target.value})}><option value="">Não é substituição</option>{data.employees.filter(x=>String(x.id)!==String(f.employee_id)).map(x=><option value={x.id} key={x.id}>{x.name} · {roleLabel(x.role)}</option>)}</select><small>Permite substituir entre funções diferentes.</small></label>
        <label>Motivo da substituição<select disabled={!f.temporary_for_employee_id} value={f.substitution_reason||'dia'} onChange={ev=>updateShift({substitution_reason:ev.target.value})}><option value="dia">Substituto do dia</option><option value="ferias">Férias</option><option value="doenca">Doença / atestado</option><option value="folga">Folga</option><option value="outro">Outro motivo</option></select></label>
        <label className="check shiftCheck"><input type="checkbox" checked={Boolean(f.allow_employee_edit)} onChange={ev=>updateShift({allow_employee_edit:ev.target.checked})}/>Permitir que este funcionário edite a escala</label>
        <label className="full">Observações<textarea value={f.notes||''} onChange={ev=>updateShift({notes:ev.target.value})} placeholder="Ex.: cobrir férias, troca autorizada pelo síndico, observação do turno..."/></label><button><Plus/> Salvar escala</button></form></section>
    </div>}
    <ShiftCalendar rows={visibleShifts} baseDate={forms.shift?.date || todayISO()} onOpenGoogle={(s)=>window.open(googleShiftUrl(s),'_blank')} />
    <div className="subpanel"><h3><Clock/> Escala em lista</h3><Table rows={visibleShifts} render={s=><><td><b>{s.employee_name}</b><small>{roleLabel(s.role)} · {shiftLabel(s.shift_type)}</small></td><td>{new Date(s.starts_at).toLocaleString('pt-BR')}<small>até {new Date(s.ends_at).toLocaleString('pt-BR')}</small></td><td>{s.temporary_for_employee_name?<span>Substitui {s.temporary_for_employee_name}</span>:<span>Escala regular</span>}<small>{s.substitution_reason?`Motivo: ${s.substitution_reason} · `:''}{s.notes||''}</small></td><td><Status ok>{s.status}</Status></td><td className="actions"><button onClick={()=>window.open(googleShiftUrl(s),'_blank')}><CalendarDays/> Google Agenda</button></td></>}/></div>
  </div>;
}
function Messages({data,forms,setForm,action}){ return <div className="stack"><form className="formGrid" onSubmit={e=>{e.preventDefault(); action('/api/messages', forms.message, 'Mensagem enviada ao funcionário em serviço');}}><label>Unidade<input value={forms.message.unit} onChange={e=>setForm('message',{unit:e.target.value})}/></label><label>Assunto<input required value={forms.message.subject} onChange={e=>setForm('message',{subject:e.target.value})}/></label><textarea required placeholder="Mensagem" value={forms.message.body} onChange={e=>setForm('message',{body:e.target.value})}/><button><Send/> Enviar</button></form><Table rows={data.messages} render={m=><><td><b>{m.subject}</b><small>{m.body}</small></td><td>Unidade {m.unit}<small>{m.employee_name?'Responsável: '+m.employee_name:'Sem funcionário em serviço'}</small></td><td><Status ok={m.status==='respondida'}>{m.status}</Status></td><td className="actions"><button onClick={()=>{const response=prompt('Resposta ao morador'); if(response) action(`/api/messages/${m.id}/respond`,{response},'Resposta enviada');}}>Responder</button></td></>}/></div>; }


function Comunicacao(props){
  const {data,forms,setForm,action,settings,can,session,loadAll,setSub}=props;
  const availableTabs=[['notificacoes','Notificações'],['comunicados','Comunicados'],...(can('settings.manage')?[['testes','Testes']]:[])];
  const activeTab=availableTabs.some(([k])=>k===props.sub)?props.sub:'notificacoes';
  const changeTab=(v)=>{ setSub(v); window.history.replaceState(null, '', '#'+routeHash('comunicacao', v)); };
  const notice=forms.notice||{};
  const criteria=defaultCriteria(settings||{});
  const targetCriteria=notice.target_criteria || {};
  const notifications=data.notifications||[];
  const notices=data.notices||[];
  const canManageNotices=can('notices.manage') || ['master','admin','sindico'].includes(session?.role);
  async function removeNotification(id){ await action(`/api/notifications/${id}`, {}, 'Notificação apagada', 'DELETE'); }
  async function removeAllNotifications(){ if(!confirm('Apagar todas as notificações visíveis nesta tela?')) return; await action('/api/notifications', {}, 'Todas as notificações foram apagadas', 'DELETE'); }
  async function markRead(id){ await action(`/api/notifications/${id}/read`, {}, 'Notificação marcada como lida'); }
  function submitNotice(e){ e.preventDefault(); action('/api/notices', notice, 'Comunicado enviado'); }
  return <Panel title="Comunicação" subtitle="Comunicados, notificações e testes de envio do condomínio." icon={<Bell/>}>
    <SubTabs value={activeTab} setValue={changeTab} tabs={availableTabs}/>
    {activeTab==='notificacoes' && <div className="stack communicationPanel">
      <div className="noticeBox ok"><b>Central de notificações</b><small>Acompanhe os avisos enviados pelo sistema e remova o que já foi resolvido.</small></div>
      <div className="toolbar notificationToolbar"><button type="button" className="secondaryAction" onClick={()=>loadAll?.()}><RefreshCcw/> Atualizar</button><button type="button" className="dangerAction" onClick={removeAllNotifications}><Trash2/> Apagar todas</button></div>
      <Table rows={notifications} render={n=><>
        <td><b>{n.title || 'Notificação'}</b><small>{n.body || n.message || '-'}</small><small>{date(n.created_at)}</small></td>
        <td><Code>{channelNames[n.channel] || n.channel || 'Sistema'}</Code><small>{n.action_url || ''}</small></td>
        <td><Status ok={['lida','enviada'].includes(String(n.status||''))}>{n.status || 'nova'}</Status></td>
        <td className="actions"><button type="button" onClick={()=>markRead(n.id)}><CheckCircle2/> Lida</button><button type="button" className="dangerAction" onClick={()=>removeNotification(n.id)}><Trash2/> Apagar</button></td>
      </>}/>
    </div>}
    {activeTab==='comunicados' && <div className="stack communicationPanel">
      {canManageNotices && <form className="formGrid noticeComposer" onSubmit={submitNotice}>
        <label>Título *<input required value={notice.title||''} onChange={e=>setForm('notice',{title:e.target.value})}/></label>
        <label>Prioridade<select value={notice.priority||'normal'} onChange={e=>setForm('notice',{priority:e.target.value})}><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
        <label>Público<select value={notice.target_role||'todos'} onChange={e=>setForm('notice',{target_role:e.target.value})}><option value="todos">Todos</option><option value="morador">Moradores</option><option value="sindico">Síndico/Administração</option><option value="portaria">Portaria</option></select></label>
        <label className="full">Mensagem *<textarea required value={notice.body||''} onChange={e=>setForm('notice',{body:e.target.value})} placeholder="Digite o comunicado que será exibido no sistema e enviado aos canais configurados."/></label>
        <div className="full criteriaBox"><b>Critérios de moradores</b><small>Use somente quando quiser segmentar moradores cadastrados com essas características.</small><div className="channels">{criteria.map(c=><label key={c.key}><input type="checkbox" checked={Boolean(targetCriteria[c.key])} onChange={e=>setForm('notice',{target_criteria:{...targetCriteria,[c.key]:e.target.checked}})}/>{c.label}</label>)}</div></div>
        <button><Send/> Enviar comunicado</button>
      </form>}
      <Table rows={notices} render={n=><>
        <td><b>{n.title}</b><small>{n.body}</small></td>
        <td><Status ok={String(n.priority||'normal')==='normal'}>{n.priority || 'normal'}</Status><small>{date(n.created_at)}</small></td>
        <td><Code>{n.target_role || 'todos'}</Code></td>
      </>}/>
    </div>}
    {activeTab==='testes' && <NotifyTests forms={forms} setForm={setForm} action={action} data={data}/>} 
  </Panel>;
}

function NotifyTests({forms,setForm,action,data}){
  const f=forms.notifyTest || {};
  const cfg=data.notifyConfig || {};
  const channel=f.channel || 'email';
  const residents = Array.isArray(data.residents) ? data.residents : [];
  const users = Array.isArray(data.users) ? data.users : [];
  const settings = data.settings || {};
  const defaultTelegramChat = cfg.telegram?.chatDefaultRaw || settings.TELEGRAM_CHAT_ID || forms.settings?.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID;
  const portariaChat = settings.TELEGRAM_PORTARIA_CHAT_ID || forms.settings?.TELEGRAM_PORTARIA_CHAT_ID || defaultTelegramChat;
  const selectedResident = residents.find(r=>String(r.id)===String(f.resident_id));
  const selectedUser = users.find(u=>String(u.id)===String(f.user_id));
  const targetType = f.target_type || 'padrao';
  const telegramTarget = targetType==='portaria' ? portariaChat : targetType==='morador' ? (selectedResident?.telegram_chat_id || '') : targetType==='usuario' ? (selectedUser?.telegram_chat_id || '') : targetType==='manual' ? (f.chat_id || f.telegram_username || '') : defaultTelegramChat;
  const target = channel==='telegram' ? telegramTarget : channel==='whatsapp' ? (f.phone || f.to || '') : (f.to || '');
  const payload = { channel, to:target, chat_id:channel==='telegram' ? telegramTarget : (f.chat_id || target), phone:f.phone || target, subject:f.subject || 'Teste Vitória Régia', message:f.message || 'Mensagem de teste do Sistema Vitória Régia.', target_type:targetType };
  const telegramHelp = targetType==='manual' ? 'Informe Chat ID numérico. @usuario privado só funciona depois que o bot conhece o chat; para canais/grupos públicos, o @ pode funcionar.' : targetType==='morador' ? (selectedResident?.telegram_chat_id ? `Destino: ${selectedResident.name} (${selectedResident.telegram_username || selectedResident.telegram_chat_id})` : 'Este morador ainda não possui Chat ID Telegram salvo.') : targetType==='usuario' ? (selectedUser?.telegram_chat_id ? `Destino: ${selectedUser.name} (${selectedUser.telegram_username || selectedUser.telegram_chat_id})` : 'Este usuário ainda não possui Chat ID Telegram salvo.') : targetType==='portaria' ? `Destino: Telegram da portaria (${portariaChat || 'não configurado'})` : `Destino: Telegram padrão do condomínio (${defaultTelegramChat || DEFAULT_TELEGRAM_CHAT_ID})`;
  return <SettingCard title="Teste de notificações" icon={<Send/>}>
    <div className="noticeBox ok"><b>Status dos canais</b><small>E-mail: {cfg.email?.enabled?'ativo':'verificar'} · Telegram: {cfg.telegram?.enabled?'ativo':'verificar'} · WhatsApp: {cfg.whatsapp?.enabled?'ativo':'verificar'} · Navegador: {cfg.browser?.enabled?'ativo':'verificar'}</small></div>
    {channel==='telegram' && <div className="noticeBox ok"><b>Destino Telegram</b><small>{telegramHelp}</small></div>}
    <form className="formGrid notifyTestForm" onSubmit={e=>{e.preventDefault(); action('/api/notify/test', payload, 'Teste enviado/processado');}}>
      <label>Canal<select value={channel} onChange={e=>setForm('notifyTest',{channel:e.target.value})}><option value="email">E-mail</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="browser">Navegador/Sistema</option></select></label>
      {channel==='email' && <label>Destino<input type="email" value={f.to||''} onChange={e=>setForm('notifyTest',{to:e.target.value})} placeholder="email@dominio.com"/></label>}
      {channel==='whatsapp' && <label>WhatsApp<input value={f.phone||f.to||''} onChange={e=>setForm('notifyTest',{phone:e.target.value,to:e.target.value})} placeholder="5583999999999"/></label>}
      {channel==='telegram' && <label>Destino Telegram<select value={targetType} onChange={e=>setForm('notifyTest',{target_type:e.target.value})}><option value="padrao">Chat padrão do condomínio</option><option value="portaria">Telegram da portaria</option><option value="morador">Morador cadastrado</option><option value="usuario">Usuário cadastrado</option><option value="manual">Informar manualmente</option></select></label>}
      {channel==='telegram' && targetType==='morador' && <label>Morador<select value={f.resident_id||''} onChange={e=>setForm('notifyTest',{resident_id:e.target.value})}><option value="">Selecione</option>{residents.map(r=><option key={r.id} value={r.id}>{r.name} · Unidade {r.unit} · {r.telegram_username || r.telegram_chat_id || 'sem Telegram'}</option>)}</select></label>}
      {channel==='telegram' && targetType==='usuario' && <label>Usuário<select value={f.user_id||''} onChange={e=>setForm('notifyTest',{user_id:e.target.value})}><option value="">Selecione</option>{users.map(u=><option key={u.id} value={u.id}>{u.name} · {roleLabel(u.role)} · {u.telegram_username || u.telegram_chat_id || 'sem Telegram'}</option>)}</select></label>}
      {channel==='telegram' && targetType==='manual' && <><label>Usuário Telegram<input value={f.telegram_username||''} onChange={e=>setForm('notifyTest',{telegram_username:e.target.value})} placeholder="@usuario ou @grupo"/></label><label>Chat ID Telegram<input value={f.chat_id||''} onChange={e=>setForm('notifyTest',{chat_id:e.target.value})} placeholder="ID numérico recomendado"/></label></>}
      <label>Assunto<input value={f.subject||''} onChange={e=>setForm('notifyTest',{subject:e.target.value})}/></label>
      <label className="full">Mensagem<textarea required value={f.message||''} onChange={e=>setForm('notifyTest',{message:e.target.value})}/></label>
      <button><Send/> Enviar teste</button>
    </form>
  </SettingCard>;
}

function Financeiro(props){
  const current = props.sub || 'movimentos';
  const setFinanceSub = (value) => typeof props.setSub === 'function' ? props.setSub(value) : null;
  return <Panel title="Financeiro" subtitle="Boletos, cobranças, notas e acompanhamento por unidade." icon={<WalletCards/>}>
    <SubTabs value={current} setValue={setFinanceSub} tabs={[["movimentos","Movimentos"],["boletos","Boletos"],["notas","Notas fiscais"],["importar","Importar documento"]]} />
    {current==='boletos'?<Boletos {...props}/>:current==='notas'?<Invoices {...props}/>:current==='importar'?<FinanceImport {...props}/>:<Finance {...props}/>} 
  </Panel>;
}
function Finance({data,forms,setForm,action,openConfirm}){
  const f=forms.finance || {};
  const rows=Array.isArray(data.finance)?data.finance:[];
  return <div className="stack financePage"><form className="formGrid premiumForm" onSubmit={e=>{e.preventDefault(); openConfirm('Confirmar lançamento financeiro',{Título:f.title,Unidade:f.unit||'-',Valor:money(f.amount),Vencimento:f.due_date||'-'},()=>action('/api/finance',f,'Lançamento financeiro salvo'));}}>
    <label>Título *<input required value={f.title||''} onChange={e=>setForm('finance',{title:e.target.value})}/></label>
    <label>Valor *<input required type="number" step="0.01" value={f.amount||''} onChange={e=>setForm('finance',{amount:e.target.value})}/></label>
    <label>Tipo<select value={f.type||'receita'} onChange={e=>setForm('finance',{type:e.target.value})}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label>
    <label>Categoria<input value={f.category||'geral'} onChange={e=>setForm('finance',{category:e.target.value})}/></label>
    <label>Unidade<input value={f.unit||''} onChange={e=>setForm('finance',{unit:e.target.value})}/></label>
    <label>Vencimento<input type="date" value={f.due_date||''} onChange={e=>setForm('finance',{due_date:e.target.value})}/></label>
    <label className="check"><input type="checkbox" checked={f.generate_boleto===true} onChange={e=>setForm('finance',{generate_boleto:e.target.checked})}/>Gerar boleto vinculado</label>
    <button><Plus/> Conferir e lançar</button>
  </form><Table rows={rows} render={item=><><td><b>{item.title||'Lançamento'}</b><small>{item.category||'geral'} · Unidade {item.unit || '-'}</small></td><td>{money(item.amount)}<small>{date(item.due_date)}</small></td><td><Status ok={item.status==='pago'}>{item.status||'pendente'}</Status><small>{item.type||''}</small></td></>}/></div>;
}
function Boletos({data,forms,setForm,action,settings,openConfirm}){
  const f=forms.boleto || {};
  const provider=settings.BANK_PROVIDER||'manual';
  return <div className="stack boletosPage"><div className="noticeBox"><b>Banco configurado: {provider==='manual'?'manual / qualquer banco':provider}</b><small>Para emissão bancária automática, configure a API em Configurações → Banco.</small></div><form className="formGrid premiumForm" onSubmit={e=>{e.preventDefault(); openConfirm('Confirmar boleto',{Título:f.title,Unidade:f.unit||'-',Valor:money(f.amount),Banco:f.bank_name||provider},()=>action('/api/boletos',{...f,provider},'Boleto salvo'));}}>
    <label>Título *<input required value={f.title||''} onChange={e=>setForm('boleto',{title:e.target.value})}/></label>
    <label>Valor *<input required type="number" step="0.01" value={f.amount||''} onChange={e=>setForm('boleto',{amount:e.target.value})}/></label>
    <label>Unidade<input value={f.unit||''} onChange={e=>setForm('boleto',{unit:e.target.value})}/></label>
    <label>Vencimento<input type="date" value={f.due_date||''} onChange={e=>setForm('boleto',{due_date:e.target.value})}/></label>
    <label>Banco<input value={f.bank_name||''} onChange={e=>setForm('boleto',{bank_name:e.target.value})}/></label>
    <label>Linha digitável<input value={f.digitable_line||''} onChange={e=>setForm('boleto',{digitable_line:e.target.value})}/></label>
    <label>Link/PDF<input value={f.payment_link||''} onChange={e=>setForm('boleto',{payment_link:e.target.value})}/></label>
    <button><Banknote/> Conferir e salvar boleto</button>
  </form><Table rows={data.boletos||[]} render={b=><><td><b>{b.title||'Boleto'}</b><small>Unidade {b.unit||'-'} · {b.bank_name || b.provider || 'manual'}</small></td><td>{money(b.amount)}<small>{date(b.due_date)}</small></td><td><Status ok={b.status==='pago'}>{b.status||'pendente'}</Status></td><td><Code>{b.digitable_line || b.payment_link || '-'}</Code></td></>}/></div>;
}
function Invoices({data,forms,setForm,action,openConfirm,readImage,reading}){
  const f=forms.invoice||{};
  const submit=()=>action('/api/invoices', f, 'Nota fiscal cadastrada');
  return <div className="stack invoicesPage"><div className="noticeBox ok"><b>Leitura automática de nota fiscal</b><small>Envie uma foto legível da nota. O sistema preencherá somente os campos detectados; confira antes de salvar.</small></div><form className="formGrid premiumForm" onSubmit={e=>{e.preventDefault(); openConfirm('Confirmar nota fiscal',{Fornecedor:f.supplier,Número:f.document_number,Valor:money(f.amount),Unidade:f.unit},submit);}}>
    <label>Fornecedor *<input required value={f.supplier||''} onChange={e=>setForm('invoice',{supplier:e.target.value})}/></label>
    <label>Número da nota<input value={f.document_number||''} onChange={e=>setForm('invoice',{document_number:e.target.value})}/></label>
    <label>Chave de acesso<input value={f.access_key||''} onChange={e=>setForm('invoice',{access_key:e.target.value})}/></label>
    <label>Valor<input type="number" step="0.01" value={f.amount||''} onChange={e=>setForm('invoice',{amount:e.target.value})}/></label>
    <label>Emissão<input type="date" value={f.issue_date||''} onChange={e=>setForm('invoice',{issue_date:e.target.value})}/></label>
    <label>Vencimento<input type="date" value={f.due_date||''} onChange={e=>setForm('invoice',{due_date:e.target.value})}/></label>
    <label>Unidade<input value={f.unit||''} onChange={e=>setForm('invoice',{unit:e.target.value})}/></label>
    <label className="fileButton"><ScanLine/> {reading==='invoice'?'Lendo nota...':'Leitura automática da nota fiscal'}<input type="file" accept="image/*" capture="environment" onChange={e=>readImage(e.target.files?.[0],'invoice')}/></label>
    <label className="full">Texto lido automaticamente / observações<textarea value={f.extracted_text||''} onChange={e=>setForm('invoice',{extracted_text:e.target.value})}/></label>
    <button><Save/> Conferir e salvar nota</button>
  </form><Table rows={data.invoices||[]} render={n=><><td><b>{n.supplier||'Fornecedor'}</b><small>Nota {n.document_number||'-'} · Unidade {n.unit||'-'}</small></td><td>{money(n.amount)}<small>Emissão {date(n.issue_date)}</small></td><td><Status ok={n.status==='registrada'}>{n.status||'registrada'}</Status></td></>}/></div>;
}
function Cadastros(props){ return <Panel title="Cadastros" subtitle="Moradores, usuários e aprovações separados para evitar confusão." icon={<Users/>}><SubTabs value={props.sub} setValue={props.setSub} tabs={[["moradores","Moradores"],["usuarios","Usuários"],["solicitacoes","Aprovações"]]} />{props.sub==='usuarios'?<Usuarios {...props}/>:props.sub==='solicitacoes'?<Solicitacoes {...props}/>:<Moradores {...props}/>}</Panel>; }
function Moradores({data,forms,setForm,action,openConfirm,settings,del,loadAll}){
  const f=forms.resident || {};
  const criteria=defaultCriteria(settings);
  const summary={Nome:f.name,Unidade:f.unit,'E-mail':f.email,WhatsApp:f.whatsapp_phone};
  return <div className="stack residentsPage"><form className="formGrid premiumForm" onSubmit={e=>{e.preventDefault(); openConfirm(f.id?'Confirmar alteração de morador':'Confirmar cadastro de morador', summary, ()=>action(f.id?`/api/residents/${f.id}`:'/api/residents', f, f.id?'Morador atualizado':'Morador cadastrado', f.id?'PUT':'POST'));}}>
    <label>Nome *<input required value={f.name||''} onChange={e=>setForm('resident',{name:e.target.value})}/></label>
    <label>Unidade *<input required value={f.unit||''} onChange={e=>setForm('resident',{unit:e.target.value})}/></label>
    <label>E-mail<input value={f.email||''} onChange={e=>setForm('resident',{email:e.target.value})}/></label>
    <label>WhatsApp<input value={f.whatsapp_phone||''} onChange={e=>setForm('resident',{whatsapp_phone:e.target.value})}/></label>
    <label>Usuário Telegram<input value={f.telegram_username||''} onChange={e=>setForm('resident',{telegram_username:e.target.value})} placeholder="@usuario"/><small>Identificação do Telegram do morador.</small></label>
    <label>Chat ID Telegram<input value={f.telegram_chat_id||''} onChange={e=>setForm('resident',{telegram_chat_id:e.target.value})} placeholder="ID numérico após /start no bot"/><small>Usado para receber mensagens do sistema.</small></label>
    <label>Documento<input value={f.document||''} onChange={e=>setForm('resident',{document:e.target.value})}/></label>
    <label className="check"><input type="checkbox" checked={Boolean(f.resident_tags?.possui_pet)} onChange={e=>setForm('resident',{resident_tags:{...(f.resident_tags||{}),possui_pet:e.target.checked}, pet_name:e.target.checked?f.pet_name:''})}/>Possui pet</label>
    {f.resident_tags?.possui_pet && <label>Nome do pet<input value={f.pet_name||''} onChange={e=>setForm('resident',{pet_name:e.target.value})}/></label>}
    <label className="check"><input type="checkbox" checked={Boolean(f.resident_tags?.possui_carro)} onChange={e=>setForm('resident',{resident_tags:{...(f.resident_tags||{}),possui_carro:e.target.checked}, vehicle_model:e.target.checked?f.vehicle_model:'', vehicle_plate:e.target.checked?f.vehicle_plate:''})}/>Possui carro</label>
    {f.resident_tags?.possui_carro && <><label>Modelo do carro<input value={f.vehicle_model||''} onChange={e=>setForm('resident',{vehicle_model:e.target.value, vehicle:e.target.value})}/></label><label>Placa<input value={f.vehicle_plate||''} onChange={e=>setForm('resident',{vehicle_plate:e.target.value})}/></label></>}
    <div className="channels criteriaBox"><b>Características para filtros</b>{criteria.filter(c=>!['possui_pet','possui_carro'].includes(c.key)).map(c=><label key={c.key}><input type="checkbox" checked={Boolean(f.resident_tags?.[c.key])} onChange={e=>setForm('resident',{resident_tags:{...(f.resident_tags||{}),[c.key]:e.target.checked}})}/>{c.label}</label>)}</div>
    <ChannelChooser settings={settings} value={f.notification_preferences} onChange={v=>setForm('resident',{notification_preferences:v})}/>
    <button><Save/> Conferir e salvar morador</button>
  </form><Table rows={data.residents||[]} render={r=><><td><b>{r.name}</b><small>Unidade {r.unit} · {r.email || r.whatsapp_phone || r.phone || r.telegram_username || r.telegram_chat_id || 'sem contato'}</small></td><td>{[...criteria.filter(c=>parseJson(r.resident_tags,{})[c.key]).filter(c=>!['possui_pet','possui_carro'].includes(c.key)).map(c=>c.label), r.pet_name?'Pet: '+r.pet_name:null, r.vehicle_model?'Carro: '+r.vehicle_model:null, r.vehicle_plate?'Placa: '+r.vehicle_plate:null].filter(Boolean).join(', ')}</td><td className="actions"><button onClick={()=>setForm('resident',{...r,resident_tags:parseJson(r.resident_tags,{}),notification_preferences:parseJson(r.notification_preferences,{})})}><Edit3/> Editar</button><button onClick={()=>openConfirm('Remover morador',{Nome:r.name,Unidade:r.unit},()=>del(`/api/residents/${r.id}`).then(loadAll))}><Trash2/> Remover</button></td></>}/></div>;
}
function Usuarios({data,forms,setForm,action,openConfirm,del,loadAll,session}){
  const f=forms.user || {};
  return <div className="stack usersPage"><form className="formGrid premiumForm" onSubmit={e=>{e.preventDefault(); openConfirm(f.id?'Confirmar alteração de usuário':'Confirmar cadastro de usuário',{Nome:f.name,'E-mail':f.email,Perfil:roleLabel(f.role),Unidade:f.unit},()=>action(f.id?`/api/users/${f.id}`:'/api/users', f, f.id?'Usuário atualizado':'Usuário cadastrado', f.id?'PUT':'POST'));}}>
    <label>Nome *<input required value={f.name||''} onChange={e=>setForm('user',{name:e.target.value})}/></label>
    <label>E-mail/usuário<input value={f.email||''} onChange={e=>setForm('user',{email:e.target.value})}/></label>
    <label>Perfil<select value={f.role||'morador'} onChange={e=>setForm('user',{role:e.target.value,user_type:e.target.value})}><option value="morador">Morador</option><option value="portaria">Portaria</option><option value="funcionario">Funcionário</option><option value="financeiro">Financeiro</option><option value="sindico">Síndico</option></select></label>
    {!['portaria','funcionario','financeiro'].includes(f.role) && <label>Unidade<input value={f.unit||''} onChange={e=>setForm('user',{unit:e.target.value})}/></label>}
    <label>Senha temporária<input type="password" value={f.password||''} onChange={e=>setForm('user',{password:e.target.value})}/></label>
    <label>WhatsApp<input value={f.whatsapp_phone||''} onChange={e=>setForm('user',{whatsapp_phone:e.target.value})}/></label>
    <label>Usuário Telegram<input value={f.telegram_username||''} onChange={e=>setForm('user',{telegram_username:e.target.value})} placeholder="@usuario"/><small>Ex.: @portariavr1 para conta operacional da portaria.</small></label>
    <label>Chat ID Telegram<input value={f.telegram_chat_id||''} onChange={e=>setForm('user',{telegram_chat_id:e.target.value})} placeholder="ID numérico após /start no bot"/><small>Usado para receber mensagens do sistema.</small></label>
    <label className="check"><input type="checkbox" checked={f.active!==false} onChange={e=>setForm('user',{active:e.target.checked})}/>Usuário ativo</label>
    <ChannelChooser settings={data.settings||{}} value={f.notification_preferences} onChange={v=>setForm('user',{notification_preferences:v})}/>
    <button><Save/> Conferir e salvar usuário</button>
  </form><Table rows={(data.users||[]).filter(u=>!['master','admin'].includes(u.role))} render={u=><><td><b>{u.name}</b><small>{u.email || u.telegram_username || u.telegram_chat_id || 'sem login'} · {roleLabel(u.role)}</small></td><td>{u.unit || '-'}</td><td><Status ok={u.active}>{u.active?'ativo':'inativo'}</Status></td><td className="actions"><button onClick={()=>setForm('user',{...u,notification_preferences:parseJson(u.notification_preferences,{})})}><Edit3/> Editar</button><button onClick={()=>action(`/api/users/${u.id}/reset-password`,{},'Senha temporária enviada somente ao usuário')}>Reset senha</button><button onClick={()=>openConfirm('Remover usuário',{Nome:u.name,'E-mail':u.email},()=>del(`/api/users/${u.id}`).then(loadAll))}><Trash2/> Remover</button></td></>}/></div>;
}
function Solicitacoes({data,action}){
  return <div className="stack approvalsPage"><div className="approvalHero"><UserPlus/><div><h3>Solicitações de cadastro</h3><small>Aprove moradores e funcionários com segurança. As senhas temporárias são enviadas somente ao usuário aprovado.</small></div></div><Table rows={data.registrationRequests||[]} render={r=><><td><b>{r.name}</b><small>{r.email || r.whatsapp_phone || r.phone || r.telegram_chat_id} · unidade/setor {r.unit || '-'} · {roleLabel(r.role)}</small></td><td><Status ok={r.status==='aprovada'}>{r.status}</Status></td><td className="actions"><button className="confirmAction" onClick={()=>action(`/api/registration-requests/${r.id}/approve`,{},'Cadastro aprovado e senha temporária enviada')}>Aprovar</button><button className="secondary" onClick={()=>action(`/api/registration-requests/${r.id}/reject`,{note:'Dados não conferem'},'Cadastro rejeitado')}>Rejeitar</button></td></>}/></div>;
}

function reservationPeriodsForArea(area){
  const raw = area?.reservation_periods || area?.periods || '';
  const list = Array.isArray(raw) ? raw : String(raw||'dia_todo,manha,tarde,noite,horario').split(/[;,\n]/).map(x=>x.trim()).filter(Boolean);
  return list.length ? list : ['dia_todo','manha','tarde','noite','horario'];
}
function reservationPeriodLabel(p){ return ({dia_todo:'Dia todo', manha:'Manhã', tarde:'Tarde', noite:'Noite', horario:'Horário específico'}[p] || p); }
function reservationPeriodHours(p){ return ({dia_todo:['00:00','23:59'], manha:['08:00','12:00'], tarde:['13:00','18:00'], noite:['19:00','23:00']}[p] || ['','']); }
function reservationGoogleUrlLocal(r){
  const safeDate = r.reserved_for || todayISO();
  const fmt=(d,t)=>new Date(`${d}T${t||'00:00'}`).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  const title=encodeURIComponent(`Reserva - ${r.area || 'Espaço comum'}`);
  const details=encodeURIComponent(`Reserva Vitória Régia\nEspaço: ${r.area || ''}\nStatus: ${r.status||''}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(safeDate,r.start_time)}/${fmt(safeDate,r.end_time||'23:59')}&details=${details}&location=${encodeURIComponent('Condomínio Vitória Régia')}`;
}
function reservationStatusKey(s=''){
  return String(s || 'pre_agendada').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s-]+/g,'_');
}
function reservationStatusLabel(s){
  const key = reservationStatusKey(s);
  return ({pre_agendada:'Pré-agendada',pre_confirmada:'Pré-confirmada',pre_confirmado:'Pré-confirmada',pre_aprovada:'Pré-confirmada',pendente:'Pendente',pendente_pagamento:'Pendente pagamento',pendente_aceite_regras:'Pendente aceite',confirmada:'Confirmada',confirmado:'Confirmada',aprovada:'Confirmada',aprovado:'Confirmada',cancelada:'Cancelada',cancelado:'Cancelada'}[key] || s || 'Pré-agendada');
}
function reservationStatusClass(s){
  const key = reservationStatusKey(s);
  if(['confirmada','confirmado','aprovada','aprovado'].includes(key)) return 'confirmada';
  if(['pre_agendada','pre_confirmada','pre_confirmado','pre_aprovada','pendente'].includes(key)) return 'preconfirmada';
  if(['pendente_pagamento','pendente_aceite_regras'].includes(key)) return 'pendente';
  if(['cancelada','cancelado'].includes(key)) return 'cancelada';
  return 'preconfirmada';
}
function reservationAreaName(r={}){ return r.area || r.common_area || r.common_area_name || r.area_name || r.space || 'Espaço comum'; }
function reservationDateISO(r={}){ return String(r.reserved_for || r.reservation_date || r.date || r.start_date || r.starts_at || '').slice(0,10); }
function reservationStartTime(r={}){ const raw = r.start_time || (String(r.starts_at || '').match(/T(\d{2}:\d{2})/)?.[1]) || ''; return raw || (r.all_day ? '00:00' : '--'); }
function reservationEndTime(r={}){ const raw = r.end_time || (String(r.ends_at || '').match(/T(\d{2}:\d{2})/)?.[1]) || ''; return raw || (r.all_day ? '23:59' : '--'); }
function reservationTimeText(r={}){ return r.all_day ? 'Dia todo' : `${reservationStartTime(r)} às ${reservationEndTime(r)}`; }
function reservationVisibleOnCalendar(r={}){ return !r.deleted_at && reservationStatusClass(r.status) !== 'cancelada'; }
function reservationCalendarDays(anchorISO){
  const anchor = new Date(`${anchorISO || todayISO()}T12:00:00`);
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1, 12);
  const start = new Date(y, m, 1 - first.getDay(), 12);
  return Array.from({ length:42 }, (_,i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
function reservationISO(d){
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  return local.toISOString().slice(0,10);
}
function reservationMonthTitle(anchorISO){
  return new Date(`${anchorISO || todayISO()}T12:00:00`).toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
}
function reservationMoveMonth(anchorISO, delta){
  const d = new Date(`${anchorISO || todayISO()}T12:00:00`);
  d.setMonth(d.getMonth() + delta, 1);
  return reservationISO(d);
}
function ReservasCalendarioNovo({rows=[], selectedArea='', selectedDate='', setSelectedDate, setView, session}){
  const [monthISO,setMonthISO] = useState(() => (selectedDate || todayISO()).slice(0,7) + '-01');
  useEffect(() => {
    if(selectedDate) setMonthISO(String(selectedDate).slice(0,7) + '-01');
  }, [selectedDate]);
  const monthDate = new Date(`${monthISO}T12:00:00`);
  const days = reservationCalendarDays(monthISO);
  const isResident = session?.role === 'morador';
  const byDate = rows.filter(reservationVisibleOnCalendar).reduce((acc,r) => {
    if(selectedArea && String(reservationAreaName(r)) !== String(selectedArea)) return acc;
    const key = reservationDateISO(r);
    if(key) (acc[key] ||= []).push(r);
    return acc;
  }, {});
  return <section className="vrReservaCalendarCard vrReservaCalendarFresh">
    <div className="vrReservaCalendarTop">
      <div><b>Calendário de reservas</b><small>Visual mensal redesenhado do zero, sem dependência do roteador antigo.</small></div>
      <div className="vrReservaMonthNav"><button type="button" onClick={()=>setMonthISO(reservationMoveMonth(monthISO,-1))}>‹</button><strong>{reservationMonthTitle(monthISO)}</strong><button type="button" onClick={()=>setMonthISO(reservationMoveMonth(monthISO,1))}>›</button></div>
    </div>
    <div className="vrReservaWeekdays">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=><span key={d}>{d}</span>)}</div>
    <div className="vrReservaMonthGrid">{days.map(day => {
      const iso = reservationISO(day);
      const items = byDate[iso] || [];
      const outside = day.getMonth() !== monthDate.getMonth();
      const selected = iso === selectedDate;
      return <button type="button" key={iso} className={[outside?'muted':'', selected?'selected':'', items.length?'busy':'free'].join(' ')} onClick={()=>setSelectedDate(iso)}>
        <strong>{day.getDate()}</strong>
        {items.length ? items.slice(0,4).map(r => <span className={`vrReservaEvent ${reservationStatusClass(r.status)}`} key={r.id || `${iso}-${reservationAreaName(r)}-${r.unit}-${reservationStartTime(r)}`}><b>{reservationTimeText(r)}</b><small>{isResident ? reservationStatusLabel(r.status) : `Unidade ${r.unit || '-'} · ${reservationStatusLabel(r.status)}`}</small></span>) : <em>Livre</em>}
        {items.length > 4 && <small>+{items.length - 4} reservas</small>}
      </button>;
    })}</div>
  </section>;
}
function Reservations(props){
  const {data, forms, setForm, action, openConfirm, session, sub, setSub}=props;
  const areas = Array.isArray(data.commonAreas) ? data.commonAreas.filter(a => a?.active !== false) : [];
  const rows = Array.isArray(data.reservations) ? data.reservations : [];
  const f = forms.reservation || {};
  const firstAreaName = areas[0]?.name || 'Salão de festas';
  const [view,setView] = useState('calendario');
  const [selectedArea,setSelectedArea] = useState(f.area || firstAreaName);
  const [selectedDate,setSelectedDate] = useState(String(f.reserved_for || todayISO()).slice(0,10));
  const goReservationView = (nextView) => {
    setView(nextView);
    if(typeof setSub === 'function') setSub(nextView);
  };

  useEffect(() => {
    const allowedViews = ['calendario','lista','nova'];
    if(sub && allowedViews.includes(sub) && sub !== view) setView(sub);
  }, [sub]);

  useEffect(() => {
    if(window.location.hash !== '#/reservas/calendario') window.history.replaceState(null, '', '#/reservas/calendario');
  }, []);
  useEffect(() => {
    if(!selectedArea && firstAreaName) setSelectedArea(firstAreaName);
  }, [firstAreaName, selectedArea]);
  useEffect(() => {
    setForm('reservation', {
      area:selectedArea || firstAreaName,
      reserved_for:selectedDate || todayISO(),
      reservation_mode:f.reservation_mode || 'noite'
    });
  }, [selectedArea, selectedDate]);

  const selectedAreaObj = areas.find(a => String(a.name || '') === String(selectedArea || firstAreaName)) || { name:selectedArea || firstAreaName, fee_amount:0, reservation_periods:'dia_todo,manha,tarde,noite,horario' };
  const periods = reservationPeriodsForArea(selectedAreaObj);
  const period = f.reservation_mode || 'noite';
  const hours = reservationPeriodHours(period);
  const unitDefault = f.unit || session?.unit || '';
  const residentDefault = f.resident || session?.name || '';
  const visibleReservationRows = rows.filter(reservationVisibleOnCalendar);
  const selectedDayReservations = visibleReservationRows.filter(r => reservationDateISO(r) === selectedDate && (!selectedArea || String(reservationAreaName(r)) === String(selectedArea)));

  function updateReservation(patch){ setForm('reservation', patch); }
  function choosePeriod(p){ const h=reservationPeriodHours(p); updateReservation({ reservation_mode:p, shift:p, period_label:reservationPeriodLabel(p), all_day:p==='dia_todo', start_time:h[0], end_time:h[1] }); }
  async function submitReservation(e){
    e.preventDefault();
    const body = {
      ...f,
      area:selectedArea || firstAreaName,
      reserved_for:selectedDate || todayISO(),
      unit:unitDefault,
      resident:residentDefault,
      reservation_mode:period,
      shift:period,
      period_label:reservationPeriodLabel(period),
      all_day:period === 'dia_todo',
      start_time:period === 'horario' ? (f.start_time || '19:00') : hours[0],
      end_time:period === 'horario' ? (f.end_time || '23:00') : hours[1],
      fee_amount:f.fee_amount ?? selectedAreaObj.fee_amount ?? 0
    };
    const ok = await action('/api/reservations', body, 'Reserva enviada para análise');
    if(ok) goReservationView('lista');
  }
  function statusAction(r,status){
    const label=reservationStatusLabel(status);
    openConfirm(`Alterar reserva para ${label}`, {Espaço:r.area, Unidade:r.unit, Data:String(r.reserved_for||'').slice(0,10)}, () => action(`/api/reservations/${r.id}/status`, {status}, `Reserva ${label.toLowerCase()}`));
  }
  function cancelReservation(r){ const reason=prompt('Motivo do cancelamento') || 'Cancelada pelo sistema'; action(`/api/reservations/${r.id}/cancel`, {reason}, 'Reserva cancelada'); }
  return <Panel title="Reservas" subtitle="Tela redesenhada do zero: calendário mensal, lista e nova reserva em rota fixa." icon={<CalendarDays/>}>
    <div className="vrReservaShell vrReservaFreshShell">
      <div className="vrReservaToolbar">
        <div><b>Área comum</b><select value={selectedArea || firstAreaName} onChange={e=>setSelectedArea(e.target.value)}>{areas.map(a=><option value={a.name} key={a.id || a.name}>{a.name}</option>)}{!areas.length && <option value="Salão de festas">Salão de festas</option>}</select></div>
        <div><b>Data selecionada</b><input type="date" value={selectedDate || todayISO()} onChange={e=>setSelectedDate(e.target.value)}/></div>
        <div className="vrReservaViewBtns"><button type="button" className={view==='calendario'?'active':''} onClick={()=>goReservationView('calendario')}>Calendário</button><button type="button" className={view==='lista'?'active':''} onClick={()=>goReservationView('lista')}>Lista</button><button type="button" className={view==='nova'?'active':''} onClick={()=>goReservationView('nova')}>Nova reserva</button></div>
      </div>
      {view === 'calendario' && <div className="vrReservaMainGrid"><ReservasCalendarioNovo rows={rows} selectedArea={selectedArea} selectedDate={selectedDate} setSelectedDate={setSelectedDate} setView={goReservationView} session={session}/><div className="vrReservaDayPanel" role="complementary"><h3>{new Date(`${selectedDate || todayISO()}T12:00:00`).toLocaleDateString('pt-BR')}</h3><p>{selectedDayReservations.length ? 'Reservas neste dia:' : 'Nenhuma reserva neste dia.'}</p>{selectedDayReservations.map(r => <article className="vrReservaMiniCard" key={r.id}><b>{reservationAreaName(r)}</b><small>Unidade {r.unit || '-'} · {reservationTimeText(r)}</small><Status ok={reservationStatusClass(r.status) === 'confirmada'}>{reservationStatusLabel(r.status)}</Status></article>)}<button type="button" onClick={()=>goReservationView('nova')}><Plus/> Solicitar reserva</button></div></div>}
      {view === 'nova' && <form className="formGrid vrReservaForm" onSubmit={submitReservation}><label>Espaço<select value={selectedArea || firstAreaName} onChange={e=>setSelectedArea(e.target.value)}>{areas.map(a=><option value={a.name} key={a.id || a.name}>{a.name}</option>)}{!areas.length && <option value="Salão de festas">Salão de festas</option>}</select></label><label>Data<input type="date" required value={selectedDate || todayISO()} onChange={e=>setSelectedDate(e.target.value)}/></label><label>Período<select value={period} onChange={e=>choosePeriod(e.target.value)}>{periods.map(p=><option value={p} key={p}>{reservationPeriodLabel(p)}</option>)}</select></label><label>Início<input type="time" disabled={period!=='horario'} value={period==='horario'?(f.start_time||'19:00'):hours[0]} onChange={e=>updateReservation({start_time:e.target.value})}/></label><label>Fim<input type="time" disabled={period!=='horario'} value={period==='horario'?(f.end_time||'23:00'):hours[1]} onChange={e=>updateReservation({end_time:e.target.value})}/></label><label>Unidade<input value={unitDefault} onChange={e=>updateReservation({unit:e.target.value})}/></label><label>Morador<input value={residentDefault} onChange={e=>updateReservation({resident:e.target.value})}/></label><label>Taxa<input type="number" step="0.01" value={f.fee_amount ?? selectedAreaObj.fee_amount ?? 0} onChange={e=>updateReservation({fee_amount:e.target.value})}/></label><label className="check"><input type="checkbox" checked={f.terms_accepted===true} onChange={e=>updateReservation({terms_accepted:e.target.checked})}/>Li e aceito as regras de utilização do espaço</label><label className="full">Observações<textarea value={f.notes||''} onChange={e=>updateReservation({notes:e.target.value})} placeholder="Observações da reserva, convidados ou necessidades especiais"/></label><button><CalendarDays/> Enviar reserva</button></form>}
      {view === 'lista' && <Table rows={rows} render={r=><><td><b>{reservationAreaName(r)}</b><small>{reservationDateISO(r)} · {reservationTimeText(r)}</small></td><td>Unidade {r.unit || '-'}<small>{r.resident || ''}</small></td><td><Status ok={reservationStatusClass(r.status)==='confirmada'}>{reservationStatusLabel(r.status)}</Status></td><td className="actions"><button onClick={()=>window.open(reservationGoogleUrlLocal(r),'_blank')}><CalendarDays/> Agenda</button>{session?.role !== 'morador' && <><button onClick={()=>statusAction(r,'confirmada')}>Confirmar</button><button onClick={()=>statusAction(r,'pendente_pagamento')}>Pagamento</button><button className="dangerAction" onClick={()=>cancelReservation(r)}>Cancelar</button></>}</td></>}/>} 
    </div>
  </Panel>;
}

function emergencyLocationOptions(settings={}){ return parseJson(settings.EMERGENCY_LOCATIONS, ['Minha unidade','Corredor','Vizinho','Elevador','Garagem','Salao de Festas','Brinquedoteca','Sauna','Piscina','Portaria','Zeladoria','Limpeza']); }
function floorsList(){ return ['Garagem -1','Garagem 0','SL','0',...Array.from({length:11},(_,i)=>String(i+1))]; }
function Emergency({data,forms,setForm,action,openConfirm,settings,session}){
  const types=data.emergencyTypes.length?data.emergencyTypes:[];
  const f=forms.emergency;
  const selected=types.find(t=>t.code===f.type) || types[0] || {code:'elevador',label:'Elevador',instructions:'Solicite atendimento da portaria.'};
  const loginLocal=session?.unit || (['portaria','funcionario','sindico'].includes(session?.role)?roleLabel(session.role):'');
  const location=f.occurrence_location||'Minha unidade';
  const finalLocal= location==='Minha unidade' ? (loginLocal || f.unit || '') : location==='Vizinho' ? `Vizinho - unidade ${f.neighbor_unit || 'não informada'}` : location==='Corredor' ? `Corredor - andar ${f.floor || 'não informado'}` : location;
  const elevatorWhats = String(settings.ELEVATOR_MAINTENANCE_WHATSAPP || '').replace(/\D/g,'');
  const msgElevator = encodeURIComponent(`Olá, equipe de manutenção. Há uma ocorrência no elevador do Condomínio Vitória Régia. Local: ${finalLocal || 'a confirmar'}. Solicitante: ${session?.name || session?.email || 'usuário do sistema'}.`);
  const groups = [['pendente','Aguardando aprovação'], ['aprovada','Aprovadas'], ['rejeitada','Não aprovadas']];
  return <Panel title="Emergência" subtitle="Informe a situação. A portaria/síndico avaliam antes de avisar moradores." icon={<Siren/>}>
    <div className="emergencyGrid compactEmergencyGrid">{types.map(t=><button type="button" className={'emergency compact '+(f.type===t.code?'selected':'')} key={t.code} onClick={()=>setForm('emergency',{type:t.code,unit:loginLocal})}><span className="emergencyIcon"><EmergencyIcon code={t.code} label={t.label}/></span><b>{t.label}</b><small>{t.instructions}</small></button>)}</div>
    <form className="formGrid emergencyForm cleanEmergencyForm" onSubmit={e=>{e.preventDefault(); openConfirm('Confirmar solicitação de emergência',{Tipo:selected?.label||f.type,Local:finalLocal||'Área comum'},()=>action('/api/emergency',{...f, unit:loginLocal, occurrence_location:location, location_type:location, neighbor_unit:f.neighbor_unit, floor:f.floor},'Emergência enviada para avaliação'));}}>
      <label>Tipo<select value={f.type} onChange={e=>setForm('emergency',{type:e.target.value})}>{types.map(t=><option value={t.code} key={t.code}>{t.label}</option>)}</select></label>
      <label>Onde é a ocorrência?<select value={location} onChange={e=>setForm('emergency',{occurrence_location:e.target.value, location_type:e.target.value})}>{emergencyLocationOptions(settings).map(opt=><option key={opt}>{opt}</option>)}</select></label>
      {location==='Vizinho' && <label>Unidade do vizinho<input required placeholder="Ex.: 502" value={f.neighbor_unit} onChange={e=>setForm('emergency',{neighbor_unit:e.target.value})}/></label>}
      {location==='Corredor' && <label>Andar<select required value={f.floor} onChange={e=>setForm('emergency',{floor:e.target.value})}><option value="">Selecione</option>{floorsList().map(x=><option key={x}>{x}</option>)}</select></label>}
      <label>Local do solicitante<input value={loginLocal} readOnly placeholder="Unidade, portaria, zeladoria ou limpeza"/></label>
      <textarea placeholder="Descreva rapidamente o que está acontecendo" value={f.message} onChange={e=>setForm('emergency',{message:e.target.value})}/>
      {String(f.type).includes('elev') && <div className="noticeBox ok elevatorContact"><b>Manutenção do elevador</b><small>{elevatorWhats?'WhatsApp cadastrado nas configurações.':'Cadastre o WhatsApp da manutenção em Configurações → Emergência.'}</small>{elevatorWhats && <a className="buttonlike" target="_blank" href={`https://wa.me/${elevatorWhats.startsWith('55')?elevatorWhats:'55'+elevatorWhats}?text=${msgElevator}`}><MessageCircle/> Chamar manutenção</a>}</div>}
      <button><Siren/> Enviar solicitação</button>
    </form>
    <div className="emergencyStatusColumns">{groups.map(([key,label])=>{ const rows=(data.emergencyRequests||[]).filter(r=> key==='pendente' ? !['aprovada','rejeitada','recusada'].includes(String(r.status||'pendente')) : key==='aprovada' ? String(r.status)==='aprovada' : ['rejeitada','recusada'].includes(String(r.status||''))); return <div className="subpanel" key={key}><h3>{label}</h3><Table rows={rows} render={r=><><td><b>{r.type_label}</b><small>{r.occurrence_location || r.unit} · {r.message}</small></td><td><Status ok={r.status==='aprovada'}>{emergencyStatusText(r.status)}</Status></td><td className="actions"><button className="confirmAction" onClick={()=>action(`/api/emergency-requests/${r.id}/approve`,{note:'Aprovado'},'Emergência aprovada')}>Aprovar</button><button className="dangerAction" onClick={()=>action(`/api/emergency-requests/${r.id}/reject`,{note:'Rejeitada'},'Emergência rejeitada')}>Rejeitar</button></td></>}/></div>})}</div>
  </Panel>;
}
function Profile({forms,setForm,action,settings}){ const f=forms.profile; const h=forms.householdMember||{}; return <Panel title="Meu perfil" subtitle="Cada morador mantém seus contatos atualizados." icon={<UserCheck/>}><form className="formGrid" onSubmit={e=>{e.preventDefault(); action('/api/profile', f, 'Perfil atualizado', 'PUT');}}><label>Nome<input value={f.name} onChange={e=>setForm('profile',{name:e.target.value})}/></label><label>E-mail<input value={f.email} onChange={e=>setForm('profile',{email:e.target.value})}/></label><label>WhatsApp<input value={f.whatsapp_phone} onChange={e=>setForm('profile',{whatsapp_phone:e.target.value})}/></label><label>Usuário Telegram<input value={f.telegram_username||''} onChange={e=>setForm('profile',{telegram_username:e.target.value})} placeholder="@usuario"/></label><label>Chat ID Telegram<input value={f.telegram_chat_id||''} onChange={e=>setForm('profile',{telegram_chat_id:e.target.value})} placeholder="ID numérico após /start no bot"/></label><label>Unidade<input value={f.unit} onChange={e=>setForm('profile',{unit:e.target.value})}/></label><label>Nova senha<input type="password" value={f.password} onChange={e=>setForm('profile',{password:e.target.value})}/></label><ChannelChooser settings={settings} value={f.notification_preferences} onChange={v=>setForm('profile',{notification_preferences:v})}/><button><Save/> Salvar meu perfil</button></form><div className="subpanel premiumForm"><h3><UserPlus/> Solicitar morador adicional da minha unidade</h3><p>Use esta opção para solicitar acesso de outro morador da mesma unidade. O cadastro continua sujeito à aprovação do síndico e ao limite configurado.</p><form className="formGrid" onSubmit={e=>{e.preventDefault(); action('/api/residents/request-same-unit', h, 'Solicitação enviada ao síndico');}}><label>Nome completo *<input required value={h.name||''} onChange={e=>setForm('householdMember',{name:e.target.value})}/></label><label>E-mail<input type="email" value={h.email||''} onChange={e=>setForm('householdMember',{email:e.target.value})}/></label><label>WhatsApp<input value={h.whatsapp_phone||''} onChange={e=>setForm('householdMember',{whatsapp_phone:e.target.value})}/></label><label>Usuário Telegram<input value={h.telegram_username||''} onChange={e=>setForm('householdMember',{telegram_username:e.target.value})} placeholder="@usuario"/></label><label>Chat ID Telegram<input value={h.telegram_chat_id||''} onChange={e=>setForm('householdMember',{telegram_chat_id:e.target.value})} placeholder="ID numérico"/></label><label>Documento<input value={h.document||''} onChange={e=>setForm('householdMember',{document:e.target.value})}/></label><button><UserPlus/> Enviar para aprovação</button></form></div></Panel>; }

function EmergencySettings({forms,setForm,action,settings}){ const s=forms.settings; return <div className="stack"><SettingCard title="Emergência e elevador" icon={<Siren/>}><div className="formGrid"><label>WhatsApp da manutenção do elevador<input placeholder="Ex.: 5583999999999" value={s.ELEVATOR_MAINTENANCE_WHATSAPP || settings.ELEVATOR_MAINTENANCE_WHATSAPP || ''} onChange={e=>setForm('settings',{ELEVATOR_MAINTENANCE_WHATSAPP:e.target.value})}/></label><label>Telefone da operadora do elevador<input value={s.ELEVATOR_OPERATOR_PHONE || settings.ELEVATOR_OPERATOR_PHONE || ''} onChange={e=>setForm('settings',{ELEVATOR_OPERATOR_PHONE:e.target.value})}/></label><label>Locais de ocorrência<textarea placeholder="Um local por linha: Corredor, Vizinho, Elevador, Garagem..." value={s.EMERGENCY_LOCATIONS_TEXT || (Array.isArray(parseJson(settings.EMERGENCY_LOCATIONS, null)) ? parseJson(settings.EMERGENCY_LOCATIONS, []).join('\n') : '')} onChange={e=>setForm('settings',{EMERGENCY_LOCATIONS_TEXT:e.target.value, EMERGENCY_LOCATIONS:JSON.stringify(e.target.value.split('\n').map(x=>x.trim()).filter(Boolean))})}/></label><label className="check"><input type="checkbox" checked={bool(s.EMERGENCY_ALLOW_GENERAL_ALERT ?? settings.EMERGENCY_ALLOW_GENERAL_ALERT,true)} onChange={e=>setForm('settings',{EMERGENCY_ALLOW_GENERAL_ALERT:String(e.target.checked)})}/>Permitir aviso geral apenas para incêndio/invasão</label><button onClick={()=>saveSettings(forms,action)}><Save/> Salvar emergência</button></div></SettingCard></div>; }
function ErrorLogs({action}){ const [logs,setLogs]=useState([]); const [loading,setLoading]=useState(false); async function load(){ setLoading(true); try{ setLogs(await request('/api/error-logs')); } finally { setLoading(false); } } useEffect(()=>{load().catch(()=>null)},[]); return <div className="stack errorLogPanel"><div className="auditToolbar"><button className="secondaryAction" onClick={load}><RefreshCcw/> Atualizar logs</button><button className="dangerAction" onClick={()=>action('/api/error-logs',{},'Logs limpos','DELETE').then(load)}><Trash2/> Limpar logs</button></div>{loading&&<small>Carregando...</small>}<div className="logCards">{logs.map(l=><article className="logCard" key={l.id}><div><Status ok={false}>Erro</Status><b>{l.message}</b><small>{l.method} {l.path}</small></div><small>{l.actor || 'sistema'} · {new Date(l.created_at).toLocaleString('pt-BR')}</small></article>)}{!logs.length&&!loading&&<div className="noticeBox ok"><b>Nenhum erro registrado</b><small>O sistema não possui logs recentes de erro.</small></div>}</div></div>; }

function SettingsPage(props){ const tabs=[['aparencia','Aparência'],['notificacoes','Notificações'],['email','E-mail'],['telegram','Telegram'],['whatsapp','WhatsApp'],['banco','Banco'],['emergencia','Emergência'],['condominio','Condomínio'],['areas','Áreas'],['apps','Apps'],['documentos','Documentos'],['atualizacoes','Atualizações'],['auditoria','Auditoria']]; return <Panel title="Configurações" subtitle="Tudo em subgrupos simples e objetivos." icon={<Settings/>}><SubTabs value={props.configTab} setValue={props.setConfigTab} tabs={tabs}/>{props.configTab==='aparencia'&&<AppearanceSettings {...props}/>} {props.configTab==='notificacoes'&&<NotificationSettings {...props}/>} {props.configTab==='email'&&<ProviderSettings {...props} type="email"/>} {props.configTab==='telegram'&&<ProviderSettings {...props} type="telegram"/>} {props.configTab==='whatsapp'&&<ProviderSettings {...props} type="whatsapp"/>} {props.configTab==='banco'&&<BankSettings {...props}/>} {props.configTab==='emergencia'&&<EmergencySettings {...props}/>} {props.configTab==='condominio'&&<CondoSettings {...props}/>} {props.configTab==='areas'&&<AreasSettings {...props}/>} {props.configTab==='apps'&&<AppsSettings {...props}/>} {props.configTab==='documentos'&&<DocumentsSettings {...props}/>} {props.configTab==='atualizacoes'&&<UpdateSettings {...props}/>} {props.configTab==='auditoria'&&<AuditPage {...props}/>}</Panel>; }
function saveSettings(forms, action){ const payload={...forms.settings}; for(const k of Object.keys(payload)){ if(sensitive.has(k) && (!payload[k] || String(payload[k]).includes('***'))) delete payload[k]; } return action('/api/settings', payload, 'Configurações salvas'); }
function AppearanceSettings({forms,setForm,action,settings}){ const s=forms.settings; return <SettingCard title="Aparência" icon={<Palette/>}><div className="themePreview"><img src="/logo-vitoria-regia.svg"/><div><b>Prévia do Vitória Régia</b><small>A cor muda ao selecionar; clique em salvar para manter para todos.</small></div></div><div className="formGrid"><label>Cor principal do sistema<input type="color" value={s.THEME_ACCENT || settings.THEME_ACCENT || '#126b5f'} onChange={e=>setForm('settings',{THEME_ACCENT:e.target.value})}/></label><label>Cor de apoio<input type="color" value={s.THEME_ACCENT_2 || settings.THEME_ACCENT_2 || '#35b5a2'} onChange={e=>setForm('settings',{THEME_ACCENT_2:e.target.value})}/></label><label>Modo<select value={s.APPEARANCE||settings.APPEARANCE||'light'} onChange={e=>{document.body.dataset.appearance=e.target.value; setForm('settings',{APPEARANCE:e.target.value});}}><option value="light">Claro</option><option value="dark">Escuro</option></select></label><label>Orientação do menu<select value={s.MENU_ORIENTATION||settings.MENU_ORIENTATION||'vertical'} onChange={e=>setForm('settings',{MENU_ORIENTATION:e.target.value})}><option value="vertical">Lateral</option><option value="top">Superior</option><option value="floating">Compacto</option></select></label><label>Tamanho do texto<select value={s.THEME_TEXT_SIZE||s.UI_DENSITY||settings.THEME_TEXT_SIZE||settings.UI_DENSITY||'comfort'} onChange={e=>setForm('settings',{THEME_TEXT_SIZE:e.target.value,UI_DENSITY:e.target.value})}><option value="compact">Menor</option><option value="comfort">Normal</option><option value="spacious">Maior</option></select></label><button onClick={()=>saveSettings(forms,action)}><Save/> Salvar aparência</button></div></SettingCard>; }
function NotificationSettings(props){ const {forms,setForm,action}=props; const s=forms.settings; const telegramChat=s.TELEGRAM_CHAT_ID||DEFAULT_TELEGRAM_CHAT_ID; const portariaChat=s.TELEGRAM_PORTARIA_CHAT_ID||telegramChat||DEFAULT_TELEGRAM_CHAT_ID; return <div className="stack"><SettingCard title="Canais liberados" icon={<Bell/>}><div className="channels"><label><input type="checkbox" checked={bool(s.ENABLE_EMAIL,true)} onChange={e=>setForm('settings',{ENABLE_EMAIL:String(e.target.checked)})}/>E-mail</label><label><input type="checkbox" checked={bool(s.ENABLE_WHATSAPP,false)} onChange={e=>setForm('settings',{ENABLE_WHATSAPP:String(e.target.checked)})}/>WhatsApp</label><label><input type="checkbox" checked={bool(s.ENABLE_TELEGRAM,false)||bool(s.TELEGRAM_ENABLED,false)} onChange={e=>setForm('settings',{ENABLE_TELEGRAM:String(e.target.checked),TELEGRAM_ENABLED:String(e.target.checked)})}/>Telegram</label><label><input type="checkbox" checked={bool(s.ENABLE_BROWSER_PUSH,true)} onChange={e=>setForm('settings',{ENABLE_BROWSER_PUSH:String(e.target.checked)})}/>Navegador</label></div><div className="formGrid"><label>Chat ID padrão do condomínio<input value={telegramChat} onChange={e=>setForm('settings',{TELEGRAM_CHAT_ID:e.target.value,TELEGRAM_TEST_CHAT_ID:e.target.value})} placeholder={DEFAULT_TELEGRAM_CHAT_ID}/><small>Destino global administrativo. Usado quando um morador ou usuário não possui Chat ID próprio.</small></label></div><button className="saveConfig" onClick={()=>saveSettings(forms,action)}><Save/> Salvar canais e Chat ID</button></SettingCard><SettingCard title="Telegram Portaria Premium" icon={<MessageCircle/>}><div className="noticeBox ok premiumTelegramBox"><b>Celular da portaria dedicado</b><small>Use este Chat ID para o aparelho Telegram da portaria receber emergências, decisões de encomendas, falha de interfone e avisos operacionais. O APK kiosk pode permanecer no leitor automático, e o Telegram recebe as mensagens em paralelo.</small></div><div className="channels"><label><input type="checkbox" checked={bool(s.TELEGRAM_PORTARIA_ENABLED,true)} onChange={e=>setForm('settings',{TELEGRAM_PORTARIA_ENABLED:String(e.target.checked)})}/>Ativar Telegram Portaria</label><label><input type="checkbox" checked={bool(s.TELEGRAM_PORTARIA_RECEIVE_EMERGENCY,true)} onChange={e=>setForm('settings',{TELEGRAM_PORTARIA_RECEIVE_EMERGENCY:String(e.target.checked)})}/>Receber emergências</label><label><input type="checkbox" checked={bool(s.TELEGRAM_PORTARIA_RECEIVE_PACKAGES,true)} onChange={e=>setForm('settings',{TELEGRAM_PORTARIA_RECEIVE_PACKAGES:String(e.target.checked)})}/>Receber encomendas</label><label><input type="checkbox" checked={bool(s.TELEGRAM_INTERCOM_FALLBACK_ENABLED,true)} onChange={e=>setForm('settings',{TELEGRAM_INTERCOM_FALLBACK_ENABLED:String(e.target.checked)})}/>Usar Telegram quando interfone não atender</label></div><div className="formGrid"><label>Nome do dispositivo<input value={s.TELEGRAM_PORTARIA_LABEL||'Celular Portaria'} onChange={e=>setForm('settings',{TELEGRAM_PORTARIA_LABEL:e.target.value})}/></label><label>Chat ID Telegram da portaria<input value={portariaChat} onChange={e=>setForm('settings',{TELEGRAM_PORTARIA_CHAT_ID:e.target.value})} placeholder={DEFAULT_TELEGRAM_CHAT_ID}/><small>Ex.: 8188648317. Pode ser o Telegram instalado no celular da portaria.</small></label><label className="check"><input type="checkbox" checked={bool(s.PACKAGE_ELEVATOR_AUTH_ENABLED,true)} onChange={e=>setForm('settings',{PACKAGE_ELEVATOR_AUTH_ENABLED:String(e.target.checked)})}/>Permitir autorização de envio pelo elevador</label><label className="check"><input type="checkbox" checked={bool(s.PACKAGE_TELEGRAM_DECISIONS_ENABLED,true)} onChange={e=>setForm('settings',{PACKAGE_TELEGRAM_DECISIONS_ENABLED:String(e.target.checked)})}/>Usar botões de decisão nas encomendas</label><label className="check"><input type="checkbox" checked={bool(s.KIOSK_PORTARIA_PREMIUM_ENABLED,true)} onChange={e=>setForm('settings',{KIOSK_PORTARIA_PREMIUM_ENABLED:String(e.target.checked)})}/>Modo kiosk premium da portaria</label><label>PIN para sair/trocar app no APK kiosk<input type="password" value={s.KIOSK_PORTARIA_PIN||''} onChange={e=>setForm('settings',{KIOSK_PORTARIA_PIN:e.target.value})} placeholder="Definir no APK"/></label><label className="full">Apps liberados no kiosk<textarea value={s.KIOSK_ALLOWED_APPS||'Vitória Régia Portaria,Telegram,Câmera,Wi-Fi'} onChange={e=>setForm('settings',{KIOSK_ALLOWED_APPS:e.target.value})}/></label><button onClick={()=>saveSettings(forms,action)}><Save/> Salvar Portaria Premium</button><button type="button" className="secondaryAction" onClick={()=>action('/api/telegram/test',{chat_id:portariaChat,message:'Teste do Telegram Portaria Premium - Sistema Vitória Régia'},'Teste enviado para a portaria')}><Send/> Testar Telegram da portaria</button></div></SettingCard><NotifyTests {...props}/></div>; }
function ProviderSettings({forms,setForm,action,type,data}){ const s=forms.settings; const maps={email:[['MAIL_PROVIDER','Provedor principal'],['EMAIL_PROVIDER','Provedor de e-mail'],['SENDGRID_API_KEY','SendGrid API Key'],['SENDGRID_FROM_EMAIL','E-mail remetente'],['SENDGRID_FROM_NAME','Nome do remetente'],['SENDGRID_REPLY_TO','Responder para'],['SENDGRID_TO_DEFAULT','E-mail padrão de teste'],['MAIL_FROM','Remetente SMTP'],['SMTP_HOST','SMTP servidor'],['SMTP_PORT','SMTP porta'],['SMTP_USER','SMTP usuário'],['SMTP_PASS','SMTP senha'],['PUBLIC_APP_URL','URL pública do sistema']],telegram:[['TELEGRAM_ENABLED','Telegram ativo'],['ENABLE_TELEGRAM','Canal Telegram liberado'],['TELEGRAM_START_URL','Link de início do bot'],['TELEGRAM_BOT_USERNAME','Usuário do bot'],['TELEGRAM_BOT_TOKEN','Token do bot'],['TELEGRAM_WEBHOOK_SECRET','Segredo do webhook'],['TELEGRAM_PARSE_MODE','Modo de texto'],['TELEGRAM_API_BASE_URL','Base da API'],['TELEGRAM_WEBHOOK_URL','URL do webhook'],['TELEGRAM_ALLOWED_UPDATES','Eventos permitidos'],['PUBLIC_APP_URL','URL pública do sistema']],whatsapp:[['ENABLE_WHATSAPP','Canal WhatsApp liberado'],['WHATSAPP_API_VERSION','Versão da API'],['WHATSAPP_API_BASE_URL','Base da API'],['WHATSAPP_PHONE_NUMBER_ID','Phone Number ID'],['WHATSAPP_BUSINESS_ACCOUNT_ID','Business Account ID'],['WHATSAPP_ACCESS_TOKEN','Token de acesso'],['WHATSAPP_API_TOKEN','Token alternativo'],['WHATSAPP_TEMPLATE_PACKAGE','Template de encomenda'],['WHATSAPP_TEMPLATE_RESERVATION','Template de reserva'],['WHATSAPP_TO_DEFAULT','WhatsApp padrão de teste']]}; const title=type==='email'?'E-mail / SendGrid / SMTP':type==='telegram'?'Telegram':'WhatsApp'; const icon=type==='email'?<Mail/>:type==='telegram'?<MessageCircle/>:<Smartphone/>; const isBool=(k)=>/^ENABLE_|_ENABLED$/.test(k) || ['TELEGRAM_ENABLED'].includes(k); const testPayload= type==='email'?{channel:'email',to:s.SENDGRID_TO_DEFAULT || data.notifyConfig?.email?.sendgridFromEmail || '',subject:'Teste Vitória Régia',message:'Teste de e-mail do Sistema Vitória Régia.'}: type==='telegram'?{channel:'telegram',to:s.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID,message:'Teste do Telegram - Sistema Vitória Régia.'}:{channel:'whatsapp',to:s.WHATSAPP_TO_DEFAULT || '',message:'Teste de WhatsApp - Sistema Vitória Régia.'}; return <SettingCard title={title} icon={icon}><div className="noticeBox ok"><b>Variáveis de comunicação</b><small>Os campos abaixo substituem as variáveis do Render quando salvos no sistema. Tokens, senhas e chaves aparecem mascarados e nunca são enviados ao GitHub.</small></div><div className="formGrid providerGrid">{maps[type].map(([k,l])=> isBool(k) ? <label className="check" key={k}><input type="checkbox" checked={bool(s[k], false)} onChange={e=>setForm('settings',{[k]:String(e.target.checked), ...(k==='TELEGRAM_ENABLED'?{ENABLE_TELEGRAM:String(e.target.checked)}:{})})}/>{l}</label> : <label key={k}>{l}<input type={sensitive.has(k)?'password':'text'} placeholder={sensitive.has(k)?maskValue(s[k]):''} value={sensitive.has(k) && String(s[k]||'').includes('***')?'':(s[k]||'')} onChange={e=>setForm('settings',{[k]:e.target.value})}/></label>)}<button onClick={()=>saveSettings(forms,action)}><Save/> Salvar {title}</button><button type="button" className="secondaryAction" onClick={()=>action('/api/notify/test', testPayload, 'Teste enviado/processado') }><Send/> Testar {type==='email'?'e-mail':type==='telegram'?'Telegram':'WhatsApp'}</button>{type==='telegram'&&<><button type="button" className="secondaryAction" onClick={()=>action('/api/telegram/get-me',{},'Telegram testado') }><MessageCircle/> Verificar bot</button><button type="button" className="secondaryAction" onClick={()=>action('/api/telegram/set-webhook',{base_url:s.PUBLIC_APP_URL||window.location.origin},'Webhook configurado') }><RefreshCcw/> Configurar webhook</button><button type="button" className="secondaryAction" onClick={()=>action('/api/telegram/webhook-info',{},'Webhook verificado') }><Activity/> Ver webhook</button></>}</div><NotifyTests forms={forms} setForm={setForm} action={action} data={data}/></SettingCard>; }
function BankSettings({forms,setForm,action}){ const s=forms.settings; const keys=[['BANK_PROVIDER','Banco/gateway'],['BANK_API_BASE_URL','URL da API'],['BANK_CLIENT_ID','Client ID'],['BANK_CLIENT_SECRET','Client secret'],['BANK_API_TOKEN','Token API'],['BANK_ACCOUNT','Conta'],['BANK_AGENCY','Agência'],['BANK_WALLET','Carteira'],['BANK_CONTRACT','Convênio/contrato'],['BANK_PIX_KEY','Chave Pix']]; return <SettingCard title="Banco e boletos" icon={<Banknote/>}><div className="formGrid">{keys.map(([k,l])=><label key={k}>{l}<input type={sensitive.has(k)?'password':'text'} placeholder={sensitive.has(k)?maskValue(s[k]):''} value={sensitive.has(k) && String(s[k]||'').includes('***')?'':(s[k]||'')} onChange={e=>setForm('settings',{[k]:e.target.value})}/></label>)}<label className="check"><input type="checkbox" checked={bool(s.BOLETO_AUTO_GENERATE,false)} onChange={e=>setForm('settings',{BOLETO_AUTO_GENERATE:String(e.target.checked)})}/>Gerar boletos automaticamente quando houver API configurada</label><button onClick={()=>saveSettings(forms,action)}><Save/> Salvar banco</button></div></SettingCard>; }
function CondoSettings({forms,setForm,action}){ const s=forms.settings; return <SettingCard title="Condomínio" icon={<Building2/>}><div className="formGrid"><label>Nome<input value={s.CONDO_NAME||''} onChange={e=>setForm('settings',{CONDO_NAME:e.target.value})}/></label><label>Endereço<input value={s.CONDO_ADDRESS||''} onChange={e=>setForm('settings',{CONDO_ADDRESS:e.target.value})}/></label><label>Operadora do elevador<input value={s.ELEVATOR_OPERATOR_NAME||''} onChange={e=>setForm('settings',{ELEVATOR_OPERATOR_NAME:e.target.value})}/></label><label>Telefone emergência elevador<input value={s.ELEVATOR_EMERGENCY_PHONE||''} onChange={e=>setForm('settings',{ELEVATOR_EMERGENCY_PHONE:e.target.value})}/></label><label className="check"><input type="checkbox" checked={bool(s.ALLOW_MULTIPLE_RESIDENTS_PER_UNIT,false)} onChange={e=>setForm('settings',{ALLOW_MULTIPLE_RESIDENTS_PER_UNIT:String(e.target.checked)})}/>Autorizar cadastro de moradores adicionais por unidade</label><label>Quantidade máxima de moradores por unidade<input type="number" min="1" value={s.MAX_RESIDENTS_PER_UNIT||''} onChange={e=>setForm('settings',{MAX_RESIDENTS_PER_UNIT:e.target.value})}/></label><button onClick={()=>saveSettings(forms,action)}><Save/> Salvar condomínio</button></div></SettingCard>; }
function AreasSettings({data,forms,setForm,action}){ const f=forms.commonArea; return <SettingCard title="Áreas de lazer e períodos de reserva" icon={<CalendarDays/>}><form className="formGrid" onSubmit={e=>{e.preventDefault(); action('/api/common-areas',f,'Área de lazer salva');}}><label>Nome da área<input required value={f.name} onChange={e=>setForm('commonArea',{name:e.target.value})}/></label><label>Taxa de reserva<input type="number" value={f.fee_amount} onChange={e=>setForm('commonArea',{fee_amount:e.target.value})}/></label><label>Limite de convidados<input type="number" value={f.max_guests} onChange={e=>setForm('commonArea',{max_guests:e.target.value})}/></label><label>Períodos permitidos<textarea placeholder="Um por linha: dia_todo, manha, tarde, noite, horario" value={(f.reservation_periods||'').replace(/,/g,'\n')} onChange={e=>setForm('commonArea',{reservation_periods:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean).join(',')})}/></label><label className="check"><input type="checkbox" checked={f.count_children!==false} onChange={e=>setForm('commonArea',{count_children:e.target.checked})}/>Crianças contam no limite</label><label className="check"><input type="checkbox" checked={f.count_infants===true} onChange={e=>setForm('commonArea',{count_infants:e.target.checked})}/>Bebês de colo contam no limite</label><label>Regras<textarea value={f.rules_document} onChange={e=>setForm('commonArea',{rules_document:e.target.value})}/></label><button><Save/> Salvar área</button></form><Table rows={data.commonAreas} render={a=><><td><b>{a.name}</b><small>Períodos: {reservationPeriodsForArea(a).map(reservationPeriodLabel).join(', ')}</small></td><td>{money(a.fee_amount)}</td><td>{a.max_guests} convidados</td></>}/></SettingCard>; }
function AppsSettings({forms,setForm,action}){ const s=forms.settings; return <SettingCard title="Aplicativos" icon={<AppWindow/>}><div className="channels"><label><input type="checkbox" checked={bool(s.ENABLE_APP_PORTARIA,true)} onChange={e=>setForm('settings',{ENABLE_APP_PORTARIA:String(e.target.checked)})}/>Portaria</label><label><input type="checkbox" checked={bool(s.ENABLE_APP_SINDICO,true)} onChange={e=>setForm('settings',{ENABLE_APP_SINDICO:String(e.target.checked)})}/>Síndico</label><label><input type="checkbox" checked={bool(s.ENABLE_APP_MORADOR,true)} onChange={e=>setForm('settings',{ENABLE_APP_MORADOR:String(e.target.checked)})}/>Morador</label></div><div className="formGrid"><label>URL APK Portaria<input value={s.APK_PORTARIA_URL||''} onChange={e=>setForm('settings',{APK_PORTARIA_URL:e.target.value})}/></label><label>URL APK Síndico<input value={s.APK_SINDICO_URL||''} onChange={e=>setForm('settings',{APK_SINDICO_URL:e.target.value})}/></label><label>URL APK Morador<input value={s.APK_MORADOR_URL||''} onChange={e=>setForm('settings',{APK_MORADOR_URL:e.target.value})}/></label><label className="check"><input type="checkbox" checked={bool(s.KIOSK_PORTARIA_PREMIUM_ENABLED,true)} onChange={e=>setForm('settings',{KIOSK_PORTARIA_PREMIUM_ENABLED:String(e.target.checked)})}/>APK Portaria em modo kiosk premium</label><label>Apps liberados para troca controlada<input value={s.KIOSK_ALLOWED_APPS||'Vitória Régia Portaria,Telegram,Câmera,Wi-Fi'} onChange={e=>setForm('settings',{KIOSK_ALLOWED_APPS:e.target.value})}/></label><button onClick={()=>saveSettings(forms,action)}><Save/> Salvar apps</button></div></SettingCard>; }
function UpdateSettings({forms,setForm,action,settings,isAdminReserved}){
  const [testMsg,setTestMsg]=useState('');
  async function testGithub(){
    setTestMsg('Testando credenciais do GitHub...');
    const saved = await saveSettings(forms,action);
    if(!saved){ setTestMsg('Não foi possível salvar as configurações antes do teste.'); return; }
    try{
      const r = await request('/api/system-updates/github-test',{method:'POST',body:JSON.stringify({}),headers:{'Content-Type':'application/json'}});
      setTestMsg(r.message || 'GitHub testado com sucesso.');
    }catch(e){ setTestMsg(e.message); }
  }
  return <SettingCard title="Atualizações pelo site" icon={<RefreshCcw/>}>
    <div className="formGrid">
      <label className="check"><input type="checkbox" checked={bool(forms.settings.SHOW_UPDATES_TO_SINDICO,false)} onChange={e=>setForm('settings',{SHOW_UPDATES_TO_SINDICO:String(e.target.checked)})}/>Mostrar menu de atualização para o síndico</label>
      <label>Canal<select value={forms.settings.UPDATE_CHANNEL||'stable'} onChange={e=>setForm('settings',{UPDATE_CHANNEL:e.target.value})}><option value="stable">Estável</option><option value="beta">Teste</option></select></label>
      <label>Modo de aplicação<select value={forms.settings.UPDATE_APPLY_MODE||'github'} onChange={e=>setForm('settings',{UPDATE_APPLY_MODE:e.target.value})}><option value="github">GitHub automático</option><option value="manual">Manual / apenas validar</option><option value="local">Local/VPS</option></select></label>
      <label>Repositório GitHub<input placeholder="bmedeiros1987/vitoriaregia1" value={forms.settings.UPDATE_GITHUB_REPO||''} onChange={e=>setForm('settings',{UPDATE_GITHUB_REPO:e.target.value})}/></label>
      <label>Branch<input placeholder="main" value={forms.settings.UPDATE_GITHUB_BRANCH||''} onChange={e=>setForm('settings',{UPDATE_GITHUB_BRANCH:e.target.value})}/></label>
      <label className="full">Token GitHub<input type="password" placeholder={settings.UPDATE_GITHUB_TOKEN ? 'Token configurado — preencha somente para trocar' : 'github_pat_...'} value={forms.settings.UPDATE_GITHUB_TOKEN||''} onChange={e=>setForm('settings',{UPDATE_GITHUB_TOKEN:e.target.value})}/><small>Para token fine-grained, libere Contents: Read and write no repositório correto. Se aparecer Bad credentials, gere um novo token.</small></label>
      <label className="full">Deploy Hook Render<input placeholder="Opcional: URL do deploy hook do Render" value={forms.settings.RENDER_DEPLOY_HOOK_URL||''} onChange={e=>setForm('settings',{RENDER_DEPLOY_HOOK_URL:e.target.value})}/></label>
      <label className="full">Feed de atualização<input value={forms.settings.UPDATE_FEED_URL||''} onChange={e=>setForm('settings',{UPDATE_FEED_URL:e.target.value})}/></label>
      <button type="button" onClick={()=>saveSettings(forms,action)}><Save/> Salvar atualização</button>
      <button type="button" className="secondaryAction" onClick={testGithub}><ShieldCheck/> Testar GitHub</button>
    </div>
    {testMsg && <div className={testMsg.toLowerCase().includes('bad credentials') || testMsg.toLowerCase().includes('não') || testMsg.toLowerCase().includes('recusou') ? 'noticeBox warn' : 'noticeBox ok'}><b>Resultado do teste</b><small>{testMsg}</small></div>}
    {!isAdminReserved && <p>A validação e aplicação automática fica disponível somente para área reservada; o síndico pode visualizar quando liberado.</p>}
  </SettingCard>;
}
function AuditPage({data,action}){ const grouped=useMemo(()=>{ const m={}; for(const a of data.audit) (m[a.action] ||= []).push(a); return m; },[data.audit]); return <div className="stack auditPremium"><div className="auditHero"><History/><div><h3>Auditoria do sistema</h3><small>Acompanhe ações, alterações e erros técnicos com organização por categoria.</small></div></div><SettingCard title="Logs de erro" icon={<Activity/>}><ErrorLogs action={action}/></SettingCard><SettingCard title="Log de notificações" icon={<Bell/>}><Table rows={data.notifications||[]} render={n=><><td><b>{n.title}</b><small>{n.body}</small></td><td><Code>{channelNames[n.channel]||n.channel}</Code></td><td><Status ok={['lida','enviada'].includes(n.status)}>{n.status}</Status><small>{date(n.created_at)}</small></td></>}/></SettingCard>{Object.entries(grouped).map(([action,rows])=><div className="subpanel auditGroup" key={action}><h3>{action}</h3><Table rows={rows} render={a=><><td><b>{a.actor}</b><small>{a.entity}</small></td><td>{date(a.created_at)}</td></>}/></div>)}</div>; }
function CentralPro(props){ const showUpdates=props.isAdminReserved || bool(props.settings.SHOW_UPDATES_TO_SINDICO,false); return <Panel title="Sistema e Apps" subtitle="Aplicativos, manuais e atualizações do sistema." icon={<ShieldCheck/>}><SubTabs value={props.sub} setValue={props.setSub} tabs={[['apps','Aplicativos'], ...(showUpdates?[['updates','Atualizações']]:[]), ['manuais','Manuais'], ['documentos','Documentos']]} />{props.sub==='updates'&&showUpdates?<Updates {...props}/>:props.sub==='manuais'?<Manuals {...props}/>:props.sub==='documentos'?<Documents {...props}/>:<AppsDownload {...props}/>}</Panel>; }
function AppsDownload({settings}){ const apps=[['Portaria','APK_PORTARIA_URL','ENABLE_APP_PORTARIA','#/portaria'],['Síndico','APK_SINDICO_URL','ENABLE_APP_SINDICO','#/dashboard'],['Morador','APK_MORADOR_URL','ENABLE_APP_MORADOR','#/perfil']]; return <div className="appCards downloadApps">{apps.filter(([,u,e])=>bool(settings[e],true)).map(([name,key,,hash])=><article key={name}><Smartphone/><h3>Aplicativo {name}</h3><p>Use como PWA no celular ou baixe o APK quando ele estiver publicado.</p><div className="appActions"><a className="buttonlike" href={window.location.origin+'/'+hash}><AppWindow/> Abrir versão web/app</a>{settings[key]?<a className="buttonlike secondary" href={settings[key]} target="_blank" rel="noreferrer"><Download/> Baixar APK</a>:<button className="buttonlike disabled" type="button" disabled><Download/> APK não publicado</button>}</div></article>)}</div>; }
function Updates({data,forms,setForm,notify,loadAll,isAdminReserved}){
  const [progress,setProgress]=useState(0);
  const [progressText,setProgressText]=useState('');
  const [selectedFileName,setSelectedFileName]=useState('');
  const fileInputRef = useRef(null);
  async function upload(file){
    if(!file) return;
    setSelectedFileName(file.name || 'pacote selecionado');
    if(!isAdminReserved){
      notify('Apenas usuário master/admin pode enviar ZIP de atualização. Entre com o acesso reservado para aplicar atualizações.', true);
      return;
    }
    const fd=new FormData();
    fd.append('update_zip',file);
    fd.append('validation_code',forms.systemUpdate.validation_code||'');
    try{
      setProgress(18); setProgressText('Enviando pacote oficial...');
      await new Promise(r=>setTimeout(r,280));
      setProgress(52); setProgressText('Validando token interno e hash SHA-256...');
      await request('/api/system-updates/upload',{method:'POST',body:fd,raw:true});
      setProgress(100); setProgressText('Atualização recebida e validada pelo site. Clique em Aplicar para publicar.');
      notify('Atualização recebida e validada pelo site.');
      await loadAll();
      setTimeout(()=>setProgress(0),1800);
    }catch(e){
      setProgress(0); setProgressText('');
      notify(e.message || 'Não foi possível enviar o ZIP.',true);
    } finally {
      if(fileInputRef.current) fileInputRef.current.value='';
    }
  }
  async function applyUpdate(u){
    if(!isAdminReserved) return notify('Apenas usuário master/admin pode aplicar atualizações.', true);
    try{
      setProgress(16); setProgressText('Preparando aplicação da atualização...');
      await new Promise(r=>setTimeout(r,300));
      setProgress(45); setProgressText('Publicando atualização no repositório/deploy...');
      const result=await request(`/api/system-updates/${u.id}/apply`,{method:'POST',body:JSON.stringify({validation_code:forms.systemUpdate.validation_code, mode:forms.settings.UPDATE_APPLY_MODE || forms.systemUpdate.mode || 'github'}),headers:{'Content-Type':'application/json'}});
      setProgress(80); setProgressText('Atualização enviada. Reiniciando sessão para carregar a nova versão...');
      notify(result.message || 'Atualização aplicada. Você será direcionado para a tela de login.');
      setTimeout(()=>{ localStorage.removeItem('vr_token'); localStorage.removeItem('vr_user'); window.location.href='/'; }, 4800);
      setProgress(100);
    }catch(e){ setProgress(0); setProgressText(''); notify(e.message,true); }
  }
  return <div className="updatePanel"><div className="updateDrop premiumUpdate"><UploadCloud/><h3>Atualizar pelo site</h3><p>Envie aqui o ZIP oficial de atualização. O sistema valida o token interno e o hash SHA-256, aplica a atualização e retorna para a tela de login para carregar a nova versão.</p><div className="secureUpdateNote"><ShieldCheck/><small>O token de validação fica protegido dentro do ZIP oficial e não é exibido na tela.</small></div><button type="button" className="fileButton updateZipButton" onClick={()=>fileInputRef.current?.click()}><UploadCloud/> Selecionar ZIP</button><input ref={fileInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" style={{display:'none'}} onChange={e=>upload(e.target.files?.[0])}/>{selectedFileName&&<div className="noticeBox"><b>Arquivo selecionado</b><small>{selectedFileName}</small></div>}{!isAdminReserved&&<div className="noticeBox warn"><b>Acesso reservado</b><small>O botão abre o seletor, mas o envio só é aceito pelo backend para usuário master/admin.</small></div>}{progress>0&&<div className="progressWrap"><div className="progressTop"><b>{progressText}</b><small>{progress}%</small></div><div className="progressBar"><span style={{width:progress+'%'}}/></div></div>}<div className="noticeBox ok"><b>Observação importante</b><small>Após aplicar uma atualização, entre novamente no sistema. Isso evita carregar telas antigas do navegador durante o deploy.</small></div></div><Table rows={data.systemUpdates} render={u=><><td><b>{u.title||u.version||u.update_code}</b><small>{u.update_code}</small></td><td><Status ok={['validado','aplicado','publicada'].includes(u.status)}>{u.status}</Status></td><td><Code>{u.manifest?.signature ? 'Assinatura digital' : 'Token interno + hash'}</Code></td><td className="actions">{isAdminReserved&&<button className="confirmAction" onClick={()=>applyUpdate(u)}>Aplicar</button>}</td></>}/></div>;
}
function Documents({data}){ const rows=data.documents||[]; return <div className="stack"><div className="noticeBox ok"><b>Documentos do condomínio</b><small>Documentos públicos ficam disponíveis para todos os usuários. Documentos restritos aparecem somente para perfis autorizados.</small></div><Table rows={rows} render={d=><><td><b>{d.title}</b><small>{d.description || d.file_name}</small></td><td><Status ok={d.is_public}>{d.is_public?'Público':'Restrito'}</Status><small>{d.audience || 'geral'}</small></td><td><a className="buttonlike" href={`${API}/api/documents/${d.id}/download`} target="_blank" rel="noreferrer"><Download/> Baixar</a></td></>}/></div>; }
function DocumentsSettings({forms,setForm,action,loadAll}){ const [file,setFile]=useState(null); async function upload(e){ e.preventDefault(); if(!file) return alert('Selecione um arquivo.'); const fd=new FormData(); fd.append('document',file); fd.append('title',forms.document.title||file.name); fd.append('description',forms.document.description||''); fd.append('audience',forms.document.audience||'publico'); fd.append('is_public',String(forms.document.is_public!==false)); await request('/api/documents/upload',{method:'POST',body:fd,raw:true}); await loadAll?.(); alert('Documento enviado ao sistema.'); } return <SettingCard title="Documentos do condomínio" icon={<FileUp/>}><form className="formGrid" onSubmit={upload}><label>Título<input value={forms.document.title||''} onChange={e=>setForm('document',{title:e.target.value})}/></label><label>Público<select value={forms.document.audience||'publico'} onChange={e=>setForm('document',{audience:e.target.value})}><option value="publico">Público geral</option><option value="morador">Moradores</option><option value="portaria">Portaria</option><option value="sindico">Síndico</option><option value="restrito">Restrito</option></select></label><label className="check"><input type="checkbox" checked={forms.document.is_public!==false} onChange={e=>setForm('document',{is_public:e.target.checked})}/>Documento público para usuários</label><label className="full">Descrição<textarea value={forms.document.description||''} onChange={e=>setForm('document',{description:e.target.value})}/></label><label className="fileButton"><UploadCloud/> Selecionar arquivo<input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button><UploadCloud/> Enviar documento</button></form></SettingCard>; }
function OccurrenceBook({data,forms,setForm,action,session}){ const f=forms.occurrence||{}; const isManager=['sindico','subsindico','admin','master','portaria'].includes(session?.role); return <Panel title="Livro de Ocorrências" subtitle="Registre queixas, situações e solicitações de forma organizada e rastreável." icon={<BookOpen/>}><form className="formGrid premiumForm" onSubmit={e=>{e.preventDefault(); action('/api/occurrence-book', f, 'Ocorrência registrada e encaminhada ao síndico/subsíndico');}}><label>Título *<input required value={f.title||''} onChange={e=>setForm('occurrence',{title:e.target.value})}/></label><label>Local / unidade<input placeholder={session?.unit||'Ex.: 602, garagem, corredor'} value={f.unit||session?.unit||''} onChange={e=>setForm('occurrence',{unit:e.target.value})}/></label><label>Categoria<select value={f.category||'queixa'} onChange={e=>setForm('occurrence',{category:e.target.value})}><option value="queixa">Queixa</option><option value="barulho">Barulho</option><option value="convivencia">Convivência</option><option value="seguranca">Segurança</option><option value="manutencao">Manutenção</option><option value="outro">Outro</option></select></label><label>Prioridade<select value={f.priority||'normal'} onChange={e=>setForm('occurrence',{priority:e.target.value})}><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><label className="full">Descrição *<textarea required value={f.description||''} onChange={e=>setForm('occurrence',{description:e.target.value})} placeholder="Descreva com clareza o que aconteceu, onde ocorreu e quando foi percebido."/></label><button><Send/> Registrar ocorrência</button></form><Table rows={data.occurrenceBook||[]} render={o=><><td><b>{o.title}</b><small>{o.description}</small></td><td>{o.unit||'-'}<small>{o.category} · {o.priority}</small></td><td><Status ok={o.status==='fechada'}>{o.status}</Status><small>{date(o.created_at)}</small></td>{isManager&&<td className="actions"><button onClick={()=>{const response=prompt('Resposta ao morador'); if(response) action(`/api/occurrence-book/${o.id}/respond`,{response,status:'respondida'},'Ocorrência respondida');}}>Responder</button><button onClick={()=>action(`/api/occurrence-book/${o.id}/respond`,{response:o.response||'Fechada pelo painel',status:'fechada'},'Ocorrência fechada')}>Fechar</button></td>}</>}/></Panel>; }
function SupportPage({data,forms,setForm,action,session}){ const f=forms.support||{}; return <Panel title="Suporte e Ajuda" subtitle="Perguntas frequentes, manuais e contato com o suporte do sistema." icon={<HelpCircle/>}><div className="supportGrid"><section className="subpanel"><h3><MessageSquareText/> Falar com suporte</h3><p>Envie uma dúvida ou solicitação. O sistema registra o pedido e notifica os responsáveis pelos canais disponíveis.</p><form className="formGrid" onSubmit={e=>{e.preventDefault(); action('/api/support-tickets', f, 'Pedido de suporte enviado');}}><label>Assunto *<input required value={f.subject||''} onChange={e=>setForm('support',{subject:e.target.value})}/></label><label>Prioridade<select value={f.priority||'normal'} onChange={e=>setForm('support',{priority:e.target.value})}><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><label className="full">Mensagem *<textarea required value={f.body||''} onChange={e=>setForm('support',{body:e.target.value})}/></label><button><Send/> Enviar suporte</button></form></section><section className="subpanel"><h3><FileSearch/> Perguntas frequentes</h3>{(data.faqs||[]).map(q=><details className="faqItem" key={q.id}><summary>{q.question}</summary><p>{q.answer}</p></details>)}</section></div><Table rows={data.supportTickets||[]} render={t=><><td><b>{t.subject}</b><small>{t.body}</small></td><td><Status ok={t.status==='respondido'}>{t.status}</Status><small>{date(t.created_at)}</small></td><td>{t.response||'-'}</td></>}/></Panel>; }
function FinanceImport({forms,setForm,action,loadAll}){ const f=forms.financeImport||{}; async function preview(){ const r=await post('/api/finance/import-document',{text:f.text, unit:f.unit, preview:true}); setForm('financeImport',{previewRows:r.rows||[]}); } async function importRows(){ await action('/api/finance/import-document',{text:f.text, unit:f.unit, preview:false},'Lançamentos importados para o financeiro'); await loadAll?.(); } return <div className="stack"><div className="noticeBox ok"><b>Importar lançamentos de documentos</b><small>Cole o texto lido de balancetes, notas ou documentos financeiros. O sistema identifica datas, descrições e valores e permite importar para o financeiro.</small></div><div className="formGrid premiumForm"><label>Unidade relacionada, se houver<input value={f.unit||''} onChange={e=>setForm('financeImport',{unit:e.target.value})}/></label><label className="full">Texto extraído do documento<textarea rows="10" value={f.text||''} onChange={e=>setForm('financeImport',{text:e.target.value})} placeholder="Cole aqui o texto do balancete, nota ou demonstrativo."/></label><button type="button" onClick={preview}><Search/> Pré-visualizar lançamentos</button><button type="button" className="confirmAction" onClick={importRows}><UploadCloud/> Importar para o financeiro</button></div><Table rows={f.previewRows||[]} render={r=><><td><b>{r.title}</b><small>{r.category}</small></td><td>{money(r.amount)}</td><td>{r.due_date||'-'}</td><td><Status ok={r.type==='receita'}>{r.type}</Status></td></>}/></div>; }

function Manuals({data}){ const fallback=[['Manual geral','geral','/manuals/Manual_Geral_Vitoria_Regia_Pro_v9_8.pdf'],['Manual do síndico','síndico','/manuals/Manual_do_Sindico_Vitoria_Regia_Pro_v9_8.pdf'],['Manual da portaria','portaria','/manuals/Manual_da_Portaria_Vitoria_Regia_Pro_v9_8.pdf'],['Manual do morador','morador','/manuals/Manual_do_Morador_Vitoria_Regia_Pro_v9_8.pdf']].map((m,i)=>({id:'static-'+i,title:m[0],audience:m[1],created_at:null,staticUrl:m[2]})); const rows=(data.manuals&&data.manuals.length?data.manuals:fallback); return <Table rows={rows} render={m=><><td><b>{m.title}</b><small>{m.audience}</small></td><td>{m.created_at?date(m.created_at):'Manual padrão'}</td><td><a className="buttonlike" href={m.staticUrl || `${API}/api/manuals/${m.id}/download`} target="_blank" rel="noreferrer"><Download/> Baixar</a></td></>}/>; }
function ChannelChooser({settings,value={},onChange}){ const en=enabledChannels(settings); return <div className="channels"><b>Canais de notificação</b>{Object.entries(en).map(([k,ok]) => ok && <label key={k}><input type="checkbox" checked={value?.[k]!==false} onChange={e=>onChange({...(value||{}),[k]:e.target.checked})}/>{channelNames[k]}</label>)}</div>; }
function SubTabs({value,setValue,tabs}){ return <div className="subTabs">{tabs.map(([k,l])=><button key={k} className={value===k?'active':''} onClick={()=>setValue(k)}>{l}</button>)}</div>; }
function Panel({title,subtitle,icon,children}){ return <section className="panel"><div className="panelHead"><div>{icon}<div><h2>{title}</h2><p>{subtitle}</p></div></div></div>{children}</section>; }
function SettingCard({title,icon,children}){ return <section className="settingsCard"><h3>{icon} {title}</h3>{children}</section>; }
function Metric({icon,label,value,onClick}){ return <button type="button" className="metric" onClick={onClick}><span>{icon}</span><div><b>{value}</b><small>{label}</small></div><ChevronRight className="metricArrow"/></button>; }
function Status({ok,children}){ return <span className={'status '+(ok?'ok':'warn')}>{children}</span>; }
function Code({children}){ return <code className="code">{children}</code>; }
function Table({rows=[],render}){ return <div className="tableWrap"><table><tbody>{rows?.length?rows.map((r,i)=><tr key={r.id||i}>{render(r)}</tr>):<tr><td><small>Nenhum registro encontrado.</small></td></tr>}</tbody></table></div>; }
function ConfirmModal({confirm,onCancel,onConfirm}){ return <div className="modalOverlay"><div className="confirmModal"><h2><CheckCircle2/> {confirm.title}</h2><p>Confira os dados antes de gravar. Essa etapa evita cadastros duplicados ou lançamentos incorretos.</p><div className="confirmList">{Object.entries(confirm.fields||{}).map(([k,v])=><span key={k}>{k}<b>{String(v||'-')}</b></span>)}</div><div className="modalActions"><button onClick={onCancel}>Voltar e corrigir</button><button className="primary" onClick={onConfirm}>Confirmar cadastro</button></div></div></div>; }
function Footer(){ return <footer className="appFooter"><span>{VERSION}</span><span>Desenvolvido por <b>CrewCheck</b> · Todos os direitos reservados</span></footer>; }

createRoot(document.getElementById('root')).render(<App/>);
