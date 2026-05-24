import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home, BarChart3, CalendarDays, Users, Package, Megaphone, DoorOpen, Bot, CircleHelp,
  Settings, Gem, Menu, X, ChevronsLeft, ChevronsRight, Bell, ShieldCheck, Lock, User,
  Eye, EyeOff, Siren, Mail, Send, CloudSun, LogOut, Plus, Search, CheckCircle2, Trash2,
  Save, Smartphone, QrCode, Database, MessageCircle, Crown, Palette, LayoutPanelTop,
  PanelLeft, SlidersHorizontal, Moon, Sun, WandSparkles, AlertTriangle, ClipboardCheck,
  FileText, MapPin, ShieldAlert, Building2, Paintbrush, Download, Wrench, Activity, Sparkles,
  Radio, KeyRound, MonitorSmartphone, Rocket, Archive, UserPlus
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '';
const VERSION = import.meta.env.VITE_APP_VERSION || 'Vitória Régia Pro v6.0';
const defaultTheme = { accent: '#1f8f7a', menuMode: 'vertical', density: 'comfort', appearance: 'light' };

async function request(path, opts = {}) {
  const token = localStorage.getItem('vr_token');
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na operação');
  return data;
}

const blank = () => ({
  resident: { name: '', unit: '', phone: '', email: '', document: '', vehicle: '', notes: '' },
  pack: { tracking: '', recipient: '', unit: '', label: '', notes: '' },
  visitor: { name: '', document: '', unit: '', authorized_by: '', plate: '' },
  reservation: { area: '', unit: '', resident: '', reserved_for: '', shift: 'noite' },
  finance: { title: '', amount: '', type: 'receita', due_date: '' },
  notice: { title: '', body: '', channel: 'app', priority: 'normal' },
  incident: { title: '', description: '', unit: '', severity: 'normal' },
  maintenance: { title: '', supplier: '', scheduled_for: '', status: 'planejada', cost: '', notes: '' },
  email: { to: '', subject: '', body: '' },
  telegram: { message: '' }
});

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('vr_user') || 'null'));
  const [login, setLogin] = useState({ email: 'admin@vitoriaregia.local', password: '123456' });
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [active, setActive] = useState('dashboard');
  const [closed, setClosed] = useState(false);
  const [mini, setMini] = useState(false);
  const [forms, setForms] = useState(blank());
  const [filter, setFilter] = useState('');
  const [data, setData] = useState({
    dashboard: null, residents: [], packages: [], visitors: [], reservations: [], finance: [], notices: [],
    incidents: [], maintenance: [], audit: [], settings: {}
  });

  const theme = useMemo(() => ({
    ...defaultTheme,
    accent: data.settings.THEME_ACCENT || defaultTheme.accent,
    menuMode: data.settings.MENU_ORIENTATION || defaultTheme.menuMode,
    density: data.settings.UI_DENSITY || defaultTheme.density,
    appearance: data.settings.APPEARANCE || defaultTheme.appearance
  }), [data.settings]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.body.dataset.appearance = theme.appearance;
    document.body.dataset.density = theme.density;
  }, [theme]);

  const menu = [
    ['dashboard', Home, 'Início'], ['moradores', Building2, 'Moradores'], ['financeiro', BarChart3, 'Financeiro'],
    ['reservas', CalendarDays, 'Reservas'], ['visitantes', Users, 'Visitantes'], ['encomendas', Package, 'Encomendas'],
    ['comunicados', Megaphone, 'Comunicados'], ['portaria', DoorOpen, 'Portaria'], ['ocorrencias', ShieldAlert, 'Ocorrências'],
    ['manutencao', Wrench, 'Manutenção'], ['automacoes', Bot, 'Automações'], ['config', Settings, 'Configurações'],
    ['premium', Gem, 'Central Pro'], ['ajuda', CircleHelp, 'Ajuda']
  ];

  const shortcuts = [
    ['financeiro', 'Financeiro', 'Contas, taxas, receitas e despesas', BarChart3, 'green'],
    ['reservas', 'Reservas', 'Áreas comuns e agenda inteligente', CalendarDays, 'blue'],
    ['moradores', 'Moradores', 'Cadastro, veículos e contatos', Building2, 'indigo'],
    ['visitantes', 'Visitantes', 'Autorizações da portaria', Users, 'cyan'],
    ['encomendas', 'Encomendas', 'Entregas, etiquetas e baixa rápida', Package, 'gold'],
    ['comunicados', 'Comunicados', 'Avisos por app, e-mail e Telegram', Megaphone, 'mint'],
    ['ocorrencias', 'Ocorrências', 'Registro, severidade e histórico', ShieldAlert, 'rose'],
    ['manutencao', 'Manutenção', 'Fornecedores, custos e agenda', Wrench, 'slate'],
    ['config', 'Configurações', 'Tema, menu, integrações e segurança', Settings, 'gray'],
    ['premium', 'Central Pro', 'Experiência premium Vitória Régia', Gem, 'premium']
  ];

  const notify = (m) => { setToast(m); setTimeout(() => setToast(''), 3400); };

  const load = async () => {
    if (!session) return;
    try {
      const endpoints = {
        dashboard: '/api/dashboard', residents: '/api/residents', packages: '/api/packages', visitors: '/api/visitors',
        reservations: '/api/reservations', finance: '/api/finance', notices: '/api/notices', incidents: '/api/incidents',
        maintenance: '/api/maintenance', audit: '/api/audit', settings: '/api/settings'
      };
      const pairs = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => [key, await request(url)]));
      setData(Object.fromEntries(pairs));
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, [session]);

  const act = async (path, body, msg, method = 'POST') => {
    await request(path, { method, body: JSON.stringify(body || {}) });
    setForms(blank());
    setFilter('');
    await load();
    notify(msg);
  };

  const signIn = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const r = await request('/api/login', { method: 'POST', body: JSON.stringify(login) });
      localStorage.setItem('vr_token', r.token);
      localStorage.setItem('vr_user', JSON.stringify(r.user));
      setSession(r.user);
    } catch (e) { setErr(e.message); }
  };

  const logout = () => { localStorage.removeItem('vr_token'); localStorage.removeItem('vr_user'); setSession(null); };

  const emergency = async () => {
    const needConfirm = (data.settings.EMERGENCY_CONFIRM || 'true') === 'true';
    if (needConfirm && !window.confirm('Acionar emergência agora? O evento será registrado e enviado aos canais configurados.')) return;
    await act('/api/emergency', { message: 'Emergência acionada pelo painel do síndico' }, 'Emergência acionada, registrada e enviada aos canais configurados');
  };

  const stats = useMemo(() => ({
    moradores: data.residents.length,
    pendentes: data.packages.filter(p => p.status !== 'entregue').length,
    visitantes: data.visitors.length,
    reservas: data.reservations.filter(r => r.status === 'confirmada').length,
    ocorrencias: data.incidents.filter(i => i.status !== 'fechada').length,
    manutencoes: data.maintenance.filter(m => m.status !== 'concluida').length,
    saldo: data.finance.reduce((acc, x) => acc + (x.type === 'receita' ? Number(x.amount || 0) : -Number(x.amount || 0)), 0)
  }), [data]);

  if (!session) return <Login login={login} setLogin={setLogin} signIn={signIn} err={err} showPass={showPass} setShowPass={setShowPass} />;

  const menuIsSide = theme.menuMode === 'vertical' || theme.menuMode === 'floating';

  return <main className={`app menu-${theme.menuMode} ${closed ? 'menu-closed' : ''} ${mini ? 'menu-mini' : ''}`}>
    {menuIsSide && <Sidebar menu={menu} active={active} setActive={setActive} closed={closed} setClosed={setClosed} mini={mini} setMini={setMini} logout={logout} />}
    {theme.menuMode === 'horizontal' && <TopMenu menu={menu} active={active} setActive={setActive} logout={logout} />}
    {closed && menuIsSide && <button className="openSide" onClick={() => setClosed(false)}><Menu /></button>}
    <section className="content">
      <Header settings={data.settings} session={session} />
      {err && <div className="toast errorToast">{err}</div>}
      {toast && <div className="toast">{toast}</div>}
      <View active={active} setActive={setActive} shortcuts={shortcuts} data={data} setData={setData} stats={stats} forms={forms} setForms={setForms} filter={filter} setFilter={setFilter} act={act} load={load} notify={notify} />
      <button className="emergency" onClick={emergency}><Siren />Emergência</button>
      <footer className="footer-version"><b>{VERSION}</b></footer>
    </section>
  </main>;
}

function Sidebar({ menu, active, setActive, closed, setClosed, mini, setMini, logout }) {
  if (closed) return null;
  return <aside>
    <div className="sideTop"><b>♧</b><button title="Fechar menu" onClick={() => setClosed(true)}><X /></button></div>
    {menu.map(([id, Icon, label]) => <button key={id} onClick={() => setActive(id)} className={active === id ? 'on' : ''}><Icon /><span>{label}</span></button>)}
    <div className="sideBottom"><button onClick={() => setMini(!mini)}>{mini ? <ChevronsRight /> : <ChevronsLeft />}<span>{mini ? 'Expandir' : 'Encolher'}</span></button><button onClick={logout}><LogOut /><span>Sair</span></button></div>
  </aside>;
}

function TopMenu({ menu, active, setActive, logout }) {
  return <nav className="topMenu"><b>♧ Vitória Régia</b><div>{menu.map(([id, Icon, label]) => <button key={id} onClick={() => setActive(id)} className={active === id ? 'on' : ''}><Icon /><span>{label}</span></button>)}</div><button onClick={logout}><LogOut />Sair</button></nav>;
}

function Header({ settings, session }) {
  return <header><div><h1>Olá, {session?.name || 'Síndico'}! 👋</h1><p>Bem-vindo ao {settings.CONDO_NAME || 'Condomínio Vitória Régia'}</p></div><div className="topActions"><div className="weather"><CloudSun /><span>{settings.WEATHER_CITY || 'João Pessoa'}</span><b>28°</b></div><div className="profile"><Bell /><div><b>{session?.role || 'síndico'}</b><small>Perfil identificado</small></div></div></div></header>;
}

function Login({ login, setLogin, signIn, err, showPass, setShowPass }) {
  return <div className="loginPage"><div className="loginCard"><div className="brand"><div className="lotus">♧</div><h1>VITÓRIA RÉGIA</h1><span>CONDOMÍNIO PRO</span></div><h2>Bem-vindo de volta!</h2><p>Faça login para acessar o sistema.</p><form onSubmit={signIn}><label><User size={18} /><input placeholder="Usuário" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} /></label><label><Lock size={18} /><input type={showPass ? 'text' : 'password'} placeholder="Senha" value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} /><button type="button" onClick={() => setShowPass(!showPass)}>{showPass ? <EyeOff /> : <Eye />}</button></label>{err && <b className="error">{err}</b>}<button className="primary">Entrar</button></form><a>Sistema protegido por login</a></div><div className="secure"><ShieldCheck /> Acesso seguro e inteligente.<small>Seu perfil é identificado automaticamente.</small></div></div>;
}

function View(p) {
  const set = (k, v) => p.setForms({ ...p.forms, [k]: { ...p.forms[k], ...v } });
  const f = p.forms;
  const has = (x) => (JSON.stringify(x || '')).toLowerCase().includes(p.filter.toLowerCase());

  if (p.active === 'dashboard') return <Dashboard {...p} />;

  if (p.active === 'moradores') return <Panel title="Moradores"><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/residents', f.resident, 'Morador cadastrado'); }}><input placeholder="Nome" value={f.resident.name} onChange={e => set('resident', { name: e.target.value })} /><input placeholder="Unidade" value={f.resident.unit} onChange={e => set('resident', { unit: e.target.value })} /><input placeholder="Telefone" value={f.resident.phone} onChange={e => set('resident', { phone: e.target.value })} /><input placeholder="E-mail" value={f.resident.email} onChange={e => set('resident', { email: e.target.value })} /><button><UserPlus />Cadastrar</button></form><div className="search"><Search /><input placeholder="Buscar morador, unidade, telefone ou veículo" value={p.filter} onChange={e => p.setFilter(e.target.value)} /><Building2 /></div><Table rows={p.data.residents.filter(has)} render={x => <><td><b>{x.name}</b><small>Unidade {x.unit} · {x.phone || 'sem telefone'}</small></td><td>{x.email || '-'}</td><td><button onClick={() => p.act('/api/residents/' + x.id, {}, 'Morador removido', 'DELETE')}><Trash2 />Remover</button></td></>} /></Panel>;

  if (p.active === 'encomendas') return <Panel title="Encomendas"><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/packages', f.pack, 'Encomenda registrada'); }}><input placeholder="Código/etiqueta" value={f.pack.tracking} onChange={e => set('pack', { tracking: e.target.value, label: e.target.value })} /><input placeholder="Destinatário" value={f.pack.recipient} onChange={e => set('pack', { recipient: e.target.value })} /><input placeholder="Unidade" value={f.pack.unit} onChange={e => set('pack', { unit: e.target.value })} /><input placeholder="Observação" value={f.pack.notes} onChange={e => set('pack', { notes: e.target.value })} /><button><Plus />Cadastrar</button></form><div className="search"><Search /><input placeholder="Buscar encomenda, etiqueta, unidade ou morador" value={p.filter} onChange={e => p.setFilter(e.target.value)} /><QrCode /></div><Table rows={p.data.packages.filter(has)} render={x => <><td><b>{x.tracking}</b><small>{x.recipient} · Unidade {x.unit}</small></td><td><Status ok={x.status === 'entregue'}>{x.status}</Status></td><td>{x.status !== 'entregue' && <button onClick={() => p.act('/api/packages/' + x.id + '/deliver', {}, 'Entrega confirmada')}><CheckCircle2 />Entregar</button>}</td></>} /></Panel>;

  if (p.active === 'visitantes' || p.active === 'portaria') return <Panel title="Portaria e visitantes"><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/visitors', f.visitor, 'Visitante autorizado'); }}><input placeholder="Visitante" value={f.visitor.name} onChange={e => set('visitor', { name: e.target.value })} /><input placeholder="Documento" value={f.visitor.document} onChange={e => set('visitor', { document: e.target.value })} /><input placeholder="Unidade" value={f.visitor.unit} onChange={e => set('visitor', { unit: e.target.value })} /><input placeholder="Placa/empresa" value={f.visitor.plate} onChange={e => set('visitor', { plate: e.target.value })} /><input placeholder="Autorizado por" value={f.visitor.authorized_by} onChange={e => set('visitor', { authorized_by: e.target.value })} /><button><Plus />Autorizar</button></form><Table rows={p.data.visitors} render={x => <><td><b>{x.name}</b><small>{x.document || 'sem documento'} · Unidade {x.unit}</small></td><td><Status ok>{x.status}</Status></td><td><button onClick={() => p.act('/api/incidents', { title: 'Ocorrência na portaria', description: 'Ocorrência envolvendo ' + x.name, unit: x.unit, severity: 'normal' }, 'Ocorrência registrada')}><ShieldAlert />Ocorrência</button></td></>} /></Panel>;

  if (p.active === 'financeiro') return <Panel title="Financeiro"><div className="metricStrip"><Metric label="Saldo previsto" value={money(p.stats.saldo)} icon={<BarChart3 />} /><Metric label="Receitas" value={money(p.data.finance.filter(x => x.type === 'receita').reduce((a, x) => a + Number(x.amount || 0), 0))} icon={<CheckCircle2 />} /><Metric label="Despesas" value={money(p.data.finance.filter(x => x.type === 'despesa').reduce((a, x) => a + Number(x.amount || 0), 0))} icon={<AlertTriangle />} /></div><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/finance', f.finance, 'Lançamento criado'); }}><input placeholder="Descrição" value={f.finance.title} onChange={e => set('finance', { title: e.target.value })} /><input placeholder="Valor" type="number" value={f.finance.amount} onChange={e => set('finance', { amount: e.target.value })} /><select value={f.finance.type} onChange={e => set('finance', { type: e.target.value })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select><input type="date" value={f.finance.due_date} onChange={e => set('finance', { due_date: e.target.value })} /><button><Plus />Adicionar</button></form><Table rows={p.data.finance} render={x => <><td><b>{x.title}</b><small>{x.type} · venc. {date(x.due_date)}</small></td><td>{money(Number(x.amount || 0))}</td><td>{x.status !== 'pago' ? <button onClick={() => p.act('/api/finance/' + x.id + '/pay', {}, 'Pagamento confirmado')}><CheckCircle2 />Baixar</button> : <Status ok>pago</Status>}</td></>} /></Panel>;

  if (p.active === 'reservas') return <Panel title="Reservas"><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/reservations', f.reservation, 'Reserva confirmada'); }}><input placeholder="Área comum" value={f.reservation.area} onChange={e => set('reservation', { area: e.target.value })} /><input placeholder="Unidade" value={f.reservation.unit} onChange={e => set('reservation', { unit: e.target.value })} /><input placeholder="Morador" value={f.reservation.resident} onChange={e => set('reservation', { resident: e.target.value })} /><input type="date" value={f.reservation.reserved_for} onChange={e => set('reservation', { reserved_for: e.target.value })} /><select value={f.reservation.shift} onChange={e => set('reservation', { shift: e.target.value })}><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option></select><button><Plus />Reservar</button></form><Table rows={p.data.reservations} render={x => <><td><b>{x.area}</b><small>{x.resident} · Unidade {x.unit} · {x.shift || '-'}</small></td><td>{date(x.reserved_for)}</td><td>{x.status !== 'cancelada' ? <button onClick={() => p.act('/api/reservations/' + x.id + '/cancel', {}, 'Reserva cancelada')}><Trash2 />Cancelar</button> : <Status>cancelada</Status>}</td></>} /></Panel>;

  if (p.active === 'comunicados') return <Panel title="Comunicados"><div className="grid two"><form onSubmit={e => { e.preventDefault(); p.act('/api/notices', f.notice, 'Comunicado salvo'); }} className="stack"><h3><Megaphone />Comunicado interno</h3><input placeholder="Título" value={f.notice.title} onChange={e => set('notice', { title: e.target.value })} /><select value={f.notice.priority} onChange={e => set('notice', { priority: e.target.value })}><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select><textarea placeholder="Mensagem" value={f.notice.body} onChange={e => set('notice', { body: e.target.value })} /><button><Save />Salvar comunicado</button></form><form onSubmit={e => { e.preventDefault(); p.act('/api/notify/telegram', f.telegram, 'Telegram enviado'); }} className="stack"><h3><MessageCircle />Telegram rápido</h3><textarea placeholder="Mensagem" value={f.telegram.message} onChange={e => set('telegram', { message: e.target.value })} /><button><Radio />Enviar Telegram</button></form><form onSubmit={e => { e.preventDefault(); p.act('/api/notify/email', f.email, 'E-mail enviado'); }} className="stack stackWide"><h3><Mail />Enviar e-mail</h3><input placeholder="Destinatário" value={f.email.to} onChange={e => set('email', { to: e.target.value })} /><input placeholder="Assunto" value={f.email.subject} onChange={e => set('email', { subject: e.target.value })} /><textarea placeholder="Mensagem" value={f.email.body} onChange={e => set('email', { body: e.target.value })} /><button><Send />Enviar</button></form></div><Table rows={p.data.notices} render={x => <><td><b>{x.title}</b><small>{x.body}</small></td><td><Status ok={x.priority !== 'critica'}>{x.priority}</Status></td><td>{date(x.created_at)}</td></>} /></Panel>;

  if (p.active === 'ocorrencias') return <Panel title="Ocorrências"><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/incidents', f.incident, 'Ocorrência registrada'); }}><input placeholder="Título" value={f.incident.title} onChange={e => set('incident', { title: e.target.value })} /><input placeholder="Unidade" value={f.incident.unit} onChange={e => set('incident', { unit: e.target.value })} /><select value={f.incident.severity} onChange={e => set('incident', { severity: e.target.value })}><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select><input placeholder="Descrição" value={f.incident.description} onChange={e => set('incident', { description: e.target.value })} /><button><Plus />Registrar</button></form><Table rows={p.data.incidents} render={x => <><td><b>{x.title}</b><small>{x.description || '-'} · Unidade {x.unit || '-'}</small></td><td><Status ok={x.status === 'fechada'}>{x.severity} · {x.status}</Status></td><td>{x.status !== 'fechada' && <button onClick={() => p.act('/api/incidents/' + x.id + '/close', {}, 'Ocorrência fechada')}><CheckCircle2 />Fechar</button>}</td></>} /></Panel>;

  if (p.active === 'manutencao') return <Panel title="Manutenção"><form className="inline" onSubmit={e => { e.preventDefault(); p.act('/api/maintenance', f.maintenance, 'Manutenção criada'); }}><input placeholder="Serviço" value={f.maintenance.title} onChange={e => set('maintenance', { title: e.target.value })} /><input placeholder="Fornecedor" value={f.maintenance.supplier} onChange={e => set('maintenance', { supplier: e.target.value })} /><input type="date" value={f.maintenance.scheduled_for} onChange={e => set('maintenance', { scheduled_for: e.target.value })} /><input type="number" placeholder="Custo previsto" value={f.maintenance.cost} onChange={e => set('maintenance', { cost: e.target.value })} /><button><Plus />Agendar</button></form><Table rows={p.data.maintenance} render={x => <><td><b>{x.title}</b><small>{x.supplier || '-'} · {date(x.scheduled_for)}</small></td><td>{money(Number(x.cost || 0))}</td><td>{x.status !== 'concluida' ? <button onClick={() => p.act('/api/maintenance/' + x.id + '/done', {}, 'Manutenção concluída')}><CheckCircle2 />Concluir</button> : <Status ok>concluída</Status>}</td></>} /></Panel>;

  if (p.active === 'automacoes') return <Panel title="Automações"><div className="automation"><Bot /><h3>Central de regras inteligentes</h3><p>Lembretes de encomendas, alertas de manutenção, emergência integrada e dados de demonstração para testar o sistema sem risco.</p><div className="badges"><span><Sparkles />Atalhos dinâmicos</span><span><Activity />Registro de ações</span><span><Database />Banco preservado</span></div><button onClick={() => p.act('/api/seed-demo', {}, 'Dados de demonstração carregados')}><WandSparkles />Carregar demonstração</button></div></Panel>;

  if (p.active === 'config') return <ConfigPanel {...p} />;

  if (p.active === 'premium') return <Panel title="Central Pro"><div className="premiumBox"><Gem /><h3>Vitória Régia Pro</h3><p>Uma experiência premium com atalhos estilo aplicativo, tema personalizável, menu flexível, emergência, auditoria e integrações reais.</p><div className="badges"><span><Crown />Premium</span><span><Database />PostgreSQL</span><span><Smartphone />Mobile</span><span><ShieldCheck />Seguro</span></div></div></Panel>;

  return <Panel title="Ajuda"><div className="grid two"><section className="stack"><h3><Rocket />Primeiros passos</h3><p>Configure o banco em .env, faça login, ajuste cores e menu em Configurações, depois carregue dados de demonstração em Automações.</p></section><section className="stack"><h3><KeyRound />Login padrão</h3><p>Usuário: admin@vitoriaregia.local<br />Senha: 123456</p></section></div></Panel>;
}

function Dashboard(p) {
  const metrics = p.data.dashboard?.metrics || {};
  const packagePreview = p.data.packages.filter(x => x.status !== 'entregue').slice(0, 4);
  const auditPreview = p.data.audit.slice(0, 5);
  return <>
    <section className="hero proHero"><div><span className="eyebrow"><Sparkles />Sistema Pro</span><h2>Painel inteligente do condomínio</h2><p>Atalhos rápidos, emergência, portaria, encomendas e comunicação em uma única tela com visual de aplicativo premium.</p></div><div className="heroStats"><b>{metrics.residents ?? p.stats.moradores}</b><span>moradores</span><b>{metrics.pendingPackages ?? p.stats.pendentes}</b><span>encomendas pendentes</span><b>{money(metrics.balance ?? p.stats.saldo)}</b><span>saldo previsto</span></div></section>
    <div className="metricStrip"><Metric label="Visitantes" value={p.stats.visitantes} icon={<Users />} /><Metric label="Reservas" value={p.stats.reservas} icon={<CalendarDays />} /><Metric label="Ocorrências" value={p.stats.ocorrencias} icon={<ShieldAlert />} /><Metric label="Manutenções" value={p.stats.manutencoes} icon={<Wrench />} /></div>
    <div className="grid cards">{p.shortcuts.map(([id, t, d, Icon, color]) => <article key={id} onClick={() => p.setActive(id)} className={color}><div><Icon /></div><h3>{t}</h3><p>{d}</p><span>›</span></article>)}</div>
    <section className="command grid two"><div><h3><Activity />Central de comando</h3><p>Próximas ações sugeridas com base no que está pendente.</p><div className="miniList">{packagePreview.length ? packagePreview.map(x => <button key={x.id} onClick={() => p.setActive('encomendas')}><Package /><span><b>{x.tracking}</b><small>{x.recipient} · Unidade {x.unit}</small></span></button>) : <button onClick={() => p.setActive('encomendas')}><CheckCircle2 /><span><b>Sem encomendas pendentes</b><small>Tudo em dia na portaria</small></span></button>}</div></div><div><h3><ClipboardCheck />Atividade recente</h3><div className="miniList auditList">{auditPreview.length ? auditPreview.map(x => <span key={x.id}><b>{x.action}</b><small>{x.actor} · {date(x.created_at)}</small></span>) : <span><b>Sem auditoria ainda</b><small>As ações aparecerão aqui</small></span>}</div></div></section>
    <section className="download"><h3>Atalhos de aplicativo</h3><p>Use o sistema como aplicativo no celular pelo navegador ou instale como PWA.</p><div><AppBtn title="App do Morador" icon={<Users />} /><AppBtn title="App do Síndico" icon={<User />} /><AppBtn title="App da Portaria" icon={<DoorOpen />} /></div></section>
  </>;
}

function ConfigPanel(p) {
  const [settings, setSettings] = useState(() => ({ ...p.data.settings }));
  useEffect(() => setSettings({ ...p.data.settings }), [p.data.settings]);
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  const save = async () => { await request('/api/settings', { method: 'POST', body: JSON.stringify(settings) }); p.setData({ ...p.data, settings }); p.notify('Configurações salvas e aplicadas'); };
  const exportBackup = async () => {
    const payload = await request('/api/export');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup-vitoria-regia-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    p.notify('Backup exportado');
  };
  const palettes = [['Vitória Régia', '#1f8f7a'], ['Esmeralda', '#0f9f6e'], ['Azul executivo', '#2563eb'], ['Roxo premium', '#7c3aed'], ['Dourado discreto', '#b7791f'], ['Grafite', '#475569']];
  return <Panel title="Configurações"><section className="settingsHero"><div><h3><SlidersHorizontal /> Configuração intuitiva</h3><p>Altere aparência, orientação do menu, integrações, segurança e preferências sem mexer no código.</p></div><button onClick={save}><Save />Salvar tudo</button></section><div className="settingsGrid"><section className="settingsCard"><h3><Palette /> Cor do sistema</h3><p>Sugestão: mantenha “Vitória Régia” para um visual elegante e leve.</p><div className="palette">{palettes.map(([name, color]) => <button key={color} className={(settings.THEME_ACCENT || defaultTheme.accent) === color ? 'selected' : ''} onClick={() => set('THEME_ACCENT', color)}><i style={{ background: color }} />{name}</button>)}</div><label>Cor personalizada<input type="color" value={settings.THEME_ACCENT || defaultTheme.accent} onChange={e => set('THEME_ACCENT', e.target.value)} /></label></section><section className="settingsCard"><h3><LayoutPanelTop /> Menu e layout</h3><div className="choice layoutChoice"><button className={(settings.MENU_ORIENTATION || 'vertical') === 'vertical' ? 'selected' : ''} onClick={() => set('MENU_ORIENTATION', 'vertical')}><PanelLeft />Lateral</button><button className={settings.MENU_ORIENTATION === 'horizontal' ? 'selected' : ''} onClick={() => set('MENU_ORIENTATION', 'horizontal')}><LayoutPanelTop />Superior</button><button className={settings.MENU_ORIENTATION === 'floating' ? 'selected' : ''} onClick={() => set('MENU_ORIENTATION', 'floating')}><Paintbrush />Flutuante</button></div><label>Densidade<select value={settings.UI_DENSITY || 'comfort'} onChange={e => set('UI_DENSITY', e.target.value)}><option value="comfort">Confortável</option><option value="compact">Compacta</option></select></label><div className="choice"><button className={(settings.APPEARANCE || 'light') === 'light' ? 'selected' : ''} onClick={() => set('APPEARANCE', 'light')}><Sun />Claro</button><button className={settings.APPEARANCE === 'dark' ? 'selected' : ''} onClick={() => set('APPEARANCE', 'dark')}><Moon />Escuro</button></div></section><section className="settingsCard"><h3><MessageCircle /> Telegram</h3><input placeholder="TELEGRAM_BOT_TOKEN" value={settings.TELEGRAM_BOT_TOKEN || ''} onChange={e => set('TELEGRAM_BOT_TOKEN', e.target.value)} /><input placeholder="TELEGRAM_CHAT_ID" value={settings.TELEGRAM_CHAT_ID || ''} onChange={e => set('TELEGRAM_CHAT_ID', e.target.value)} /><small>Usado para comunicados e botão de emergência.</small></section><section className="settingsCard"><h3><Mail /> E-mail SMTP</h3><input placeholder="SMTP_HOST" value={settings.SMTP_HOST || ''} onChange={e => set('SMTP_HOST', e.target.value)} /><input placeholder="SMTP_PORT" value={settings.SMTP_PORT || '587'} onChange={e => set('SMTP_PORT', e.target.value)} /><input placeholder="SMTP_USER" value={settings.SMTP_USER || ''} onChange={e => set('SMTP_USER', e.target.value)} /><input placeholder="SMTP_PASS" type="password" value={settings.SMTP_PASS || ''} onChange={e => set('SMTP_PASS', e.target.value)} /><input placeholder="MAIL_FROM" value={settings.MAIL_FROM || ''} onChange={e => set('MAIL_FROM', e.target.value)} /></section><section className="settingsCard"><h3><CloudSun /> Clima e condomínio</h3><input placeholder="Cidade do clima" value={settings.WEATHER_CITY || 'João Pessoa'} onChange={e => set('WEATHER_CITY', e.target.value)} /><input placeholder="Nome do condomínio" value={settings.CONDO_NAME || 'Condomínio Vitória Régia'} onChange={e => set('CONDO_NAME', e.target.value)} /><input placeholder="Telefone emergência" value={settings.EMERGENCY_PHONE || ''} onChange={e => set('EMERGENCY_PHONE', e.target.value)} /></section><section className="settingsCard"><h3><ShieldCheck /> Segurança</h3><label><input type="checkbox" checked={(settings.ONLY_LOGIN_DASHBOARD || 'true') === 'true'} onChange={e => set('ONLY_LOGIN_DASHBOARD', String(e.target.checked))} /> Proteger dashboard antes do login</label><label><input type="checkbox" checked={(settings.EMERGENCY_CONFIRM || 'true') === 'true'} onChange={e => set('EMERGENCY_CONFIRM', String(e.target.checked))} /> Confirmar antes de acionar emergência</label><small>O sistema inicia exibindo somente a tela de login.</small></section><section className="settingsCard"><h3><Database /> Banco e backup</h3><p>O sistema usa o banco anterior sem apagar dados. Novas tabelas são criadas automaticamente quando necessário.</p><button onClick={exportBackup}><Download />Exportar backup JSON</button><button onClick={() => p.act('/api/seed-demo', {}, 'Dados de demonstração carregados')}><Archive />Carregar demonstração</button></section><section className="settingsCard"><h3><MonitorSmartphone /> Experiência</h3><input placeholder="Nome curto do app" value={settings.APP_SHORT_NAME || 'Vitória Régia'} onChange={e => set('APP_SHORT_NAME', e.target.value)} /><select value={settings.FOOTER_MODE || 'minimal'} onChange={e => set('FOOTER_MODE', e.target.value)}><option value="minimal">Rodapé minimalista</option><option value="hidden">Ocultar informações extras</option></select><small>O rodapé permanece simples, sem nota de versão extensa.</small></section></div></Panel>;
}

function Panel({ title, children }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Table({ rows, render }) { return <table><tbody>{rows.length ? rows.map(x => <tr key={x.id}>{render(x)}</tr>) : <tr><td>Nenhum registro encontrado.</td></tr>}</tbody></table>; }
function Status({ ok, children }) { return <span className={ok ? 'status ok' : 'status'}>{children}</span>; }
function AppBtn({ title, icon }) { return <button className="appBtn">{icon}<span>{title}</span><Smartphone /></button>; }
function Metric({ label, value, icon }) { return <article className="metric">{icon}<div><b>{value}</b><span>{label}</span></div></article>; }
function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function date(v) { return v ? new Date(v).toLocaleDateString('pt-BR') : '-'; }

createRoot(document.getElementById('root')).render(<App />);
