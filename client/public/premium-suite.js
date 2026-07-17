(() => {
  'use strict';

  const SUITE_VERSION = '1.0.0';
  const STORAGE_PREFIX = 'vr_suite_';
  const QUEUE_KEY = `${STORAGE_PREFIX}offline_queue`;
  const DEMO_KEY = `${STORAGE_PREFIX}demo_mode`;
  const SHARED_KEYS = {
    governance: 'PREMIUM_GOVERNANCE_JSON',
    services: 'PREMIUM_SERVICES_JSON',
    integrations: 'PREMIUM_INTEGRATIONS_JSON'
  };

  const state = {
    open: false,
    tab: 'executivo',
    loading: false,
    demo: localStorage.getItem(DEMO_KEY) === 'true',
    data: {},
    installPrompt: null,
    toastTimer: null,
    generatedInvite: null,
    reconciliation: [],
    currentUser: readUser()
  };

  const endpointMap = {
    dashboard: '/api/dashboard',
    packages: '/api/packages',
    visitors: '/api/visitors',
    reservations: '/api/reservations',
    finance: '/api/finance',
    boletos: '/api/boletos',
    notices: '/api/notices',
    maintenance: '/api/maintenance',
    audit: '/api/audit',
    occurrences: '/api/occurrence-book',
    documents: '/api/documents',
    residents: '/api/residents',
    employees: '/api/employees',
    settings: '/api/settings'
  };

  const demoData = {
    dashboard: { residents: 126, packages_pending: 7, visitors_today: 9, reservations_upcoming: 4 },
    residents: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: ['Ana Martins','Carlos Souza','Mariana Lima','Rafael Alves'][i % 4], unit: `${Math.floor(i / 3) + 1}0${(i % 3) + 1}` })),
    packages: [
      { id: 9101, recipient: 'Ana Martins', unit: '501', status: 'pendente', carrier: 'Mercado Livre', tracking: 'VR-DEMO-001', created_at: new Date(Date.now() - 2.4 * 86400000).toISOString() },
      { id: 9102, recipient: 'Carlos Souza', unit: '803', status: 'pendente', carrier: 'Amazon', tracking: 'VR-DEMO-002', created_at: new Date(Date.now() - 1.1 * 86400000).toISOString() },
      { id: 9103, recipient: 'Mariana Lima', unit: '1102', status: 'entregue', carrier: 'Correios', tracking: 'VR-DEMO-003', created_at: new Date(Date.now() - 4 * 86400000).toISOString(), delivered_at: new Date(Date.now() - 3.5 * 86400000).toISOString() }
    ],
    visitors: [
      { id: 9201, name: 'João Ferreira', unit: '501', status: 'autorizado', valid_from: isoToday(), valid_until: isoToday(), created_at: new Date().toISOString() },
      { id: 9202, name: 'Equipe Ar Condicionado', unit: '1002', status: 'autorizado', recurring: true, valid_from: isoToday(), valid_until: addDays(isoToday(), 30), created_at: new Date().toISOString() }
    ],
    reservations: [
      { id: 9301, area: 'Salão de festas', unit: '901', resident: 'Mariana Lima', reserved_for: addDays(isoToday(), 2), status: 'confirmada', start_time: '19:00', end_time: '23:00' },
      { id: 9302, area: 'Churrasqueira', unit: '301', resident: 'Rafael Alves', reserved_for: addDays(isoToday(), 6), status: 'pre_agendada', start_time: '12:00', end_time: '17:00' }
    ],
    maintenance: [
      { id: 9401, title: 'Revisão preventiva dos elevadores', supplier: 'Elevadores Brasília', scheduled_for: addDays(isoToday(), 3), status: 'planejada', cost: 1250, notes: 'Manutenção trimestral.' },
      { id: 9402, title: 'Teste das bombas de incêndio', supplier: 'SafeFire', scheduled_for: addDays(isoToday(), 12), status: 'planejada', cost: 480, notes: 'Checklist e laudo.' },
      { id: 9403, title: 'Limpeza da caixa d’água', supplier: 'Água Limpa', scheduled_for: addDays(isoToday(), -4), status: 'pendente', cost: 890, notes: 'Aguardando confirmação.' }
    ],
    occurrences: [
      { id: 9501, title: 'Lâmpada queimada no 7º andar', description: 'Corredor próximo ao elevador social.', unit: 'Área comum', category: 'manutencao', priority: 'normal', status: 'aberta', created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 9502, title: 'Objeto encontrado na garagem', description: 'Chaveiro preto entregue à portaria.', unit: 'Garagem', category: 'achados', priority: 'normal', status: 'aberta', created_at: new Date().toISOString() }
    ],
    audit: [
      { id: 9601, actor: 'sindico@vitoriaregia.local', action: 'aprovou reserva', entity: 'Salão de festas - unidade 901', created_at: new Date().toISOString() },
      { id: 9602, actor: 'portaria@vitoriaregia.local', action: 'registrou encomenda', entity: 'VR-DEMO-002', created_at: new Date(Date.now() - 3600000).toISOString() }
    ],
    notices: [
      { id: 9701, title: 'Limpeza da caixa d’água', body: 'Interrupção prevista entre 8h e 11h.', priority: 'alta', created_at: new Date().toISOString() },
      { id: 9702, title: 'Assembleia extraordinária', body: 'Reunião na próxima quarta-feira.', priority: 'normal', created_at: new Date().toISOString() }
    ],
    finance: [
      { id: 9801, title: 'Cota condominial', type: 'receita', amount: 42800, status: 'pago', due_date: isoToday(), category: 'condominio' },
      { id: 9802, title: 'Manutenção elevadores', type: 'despesa', amount: 6200, status: 'pago', due_date: isoToday(), category: 'manutencao' },
      { id: 9803, title: 'Energia áreas comuns', type: 'despesa', amount: 4950, status: 'pendente', due_date: addDays(isoToday(), 4), category: 'energia' }
    ],
    boletos: [], documents: [], employees: [], settings: {}
  };

  function readUser() {
    try { return JSON.parse(localStorage.getItem('vr_user') || 'null'); } catch { return null; }
  }

  function isoToday() { return new Date().toISOString().slice(0, 10); }
  function addDays(dateValue, days) {
    const d = new Date(`${dateValue}T12:00:00`);
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }
  function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
  function dateBR(value, withTime = false) {
    if (!value) return '—';
    const d = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(d.getTime())) return String(value);
    return withTime ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
  }
  function daysUntil(value) {
    if (!value) return null;
    const target = new Date(`${String(value).slice(0,10)}T12:00:00`).getTime();
    const today = new Date(`${isoToday()}T12:00:00`).getTime();
    return Math.ceil((target - today) / 86400000);
  }
  function randomCode(prefix = 'VR') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let value = `${prefix}-`;
    for (let i = 0; i < 7; i += 1) value += chars[Math.floor(Math.random() * chars.length)];
    return value;
  }
  function isAdmin() { return ['master','admin','sindico','subsindico'].includes(String(state.currentUser?.role || '').toLowerCase()); }
  function token() { return localStorage.getItem('vr_token') || ''; }

  function toast(message, type = 'ok') {
    let node = document.getElementById('vr-suite-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'vr-suite-toast';
      document.body.appendChild(node);
    }
    node.className = `vr-suite-toast ${type}`;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
  }

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  }
  function writeQueue(queue) { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
  function queueMutation(path, options) {
    const queue = readQueue();
    queue.push({ id: randomCode('OFF'), path, options, createdAt: new Date().toISOString(), attempts: 0 });
    writeQueue(queue);
    toast('Sem conexão: registro salvo na fila offline.', 'warn');
    render();
    return { queued: true };
  }

  async function api(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const mutating = !['GET','HEAD'].includes(method);
    if (!navigator.onLine && mutating && options.queue !== false) return queueMutation(path, options);
    const headers = { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type':'application/json' } : {}), ...(token() ? { Authorization:`Bearer ${token()}` } : {}), ...(options.headers || {}) };
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw:text }; }
    if (!response.ok) {
      const error = new Error(body.error || body.message || `Erro ${response.status}`);
      error.status = response.status;
      if (mutating && options.queue !== false && (!navigator.onLine || response.status >= 500)) return queueMutation(path, options);
      throw error;
    }
    return body;
  }

  async function flushQueue() {
    if (!navigator.onLine) return;
    const queue = readQueue();
    if (!queue.length) return;
    const pending = [];
    let sent = 0;
    for (const item of queue) {
      try {
        await api(item.path, { ...item.options, queue:false });
        sent += 1;
      } catch {
        pending.push({ ...item, attempts:Number(item.attempts || 0) + 1 });
      }
    }
    writeQueue(pending);
    if (sent) toast(`${sent} registro(s) offline sincronizado(s).`);
    if (state.open) { await loadData(); render(); }
  }

  async function loadData(force = false) {
    if (state.loading) return;
    state.loading = true;
    if (state.demo && !force) {
      state.data = structuredCloneSafe(demoData);
      state.loading = false;
      return;
    }
    const entries = Object.entries(endpointMap);
    const results = await Promise.all(entries.map(async ([key, path]) => {
      try { return [key, await api(path)]; } catch { return [key, key === 'dashboard' ? null : (key === 'settings' ? {} : [])]; }
    }));
    state.data = Object.fromEntries(results);
    state.loading = false;
  }

  function structuredCloneSafe(value) {
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  }

  function dataset(key) {
    const value = state.data?.[key];
    if (Array.isArray(value)) return value;
    return value || (key === 'settings' ? {} : []);
  }

  function pendingPackages() { return dataset('packages').filter(p => !/entregue|retirad|finaliz|removid/i.test(String(p.status || 'pendente'))); }
  function todayVisitors() {
    const today = isoToday();
    return dataset('visitors').filter(v => {
      if (/remov|negad|cancel/i.test(String(v.status || ''))) return false;
      const from = String(v.valid_from || v.created_at || today).slice(0,10);
      const until = String(v.valid_until || v.valid_from || today).slice(0,10);
      return from <= today && until >= today;
    });
  }
  function upcomingReservations() {
    const today = isoToday();
    return dataset('reservations').filter(r => String(r.reserved_for || '').slice(0,10) >= today && !/cancel|remov/i.test(String(r.status || '')));
  }
  function openOccurrences() { return dataset('occurrences').filter(o => !/fech|conclu|resolvid|cancel/i.test(String(o.status || 'aberta'))); }
  function upcomingMaintenance() { return dataset('maintenance').filter(m => !/conclu|realiz|cancel/i.test(String(m.status || ''))); }
  function financeTotals() {
    const rows = dataset('finance').filter(r => !/remov/i.test(String(r.status || '')));
    const revenue = rows.filter(r => String(r.type || 'receita') === 'receita').reduce((a,r) => a + Number(r.amount || 0), 0);
    const expense = rows.filter(r => String(r.type || '') === 'despesa').reduce((a,r) => a + Number(r.amount || 0), 0);
    const pending = rows.filter(r => !/pago|quitad/i.test(String(r.status || 'pendente'))).reduce((a,r) => a + Number(r.amount || 0), 0);
    return { revenue, expense, balance:revenue-expense, pending };
  }
  function averagePackageHours() {
    const finished = dataset('packages').filter(p => p.created_at && (p.delivered_at || p.resident_delivered_at || p.staff_delivered_at));
    if (!finished.length) return null;
    const total = finished.reduce((sum,p) => {
      const end = p.delivered_at || p.resident_delivered_at || p.staff_delivered_at;
      return sum + Math.max(0, new Date(end) - new Date(p.created_at));
    }, 0);
    return total / finished.length / 3600000;
  }

  function metricCard(icon, label, value, note, tone = '') {
    return `<article class="vr-suite-metric ${tone}"><span>${icon}</span><div><b>${esc(value)}</b><small>${esc(label)}</small><em>${esc(note || '')}</em></div></article>`;
  }
  function statusPill(text, tone = '') { return `<span class="vr-suite-pill ${tone}">${esc(text)}</span>`; }
  function emptyState(title, note) { return `<div class="vr-suite-empty"><b>${esc(title)}</b><small>${esc(note)}</small></div>`; }

  const tabs = [
    ['executivo','Visão executiva','▦'],
    ['demonstracao','Demonstração','▶'],
    ['resultados','Resultados','↗'],
    ['convites','Convites QR','⌁'],
    ['manutencao','Manutenção','⚙'],
    ['livro','Livro digital','▤'],
    ['auditoria','Auditoria','◎'],
    ['governanca','Governança','⚖'],
    ['servicos','Serviços','◇'],
    ['financeiro','Conselho e PIX','R$'],
    ['comercial','Planos e proposta','★']
  ];

  function ensureShell() {
    if (document.getElementById('vr-premium-suite-root')) return;
    const root = document.createElement('div');
    root.id = 'vr-premium-suite-root';
    root.hidden = true;
    root.innerHTML = `<div class="vr-suite-backdrop" data-suite-close></div><section class="vr-suite-shell" role="dialog" aria-modal="true" aria-label="Suite Premium Vitória Régia"><header class="vr-suite-header"><div><span class="vr-suite-kicker">Vitória Régia Pro</span><h2>Suite Premium 2026</h2><small>Gestão, segurança, resultados e comercialização em uma única central.</small></div><div class="vr-suite-header-actions"><span id="vr-suite-connectivity"></span><button type="button" class="vr-suite-icon-button" data-suite-refresh title="Atualizar">↻</button><button type="button" class="vr-suite-icon-button" data-suite-close title="Fechar">×</button></div></header><div class="vr-suite-layout"><nav id="vr-suite-nav"></nav><main id="vr-suite-content" tabindex="-1"></main></div></section>`;
    document.body.appendChild(root);
    root.addEventListener('click', handleClick);
    root.addEventListener('submit', handleSubmit);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.open) closeSuite(); });
  }

  function ensureLauncher() {
    if (document.getElementById('vr-premium-suite-launcher')) return;
    const button = document.createElement('button');
    button.id = 'vr-premium-suite-launcher';
    button.type = 'button';
    button.innerHTML = '<span>★</span><b>Suite Premium</b><small>Apresentação e gestão</small>';
    button.addEventListener('click', openSuite);
    document.body.appendChild(button);
  }

  async function openSuite(tab = state.tab) {
    ensureShell();
    state.open = true;
    state.tab = tab;
    const root = document.getElementById('vr-premium-suite-root');
    root.hidden = false;
    document.body.classList.add('vr-suite-open');
    render(true);
    await loadData();
    render();
    document.getElementById('vr-suite-content')?.focus();
  }
  function closeSuite() {
    state.open = false;
    document.getElementById('vr-premium-suite-root')?.setAttribute('hidden','');
    document.body.classList.remove('vr-suite-open');
  }

  function render(loading = false) {
    if (!state.open) return;
    const root = document.getElementById('vr-premium-suite-root');
    if (!root) return;
    const nav = root.querySelector('#vr-suite-nav');
    const content = root.querySelector('#vr-suite-content');
    const connectivity = root.querySelector('#vr-suite-connectivity');
    if (connectivity) connectivity.innerHTML = `${statusPill(navigator.onLine ? 'Online' : 'Offline', navigator.onLine ? 'ok' : 'warn')} ${readQueue().length ? statusPill(`${readQueue().length} na fila`, 'warn') : ''}`;
    nav.innerHTML = `<div class="vr-suite-mode-card"><span>${state.demo ? 'DEMO' : 'REAL'}</span><b>${state.demo ? 'Dados demonstrativos' : 'Dados do condomínio'}</b><small>${state.demo ? 'Nenhuma alteração no banco.' : 'Informações atuais do sistema.'}</small></div>${tabs.map(([key,label,icon]) => `<button type="button" data-suite-tab="${key}" class="${state.tab === key ? 'active' : ''}"><i>${icon}</i><span>${label}</span></button>`).join('')}<div class="vr-suite-nav-footer"><small>Suite ${SUITE_VERSION}</small><button type="button" data-suite-install>Instalar aplicativo</button></div>`;
    if (loading || state.loading) {
      content.innerHTML = `<div class="vr-suite-loading"><span></span><b>Preparando a central premium…</b><small>Carregando os módulos disponíveis para este perfil.</small></div>`;
      return;
    }
    const renderers = {
      executivo: renderExecutive,
      demonstracao: renderDemo,
      resultados: renderResults,
      convites: renderInvites,
      manutencao: renderMaintenance,
      livro: renderOccurrenceBook,
      auditoria: renderAudit,
      governanca: renderGovernance,
      servicos: renderServices,
      financeiro: renderFinanceCouncil,
      comercial: renderCommercial
    };
    content.innerHTML = (renderers[state.tab] || renderExecutive)();
  }

  function pageHeader(kicker, title, description, actions = '') {
    return `<div class="vr-suite-page-head"><div><span>${esc(kicker)}</span><h3>${esc(title)}</h3><p>${esc(description)}</p></div><div class="vr-suite-page-actions">${actions}</div></div>`;
  }

  function renderExecutive() {
    const f = financeTotals();
    const due = upcomingMaintenance().filter(m => { const d = daysUntil(m.scheduled_for); return d !== null && d <= 30; });
    const recentAudit = dataset('audit').slice(0, 6);
    const nextReservations = upcomingReservations().sort((a,b) => String(a.reserved_for).localeCompare(String(b.reserved_for))).slice(0,5);
    return `${pageHeader('Central do condomínio','Visão executiva','As informações mais importantes para síndico, portaria e conselho, sem excesso de telas.', `<button class="vr-suite-primary" data-suite-demo-toggle>${state.demo ? 'Usar dados reais' : 'Ativar demonstração'}</button>`)}
      <div class="vr-suite-hero"><div><span class="vr-suite-kicker">${esc(state.data?.settings?.CONDO_NAME || 'Condomínio Vitória Régia')}</span><h4>Operação sob controle, comunicação rápida e decisões baseadas em dados.</h4><p>${state.demo ? 'Você está vendo um cenário completo preparado para apresentação.' : 'Indicadores consolidados com base nos registros disponíveis no sistema.'}</p></div><div class="vr-suite-score"><small>Índice operacional</small><b>${operationalScore()}%</b><span>${operationalScore() >= 80 ? 'Excelente' : operationalScore() >= 60 ? 'Bom' : 'Requer atenção'}</span></div></div>
      <div class="vr-suite-metrics">${metricCard('▣','Encomendas pendentes',pendingPackages().length,'Aguardando decisão ou retirada',pendingPackages().length > 8 ? 'warn' : '')}${metricCard('♙','Visitantes hoje',todayVisitors().length,'Autorizações válidas para hoje')}${metricCard('▦','Reservas futuras',upcomingReservations().length,'Áreas comuns programadas')}${metricCard('⚙','Manutenções próximas',due.length,'Nos próximos 30 dias',due.some(m => daysUntil(m.scheduled_for) < 0) ? 'danger' : '')}${metricCard('!','Ocorrências abertas',openOccurrences().length,'Pendências do livro digital',openOccurrences().length > 5 ? 'warn' : '')}${metricCard('R$','Saldo previsto',money(f.balance),`Pendências: ${money(f.pending)}`,f.balance < 0 ? 'danger' : 'ok')}</div>
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Agenda</span><h4>Próximos compromissos</h4></div><button data-suite-tab="manutencao">Ver manutenção</button></header>${nextReservations.length ? nextReservations.map(r => `<article class="vr-suite-row"><span class="vr-suite-date-badge"><b>${esc(String(r.reserved_for || '').slice(8,10))}</b><small>${dateBR(r.reserved_for).slice(3,5)}</small></span><div><b>${esc(r.area || 'Área comum')}</b><small>Unidade ${esc(r.unit || '—')} · ${esc(r.start_time || '')}${r.end_time ? `–${esc(r.end_time)}` : ''}</small></div>${statusPill(r.status || 'agendada', /confirm/i.test(r.status || '') ? 'ok' : 'warn')}</article>`).join('') : emptyState('Agenda livre','As próximas reservas aparecerão aqui.')}</section>
      <section class="vr-suite-card"><header><div><span>Rastreabilidade</span><h4>Atividade recente</h4></div><button data-suite-tab="auditoria">Abrir auditoria</button></header>${recentAudit.length ? recentAudit.map(a => `<article class="vr-suite-timeline"><i></i><div><b>${esc(a.action || 'Ação registrada')}</b><small>${esc(a.actor || 'sistema')} · ${dateBR(a.created_at, true)}</small><em>${esc(a.entity || '')}</em></div></article>`).join('') : emptyState('Sem ações recentes','Os registros de auditoria aparecerão aqui.')}</section></div>
      <div class="vr-suite-quick-actions"><button data-suite-route="#/portaria/encomendas"><span>▣</span><b>Registrar encomenda</b><small>Fluxo de maior impacto operacional</small></button><button data-suite-tab="convites"><span>⌁</span><b>Gerar convite QR</b><small>Visitante autorizado em segundos</small></button><button data-suite-tab="livro"><span>▤</span><b>Livro da portaria</b><small>Turnos e ocorrências organizados</small></button><button data-suite-tab="comercial"><span>★</span><b>Gerar proposta</b><small>Planos, valores e impressão</small></button></div>`;
  }

  function operationalScore() {
    let score = 100;
    score -= Math.min(20, pendingPackages().filter(p => (Date.now() - new Date(p.created_at || Date.now())) > 3 * 86400000).length * 4);
    score -= Math.min(20, upcomingMaintenance().filter(m => daysUntil(m.scheduled_for) < 0).length * 8);
    score -= Math.min(20, openOccurrences().filter(o => /alta|urgente|critica/i.test(String(o.priority || ''))).length * 6);
    if (financeTotals().balance < 0) score -= 15;
    return Math.max(25, Math.round(score));
  }

  function renderDemo() {
    return `${pageHeader('Apresentação','Modo demonstração guiada','Apresente jornadas reais sem depender de dados pessoais nem alterar o banco.', `<button class="vr-suite-primary" data-suite-demo-toggle>${state.demo ? 'Encerrar demonstração' : 'Ativar demonstração'}</button>`)}
      <div class="vr-suite-demo-banner ${state.demo ? 'active' : ''}"><div><span>${state.demo ? 'ATIVO' : 'PRONTO'}</span><h4>${state.demo ? 'Cenário demonstrativo carregado' : 'Prepare o sistema para a apresentação'}</h4><p>${state.demo ? 'Todos os indicadores desta central usam dados fictícios claramente identificados.' : 'O modo demonstração simula um condomínio ativo sem gravar registros reais.'}</p></div><b>${state.demo ? '100%' : '0%'}</b></div>
      <div class="vr-suite-grid three">${demoJourney('1','Encomenda inteligente','Portaria registra etiqueta, sistema identifica a unidade, morador recebe aviso e decide como retirar.','#/portaria/encomendas')}${demoJourney('2','Visitante com QR','Morador gera convite, portaria valida o código e o acesso fica registrado.','suite:convites')}${demoJourney('3','Reserva completa','Escolha da área, aceite das regras, cobrança e confirmação no calendário.','#/reservas/calendario')}${demoJourney('4','Manutenção preventiva','Equipamentos, vencimentos, fornecedores, custos e alertas em uma agenda única.','suite:manutencao')}${demoJourney('5','Emergência rastreável','Solicitação, alerta à portaria, aprovação e registro de auditoria.','#/emergencia')}${demoJourney('6','Prestação de contas','Receitas, despesas, balancetes e visão do conselho fiscal.','suite:financeiro')}</div>
      <section class="vr-suite-card"><header><div><span>Roteiro sugerido</span><h4>Apresentação de 8 minutos</h4></div><button data-suite-print-demo>Imprimir roteiro</button></header><ol class="vr-suite-script"><li><b>30 segundos:</b> explique que o sistema centraliza gestão, comunicação e segurança.</li><li><b>2 minutos:</b> demonstre uma encomenda do registro à retirada.</li><li><b>1 minuto:</b> gere um convite de visitante com QR Code.</li><li><b>1 minuto:</b> mostre reservas e calendário.</li><li><b>1 minuto:</b> abra manutenção preventiva e livro digital.</li><li><b>1 minuto:</b> apresente auditoria e painel do conselho.</li><li><b>90 segundos:</b> finalize com resultados, valores e proposta piloto.</li></ol></section>`;
  }

  function demoJourney(number, title, text, target) {
    const attr = String(target).startsWith('suite:') ? `data-suite-tab="${target.split(':')[1]}"` : `data-suite-route="${target}"`;
    return `<article class="vr-suite-journey"><span>${number}</span><h4>${esc(title)}</h4><p>${esc(text)}</p><button ${attr}>Demonstrar</button></article>`;
  }

  function renderResults() {
    const avg = averagePackageHours();
    const delivered = dataset('packages').filter(p => /entregue|retirad|finaliz/i.test(String(p.status || ''))).length;
    const resolved = dataset('occurrences').filter(o => /fech|conclu|resolvid/i.test(String(o.status || ''))).length;
    const totalOccurrences = dataset('occurrences').length;
    const maintenanceDone = dataset('maintenance').filter(m => /conclu|realiz/i.test(String(m.status || ''))).length;
    const f = financeTotals();
    const indicators = [
      ['Tempo médio de retirada', avg === null ? 'Sem histórico' : `${avg.toFixed(1)} horas`, avg === null ? 0 : Math.max(12, 100 - avg)],
      ['Encomendas concluídas', String(delivered), Math.min(100, delivered * 8)],
      ['Ocorrências resolvidas', totalOccurrences ? `${Math.round(resolved / totalOccurrences * 100)}%` : 'Sem histórico', totalOccurrences ? resolved / totalOccurrences * 100 : 0],
      ['Manutenções realizadas', String(maintenanceDone), Math.min(100, maintenanceDone * 15)],
      ['Equilíbrio financeiro', money(f.balance), f.revenue ? Math.max(0, Math.min(100, f.balance / f.revenue * 100 + 50)) : 0]
    ];
    return `${pageHeader('Indicadores','Resultados para o condomínio','Métricas claras para demonstrar eficiência, transparência e retorno do investimento.', `<button data-suite-export-results>Exportar resumo</button>`)}
      <div class="vr-suite-result-score"><div><span>Índice operacional consolidado</span><b>${operationalScore()}</b><small>de 100 pontos</small></div><p>O índice combina encomendas antigas, manutenções vencidas, ocorrências prioritárias e situação financeira.</p></div>
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Eficiência</span><h4>Indicadores operacionais</h4></div></header>${indicators.map(([label,value,percent]) => `<div class="vr-suite-progress"><div><b>${esc(label)}</b><span>${esc(value)}</span></div><i><em style="width:${Math.max(3, Math.min(100, Number(percent || 0)))}%"></em></i></div>`).join('')}</section>
      <section class="vr-suite-card"><header><div><span>Benefícios</span><h4>Valor percebido</h4></div></header><div class="vr-suite-benefits"><article><b>Menos papel</b><small>Registros, documentos e ocorrências digitais.</small></article><article><b>Mais segurança</b><small>Histórico de ações, visitantes e emergências.</small></article><article><b>Mais agilidade</b><small>Portaria e moradores conectados em tempo real.</small></article><article><b>Mais transparência</b><small>Financeiro, auditoria e manutenção visíveis.</small></article></div></section></div>
      <section class="vr-suite-card"><header><div><span>Metas sugeridas</span><h4>Primeiros 90 dias</h4></div></header><div class="vr-suite-goals"><article><b>95%</b><span>das encomendas registradas digitalmente</span></article><article><b>80%</b><span>dos visitantes pré-autorizados</span></article><article><b>100%</b><span>das manutenções críticas com alerta</span></article><article><b>70%</b><span>dos moradores ativos no aplicativo</span></article><article><b>24 h</b><span>como meta média de retirada</span></article></div></section>`;
  }

  function renderInvites() {
    const recent = dataset('visitors').slice(0,8);
    const invite = state.generatedInvite;
    return `${pageHeader('Acesso inteligente','Convites de visitante com QR Code','Gere autorização com validade, código de contingência e registro na portaria.', `<button data-suite-route="#/portaria/visitantes">Abrir visitantes</button>`)}
      <div class="vr-suite-grid invite-grid"><section class="vr-suite-card"><header><div><span>Novo convite</span><h4>Dados do visitante</h4></div></header><form class="vr-suite-form" data-form="visitor"><label>Nome do visitante *<input name="name" required placeholder="Nome completo"></label><label>Unidade *<input name="unit" required value="${esc(state.currentUser?.unit || '')}" placeholder="Ex.: 501"></label><label>Documento<input name="document" placeholder="CPF, RG ou passaporte"></label><label>Telefone<input name="phone" placeholder="DDD + número"></label><label>Placa<input name="plate" placeholder="ABC1D23"></label><label>Válido a partir de<input type="date" name="valid_from" value="${isoToday()}"></label><label>Válido até<input type="date" name="valid_until" value="${isoToday()}"></label><label class="full">Observações<textarea name="notes" placeholder="Empresa, motivo ou instruções para a portaria"></textarea></label><button class="vr-suite-primary full">Gerar convite e registrar</button></form></section>
      <section class="vr-suite-card vr-suite-invite-preview"><header><div><span>Credencial digital</span><h4>Prévia do convite</h4></div></header>${invite ? `<div class="vr-suite-pass" id="vr-suite-pass"><img src="${esc(invite.qr || '')}" alt="QR Code do convite"><span>CONVITE VÁLIDO</span><h4>${esc(invite.name)}</h4><p>Unidade ${esc(invite.unit)} · válido até ${dateBR(invite.valid_until)}</p><b>${esc(invite.code)}</b><small>Apresente o QR Code ou informe o código na portaria.</small></div><div class="vr-suite-inline-actions"><button data-suite-print-invite>Imprimir</button><button data-suite-copy="${esc(invite.url)}">Copiar link</button></div>` : emptyState('Nenhum convite gerado','Preencha o formulário para criar a credencial.')}</section></div>
      <section class="vr-suite-card"><header><div><span>Autorizações</span><h4>Visitantes recentes</h4></div></header>${recent.length ? `<div class="vr-suite-table">${recent.map(v => `<article><div><b>${esc(v.name || 'Visitante')}</b><small>Unidade ${esc(v.unit || '—')} · ${dateBR(v.valid_until || v.created_at)}</small></div>${statusPill(v.status || 'autorizado', /autoriz|liberad/i.test(String(v.status || '')) ? 'ok' : 'warn')}</article>`).join('')}</div>` : emptyState('Sem visitantes','As autorizações aparecerão aqui.')}</section>`;
  }

  function renderMaintenance() {
    const rows = upcomingMaintenance().sort((a,b) => String(a.scheduled_for || '').localeCompare(String(b.scheduled_for || '')));
    const overdue = rows.filter(m => daysUntil(m.scheduled_for) < 0);
    const next30 = rows.filter(m => { const d = daysUntil(m.scheduled_for); return d !== null && d >= 0 && d <= 30; });
    const totalCost = rows.reduce((sum,m) => sum + Number(m.cost || 0), 0);
    return `${pageHeader('Prevenção','Manutenção preventiva','Controle elevadores, bombas, extintores, portões, seguros, contratos e demais vencimentos.', `<button data-suite-route="#/configuracoes">Configurações</button>`)}
      <div class="vr-suite-metrics compact">${metricCard('!','Vencidas',overdue.length,'Exigem providência',overdue.length ? 'danger' : 'ok')}${metricCard('30','Próximos 30 dias',next30.length,'Agenda preventiva')}${metricCard('R$','Custo previsto',money(totalCost),'Itens ainda abertos')}</div>
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Novo item</span><h4>Agendar manutenção</h4></div></header><form class="vr-suite-form" data-form="maintenance"><label>Título *<input required name="title" placeholder="Ex.: Revisão dos elevadores"></label><label>Fornecedor<input name="supplier" placeholder="Empresa responsável"></label><label>Data programada *<input required type="date" name="scheduled_for" value="${addDays(isoToday(),7)}"></label><label>Custo previsto<input type="number" step="0.01" name="cost" placeholder="0,00"></label><label class="full">Observações<textarea name="notes" placeholder="Checklist, contrato, equipamento e responsável"></textarea></label><button class="vr-suite-primary full">Salvar manutenção</button></form></section>
      <section class="vr-suite-card"><header><div><span>Checklist padrão</span><h4>Itens recomendados</h4></div></header><div class="vr-suite-checklist">${['Elevadores e casa de máquinas','Bombas e reservatórios','Extintores, hidrantes e alarme','Portões, interfones e controle de acesso','Caixa d’água e qualidade da água','Seguro obrigatório do condomínio','Dedetização e limpeza técnica','Contratos, laudos e licenças'].map(i => `<label><input type="checkbox">${i}</label>`).join('')}</div></section></div>
      <section class="vr-suite-card"><header><div><span>Agenda</span><h4>Manutenções cadastradas</h4></div></header>${rows.length ? `<div class="vr-suite-maintenance-list">${rows.map(m => { const d = daysUntil(m.scheduled_for); const tone = d < 0 ? 'danger' : d <= 7 ? 'warn' : 'ok'; return `<article><span class="vr-suite-date-badge"><b>${esc(String(m.scheduled_for || '').slice(8,10) || '—')}</b><small>${dateBR(m.scheduled_for).slice(3,5)}</small></span><div><b>${esc(m.title || 'Manutenção')}</b><small>${esc(m.supplier || 'Fornecedor não informado')} · ${money(m.cost)}</small><em>${esc(m.notes || '')}</em></div>${statusPill(d < 0 ? `${Math.abs(d)} dia(s) vencida` : d === 0 ? 'Hoje' : `Em ${d} dia(s)`, tone)}</article>`; }).join('')}</div>` : emptyState('Nenhuma manutenção pendente','Cadastre os equipamentos e contratos preventivos.')}</section>`;
  }

  function renderOccurrenceBook() {
    const rows = dataset('occurrences').slice(0,30);
    const high = rows.filter(o => /alta|urgente|critica/i.test(String(o.priority || '')) && !/fech|conclu/i.test(String(o.status || ''))).length;
    return `${pageHeader('Operação da portaria','Livro digital e troca de turno','Registre pendências, ocorrências, objetos encontrados, equipamentos e orientações para o próximo turno.', `<button data-suite-route="#/ocorrencias/livro">Abrir módulo original</button>`)}
      ${high ? `<div class="vr-suite-alert"><b>${high} ocorrência(s) prioritária(s)</b><span>Revise antes da troca de turno.</span></div>` : ''}
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Novo registro</span><h4>Livro da portaria</h4></div></header><form class="vr-suite-form" data-form="occurrence"><label>Título *<input required name="title" placeholder="Resumo objetivo"></label><label>Categoria<select name="category"><option value="turno">Troca de turno</option><option value="manutencao">Manutenção</option><option value="visitante">Visitante</option><option value="encomenda">Encomenda</option><option value="achados">Achados e perdidos</option><option value="seguranca">Segurança</option><option value="queixa">Queixa</option></select></label><label>Local / unidade<input name="unit" placeholder="Portaria, garagem, unidade..."></label><label>Prioridade<select name="priority"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><label class="full">Descrição *<textarea required name="description" placeholder="O que ocorreu, providências tomadas e o que falta fazer"></textarea></label><button class="vr-suite-primary full">Registrar no livro</button></form></section>
      <section class="vr-suite-card"><header><div><span>Troca de turno</span><h4>Checklist de passagem</h4></div></header><div class="vr-suite-checklist">${['Encomendas importantes conferidas','Visitantes ainda presentes verificados','Emergências e ocorrências lidas','Equipamentos com problema informados','Chaves e controles conferidos','Próximo funcionário recebeu as pendências'].map(i => `<label><input type="checkbox">${i}</label>`).join('')}</div><button class="vr-suite-secondary" data-suite-shift-summary>Gerar resumo do turno</button></section></div>
      <section class="vr-suite-card"><header><div><span>Histórico</span><h4>Registros recentes</h4></div></header>${rows.length ? `<div class="vr-suite-occurrence-list">${rows.map(o => `<article><div><span>${esc(o.category || 'registro')}</span><b>${esc(o.title || 'Ocorrência')}</b><small>${dateBR(o.created_at,true)} · ${esc(o.unit || 'Área comum')}</small><p>${esc(o.description || '')}</p></div>${statusPill(o.status || 'aberta', /fech|conclu|resolvid/i.test(String(o.status || '')) ? 'ok' : /alta|urgent|critic/i.test(String(o.priority || '')) ? 'danger' : 'warn')}</article>`).join('')}</div>` : emptyState('Livro sem registros','As ocorrências e passagens de turno aparecerão aqui.')}</section>`;
  }

  function renderAudit() {
    const rows = dataset('audit').slice(0,80);
    const actors = new Set(rows.map(r => r.actor).filter(Boolean)).size;
    const today = rows.filter(r => String(r.created_at || '').slice(0,10) === isoToday()).length;
    return `${pageHeader('Segurança e conformidade','Auditoria visível','Saiba quem realizou cada ação, quando ocorreu e qual registro foi afetado.', `<button data-suite-export-audit>Exportar CSV</button>`)}
      <div class="vr-suite-metrics compact">${metricCard('◎','Ações carregadas',rows.length,'Histórico recente')}${metricCard('♙','Usuários ativos',actors,'Autores identificados')}${metricCard('24','Ações hoje',today,'Movimentações do dia')}${metricCard('✓','Rastreabilidade','Ativa','Ações críticas registradas','ok')}</div>
      <section class="vr-suite-card"><header><div><span>Linha do tempo</span><h4>Histórico de ações</h4></div><input class="vr-suite-search" data-suite-audit-search placeholder="Filtrar auditoria"></header><div class="vr-suite-audit-list" id="vr-suite-audit-list">${rows.length ? rows.map(a => `<article data-audit-text="${esc(`${a.actor} ${a.action} ${a.entity}`.toLowerCase())}"><span>${dateBR(a.created_at,true)}</span><div><b>${esc(a.action || 'Ação')}</b><small>${esc(a.actor || 'sistema')}</small><em>${esc(a.entity || '')}</em></div></article>`).join('') : emptyState('Sem registros de auditoria','As ações administrativas aparecerão aqui.')}</div></section>`;
  }

  function readShared(key, fallback) {
    const remote = state.data?.settings?.[key];
    if (remote) { try { return JSON.parse(remote); } catch {} }
    try { return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${key}`) || '') || fallback; } catch { return fallback; }
  }
  async function writeShared(key, value) {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
    state.data.settings = { ...(state.data.settings || {}), [key]:JSON.stringify(value) };
    if (isAdmin() && token()) {
      try { await api('/api/settings', { method:'POST', body:JSON.stringify({ [key]:JSON.stringify(value) }) }); }
      catch { toast('Dados salvos neste dispositivo; sincronização administrativa pendente.', 'warn'); }
    }
  }

  function renderGovernance() {
    const governance = readShared(SHARED_KEYS.governance, { assemblies:[], decisions:[] });
    const assemblies = governance.assemblies || [];
    return `${pageHeader('Governança digital','Assembleias, votações e decisões','Organize pautas, presença, procurações, votos e atas em um espaço simples para apresentação e administração.', `<button data-suite-print-governance>Imprimir resumo</button>`)}
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Nova assembleia</span><h4>Criar reunião</h4></div></header><form class="vr-suite-form" data-form="assembly"><label>Título *<input required name="title" placeholder="Assembleia Ordinária 2026"></label><label>Data e hora *<input required type="datetime-local" name="scheduled_at"></label><label>Local / formato<input name="location" placeholder="Salão de festas / online"></label><label>Quórum esperado<input type="number" name="quorum" placeholder="50"></label><label class="full">Pauta *<textarea required name="agenda" placeholder="Uma pauta por linha"></textarea></label><button class="vr-suite-primary full">Criar assembleia</button></form></section>
      <section class="vr-suite-card"><header><div><span>Boas práticas</span><h4>Checklist de governança</h4></div></header><div class="vr-suite-checklist">${['Edital e pauta publicados','Lista de presença preparada','Procurações conferidas','Quórum calculado','Votos registrados por pauta','Ata revisada e disponibilizada'].map(i => `<label><input type="checkbox">${i}</label>`).join('')}</div></section></div>
      <section class="vr-suite-card"><header><div><span>Reuniões</span><h4>Assembleias cadastradas</h4></div></header>${assemblies.length ? `<div class="vr-suite-assembly-list">${assemblies.map(a => { const total = Number(a.yes||0)+Number(a.no||0)+Number(a.abstain||0); return `<article><div><span>${dateBR(a.scheduled_at,true)}</span><h4>${esc(a.title)}</h4><p>${esc(a.location || 'Local a definir')}</p><small>${esc(a.agenda || '')}</small></div><div class="vr-suite-votes"><b>${total} voto(s)</b><button data-suite-vote="${esc(a.id)}:yes">Favorável ${Number(a.yes||0)}</button><button data-suite-vote="${esc(a.id)}:no">Contrário ${Number(a.no||0)}</button><button data-suite-vote="${esc(a.id)}:abstain">Abstenção ${Number(a.abstain||0)}</button></div></article>`; }).join('')}</div>` : emptyState('Nenhuma assembleia cadastrada','Crie uma reunião para iniciar a governança digital.')}</section>
      <div class="vr-suite-note"><b>Modo piloto de governança</b><span>Os dados são compartilhados pelas configurações quando o perfil possui permissão administrativa e mantidos localmente como contingência. Para votação jurídica remota, recomenda-se autenticação individual reforçada e validação da convenção condominial.</span></div>`;
  }

  function renderServices() {
    const store = readShared(SHARED_KEYS.services, { records:[] });
    const rows = store.records || [];
    const counts = rows.reduce((acc,r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {});
    const cards = [
      ['mudanca','Mudanças','Agenda, elevador, prestadores e vistoria'],['achados','Achados e perdidos','Objetos encontrados e devoluções'],['pet','Animais','Cadastro, contato e observações'],['prestador','Prestadores recorrentes','Empresas, documentos e validade'],['pesquisa','Pesquisa de satisfação','Perguntas e resultados rápidos'],['aceite','Aceite digital','Regimento, termos e documentos']
    ];
    return `${pageHeader('Central de serviços','Rotinas complementares','Módulos para demandas recorrentes do condomínio, com cadastro simples e histórico.', '')}
      <div class="vr-suite-service-cards">${cards.map(([key,title,note]) => `<article><span>${counts[key] || 0}</span><b>${title}</b><small>${note}</small></article>`).join('')}</div>
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Novo registro</span><h4>Adicionar à central</h4></div></header><form class="vr-suite-form" data-form="service"><label>Tipo<select name="type">${cards.map(([k,t]) => `<option value="${k}">${t}</option>`).join('')}</select></label><label>Título / nome *<input required name="title" placeholder="Identificação do registro"></label><label>Unidade / responsável<input name="unit" placeholder="Ex.: 501"></label><label>Data / validade<input type="date" name="date" value="${isoToday()}"></label><label class="full">Detalhes *<textarea required name="details" placeholder="Informações, contatos, regras e observações"></textarea></label><button class="vr-suite-primary full">Salvar registro</button></form></section>
      <section class="vr-suite-card"><header><div><span>Integrações</span><h4>Acesso e equipamentos</h4></div></header>${renderIntegrationForm()}</section></div>
      <section class="vr-suite-card"><header><div><span>Histórico</span><h4>Registros da central</h4></div></header>${rows.length ? `<div class="vr-suite-service-list">${rows.slice().reverse().map(r => `<article><span>${esc(cards.find(c => c[0]===r.type)?.[1] || r.type)}</span><div><b>${esc(r.title)}</b><small>${esc(r.unit || 'Condomínio')} · ${dateBR(r.date || r.created_at)}</small><p>${esc(r.details)}</p></div><button data-suite-delete-service="${esc(r.id)}">Excluir</button></article>`).join('')}</div>` : emptyState('Nenhum registro','Cadastre mudanças, pets, objetos, prestadores, pesquisas ou aceites.')}</section>`;
  }

  function renderIntegrationForm() {
    const cfg = readShared(SHARED_KEYS.integrations, { provider:'manual', camera_url:'', access_url:'', webhook:'', enabled:false });
    return `<form class="vr-suite-form" data-form="integration"><label>Integração principal<select name="provider"><option value="manual" ${cfg.provider==='manual'?'selected':''}>Manual / sem integração</option><option value="camera" ${cfg.provider==='camera'?'selected':''}>Câmeras</option><option value="access" ${cfg.provider==='access'?'selected':''}>Controle de acesso</option><option value="hybrid" ${cfg.provider==='hybrid'?'selected':''}>Híbrida</option></select></label><label>URL do sistema de câmeras<input name="camera_url" value="${esc(cfg.camera_url || '')}" placeholder="https://..."></label><label>URL do controle de acesso<input name="access_url" value="${esc(cfg.access_url || '')}" placeholder="https://..."></label><label>Webhook / endpoint<input name="webhook" value="${esc(cfg.webhook || '')}" placeholder="https://..."></label><label class="vr-suite-check full"><input type="checkbox" name="enabled" ${cfg.enabled ? 'checked' : ''}> Integração habilitada para testes</label><button class="vr-suite-secondary full">Salvar configuração</button></form><div class="vr-suite-note compact"><b>Camada de preparação</b><span>A conexão efetiva depende do fabricante, credenciais e documentação técnica do equipamento.</span></div>`;
  }

  function renderFinanceCouncil() {
    const f = financeTotals();
    const docs = dataset('documents').filter(d => /balanc|prestacao|finance|demonstrativo/i.test(`${d.title || ''} ${d.description || ''} ${d.document_type || ''}`));
    const rows = dataset('finance');
    return `${pageHeader('Transparência financeira','Conselho fiscal e conciliação PIX','Visão resumida para prestação de contas e conferência assistida de extratos.', `<button data-suite-route="#/financeiro/visao">Abrir financeiro</button>`)}
      <div class="vr-suite-metrics compact">${metricCard('↑','Receitas',money(f.revenue),'Lançamentos cadastrados','ok')}${metricCard('↓','Despesas',money(f.expense),'Saídas registradas',f.expense > f.revenue ? 'danger' : '')}${metricCard('=','Saldo',money(f.balance),'Resultado previsto',f.balance < 0 ? 'danger' : 'ok')}${metricCard('…','Pendências',money(f.pending),'Valores não quitados','warn')}</div>
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Conciliação assistida</span><h4>Importar extrato CSV / PIX</h4></div></header><form class="vr-suite-form" data-form="reconcile"><label class="full">Cole o extrato<textarea name="csv" required placeholder="data;descricao;valor&#10;17/07/2026;PIX CONDOMINIO 501;650,00"></textarea></label><button class="vr-suite-primary full">Analisar correspondências</button></form>${state.reconciliation.length ? `<div class="vr-suite-reconciliation">${state.reconciliation.map(r => `<article><div><b>${esc(r.description)}</b><small>${esc(r.date)} · ${money(r.amount)}</small></div>${statusPill(r.match ? `Possível correspondência: ${r.match.title}` : 'Sem correspondência', r.match ? 'ok' : 'warn')}</article>`).join('')}</div>` : ''}</section>
      <section class="vr-suite-card"><header><div><span>Documentos</span><h4>Prestação de contas</h4></div></header>${docs.length ? docs.slice(0,8).map(d => `<article class="vr-suite-doc"><span>PDF</span><div><b>${esc(d.title || d.file_name || 'Documento')}</b><small>${esc(d.description || d.document_type || '')}</small></div></article>`).join('') : emptyState('Nenhum balancete localizado','Envie os documentos financeiros no módulo de documentos.')}</section></div>
      <section class="vr-suite-card"><header><div><span>Livro financeiro</span><h4>Últimos lançamentos</h4></div></header>${rows.length ? `<div class="vr-suite-table">${rows.slice(0,12).map(r => `<article><div><b>${esc(r.title || 'Lançamento')}</b><small>${esc(r.category || 'geral')} · ${dateBR(r.due_date || r.created_at)}</small></div><span class="vr-suite-amount ${r.type === 'despesa' ? 'expense' : ''}">${r.type === 'despesa' ? '−' : '+'}${money(r.amount)}</span></article>`).join('')}</div>` : emptyState('Sem lançamentos','Cadastre receitas e despesas para formar o painel do conselho.')}</section>`;
  }

  function renderCommercial() {
    const units = Number(localStorage.getItem(`${STORAGE_PREFIX}pricing_units`) || 100);
    const recommended = priceForUnits(units);
    return `${pageHeader('Comercialização','Planos e proposta','Calcule valores, apresente benefícios e gere uma proposta pronta para reunião.', `<button class="vr-suite-primary" data-suite-print-proposal>Imprimir proposta</button>`)}
      <div class="vr-suite-pricing-hero"><div><span>Central Digital de Gestão, Comunicação e Segurança</span><h4>Vitória Régia Pro</h4><p>Um sistema personalizável para portaria, moradores, síndico, funcionários e conselho fiscal.</p></div><div><small>Condição piloto sugerida</small><b>${money(recommended.monthly)}/mês</b><span>${units} unidades · ${money(recommended.perUnit)} por unidade</span></div></div>
      <div class="vr-suite-pricing-controls"><label>Número de unidades<input type="range" min="10" max="500" step="10" value="${units}" data-suite-units-range><b id="vr-suite-units-value">${units}</b></label><div><small>Mensalidade recomendada</small><b id="vr-suite-price-value">${money(recommended.monthly)}</b><span id="vr-suite-setup-value">Implantação: ${money(recommended.setup)}</span></div></div>
      <div class="vr-suite-plans"><article><span>Essencial</span><h4>R$ 249<small>/mês</small></h4><p>Até 50 unidades</p><ul><li>Moradores e portaria</li><li>Encomendas e visitantes</li><li>Comunicados e documentos</li><li>Reservas básicas</li></ul></article><article class="featured"><em>RECOMENDADO</em><span>Profissional</span><h4>R$ 399<small>/mês</small></h4><p>Até 100 unidades</p><ul><li>Tudo do Essencial</li><li>Financeiro e manutenção</li><li>Auditoria e livro digital</li><li>Telegram e PWA</li></ul></article><article><span>Premium</span><h4>R$ 649<small>/mês</small></h4><p>Até 250 unidades</p><ul><li>Tudo do Profissional</li><li>Governança e conselho</li><li>QR Code e central de serviços</li><li>Personalização e suporte</li></ul></article></div>
      <div class="vr-suite-grid two"><section class="vr-suite-card"><header><div><span>Condição especial</span><h4>Condomínio piloto</h4></div></header><div class="vr-suite-offer"><b>60 dias de piloto acompanhado</b><p>Implantação, configuração inicial, treinamento da portaria e suporte durante a validação.</p><strong>Após o piloto: ${money(Math.max(299,recommended.monthly))}/mês</strong><small>Serviços externos pagos — WhatsApp oficial, SMS, banco, equipamentos e controladores — são contratados à parte.</small></div></section>
      <section class="vr-suite-card"><header><div><span>Argumentos</span><h4>Como defender o investimento</h4></div></header><ul class="vr-suite-selling-points"><li>Custo por unidade inferior a uma pequena taxa administrativa.</li><li>Reduz retrabalho, papel e perda de informação na portaria.</li><li>Cria histórico para decisões, segurança e prestação de contas.</li><li>O condomínio valida o resultado antes da contratação definitiva.</li><li>A solução pode evoluir conforme as necessidades reais do prédio.</li></ul></section></div>`;
  }

  function priceForUnits(units) {
    const n = Math.max(1, Number(units || 1));
    if (n <= 50) return { monthly:249, setup:1490, perUnit:249/n };
    if (n <= 100) return { monthly:399, setup:2990, perUnit:399/n };
    if (n <= 250) return { monthly:649, setup:4990, perUnit:649/n };
    const monthly = Math.max(799, Math.round(n * 3.2 / 10) * 10);
    return { monthly, setup:6900, perUnit:monthly/n };
  }

  async function handleSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const type = form.dataset.form;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      if (type === 'visitor') await submitVisitor(values, form);
      if (type === 'maintenance') await submitMaintenance(values, form);
      if (type === 'occurrence') await submitOccurrence(values, form);
      if (type === 'assembly') await submitAssembly(values, form);
      if (type === 'service') await submitService(values, form);
      if (type === 'integration') await submitIntegration(values, form);
      if (type === 'reconcile') submitReconciliation(values);
    } catch (error) { toast(error.message || 'Não foi possível concluir a operação.', 'danger'); }
  }

  async function submitVisitor(values, form) {
    const code = randomCode('VIS');
    const payload = { ...values, status:'autorizado', authorized_by:state.currentUser?.name || state.currentUser?.email || 'Sistema Vitória Régia', recurring:false, announce_required:true, announcement_channel:'interfone', notes:`${values.notes || ''}\nConvite digital: ${code}`.trim() };
    const result = await api('/api/visitors', { method:'POST', body:JSON.stringify(payload) });
    const url = `${location.origin}/?vr_invite=${encodeURIComponent(code)}#${encodeURIComponent(values.unit)}`;
    const qr = await makeQr(url);
    state.generatedInvite = { ...payload, code, url, qr, queued:result?.queued === true };
    if (!result?.queued) state.data.visitors = [result, ...dataset('visitors')];
    toast(result?.queued ? 'Convite salvo na fila offline.' : 'Convite criado e visitante registrado.');
    form.reset();
    render();
  }

  async function makeQr(text) {
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
      return await module.toDataURL(text, { width:320, margin:2, errorCorrectionLevel:'M', color:{ dark:'#083f37', light:'#ffffff' } });
    } catch {
      return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(text)}`;
    }
  }

  async function submitMaintenance(values, form) {
    const result = await api('/api/maintenance', { method:'POST', body:JSON.stringify({ ...values, status:'planejada', cost:Number(values.cost || 0) }) });
    if (!result?.queued) state.data.maintenance = [result, ...dataset('maintenance')];
    toast(result?.queued ? 'Manutenção salva na fila offline.' : 'Manutenção preventiva cadastrada.');
    form.reset();
    render();
  }

  async function submitOccurrence(values, form) {
    const result = await api('/api/occurrence-book', { method:'POST', body:JSON.stringify(values) });
    if (!result?.queued) state.data.occurrences = [result, ...dataset('occurrences')];
    toast(result?.queued ? 'Ocorrência salva na fila offline.' : 'Registro adicionado ao livro digital.');
    form.reset();
    render();
  }

  async function submitAssembly(values, form) {
    const store = readShared(SHARED_KEYS.governance, { assemblies:[], decisions:[] });
    store.assemblies = [...(store.assemblies || []), { id:randomCode('ASM'), ...values, yes:0, no:0, abstain:0, created_at:new Date().toISOString() }];
    await writeShared(SHARED_KEYS.governance, store);
    toast('Assembleia cadastrada no módulo de governança.');
    form.reset();
    render();
  }

  async function submitService(values, form) {
    const store = readShared(SHARED_KEYS.services, { records:[] });
    store.records = [...(store.records || []), { id:randomCode('SRV'), ...values, created_at:new Date().toISOString() }];
    await writeShared(SHARED_KEYS.services, store);
    toast('Registro salvo na central de serviços.');
    form.reset();
    render();
  }

  async function submitIntegration(values, form) {
    const payload = { ...values, enabled:form.querySelector('[name="enabled"]')?.checked === true };
    await writeShared(SHARED_KEYS.integrations, payload);
    toast('Configuração de integração salva.');
    render();
  }

  function submitReconciliation(values) {
    const lines = String(values.csv || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const rows = lines.map(line => {
      const parts = line.includes(';') ? line.split(';') : line.split(',');
      const date = parts.shift()?.trim() || '';
      const amountRaw = parts.pop()?.trim() || '0';
      const description = parts.join(' ').trim() || 'Lançamento';
      const amount = Number(amountRaw.replace(/R\$/gi,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')) || 0;
      const match = dataset('finance').find(f => Math.abs(Number(f.amount || 0) - Math.abs(amount)) < 0.01 && (!date || dateBR(f.due_date || f.created_at) === date));
      return { date, description, amount, match };
    });
    state.reconciliation = rows;
    toast(`${rows.length} lançamento(s) analisado(s).`);
    render();
  }

  async function handleClick(event) {
    const close = event.target.closest('[data-suite-close]');
    if (close) { closeSuite(); return; }
    const tabButton = event.target.closest('[data-suite-tab]');
    if (tabButton) { state.tab = tabButton.dataset.suiteTab; render(); return; }
    const routeButton = event.target.closest('[data-suite-route]');
    if (routeButton) { location.hash = routeButton.dataset.suiteRoute; closeSuite(); return; }
    if (event.target.closest('[data-suite-refresh]')) { await loadData(true); render(); toast('Dados atualizados.'); return; }
    if (event.target.closest('[data-suite-demo-toggle]')) { state.demo = !state.demo; localStorage.setItem(DEMO_KEY,String(state.demo)); await loadData(true); render(); toast(state.demo ? 'Modo demonstração ativado.' : 'Dados reais restaurados.'); return; }
    if (event.target.closest('[data-suite-install]')) { await installApp(); return; }
    if (event.target.closest('[data-suite-print-invite]')) { printNode('vr-suite-pass','Convite de visitante'); return; }
    if (event.target.closest('[data-suite-print-demo]')) { printHtml('Roteiro de apresentação', renderDemo()); return; }
    if (event.target.closest('[data-suite-print-governance]')) { printHtml('Governança digital', renderGovernance()); return; }
    if (event.target.closest('[data-suite-print-proposal]')) { printHtml('Proposta Vitória Régia Pro', renderCommercial()); return; }
    if (event.target.closest('[data-suite-export-results]')) { downloadText('resultados-vitoria-regia.txt', resultsText()); return; }
    if (event.target.closest('[data-suite-export-audit]')) { exportAuditCsv(); return; }
    if (event.target.closest('[data-suite-shift-summary]')) { downloadText(`troca-turno-${isoToday()}.txt`, shiftSummary()); return; }
    const copy = event.target.closest('[data-suite-copy]');
    if (copy) { await navigator.clipboard?.writeText(copy.dataset.suiteCopy || ''); toast('Link copiado.'); return; }
    const vote = event.target.closest('[data-suite-vote]');
    if (vote) { await voteAssembly(vote.dataset.suiteVote); return; }
    const delService = event.target.closest('[data-suite-delete-service]');
    if (delService) { await deleteService(delService.dataset.suiteDeleteService); return; }
  }

  async function voteAssembly(value) {
    const [id, option] = String(value || '').split(':');
    const store = readShared(SHARED_KEYS.governance, { assemblies:[], decisions:[] });
    const item = (store.assemblies || []).find(a => a.id === id);
    if (!item || !['yes','no','abstain'].includes(option)) return;
    item[option] = Number(item[option] || 0) + 1;
    await writeShared(SHARED_KEYS.governance, store);
    toast('Voto de demonstração registrado.');
    render();
  }

  async function deleteService(id) {
    const store = readShared(SHARED_KEYS.services, { records:[] });
    store.records = (store.records || []).filter(r => r.id !== id);
    await writeShared(SHARED_KEYS.services, store);
    toast('Registro removido.');
    render();
  }

  function resultsText() {
    const f = financeTotals();
    return `VITÓRIA RÉGIA PRO — RESULTADOS\nData: ${dateBR(new Date().toISOString())}\n\nÍndice operacional: ${operationalScore()}/100\nEncomendas pendentes: ${pendingPackages().length}\nVisitantes hoje: ${todayVisitors().length}\nReservas futuras: ${upcomingReservations().length}\nOcorrências abertas: ${openOccurrences().length}\nManutenções em aberto: ${upcomingMaintenance().length}\nSaldo previsto: ${money(f.balance)}\n\nMetas de 90 dias:\n- 95% das encomendas registradas digitalmente\n- 80% dos visitantes pré-autorizados\n- 100% das manutenções críticas com alerta\n- 70% dos moradores ativos\n- retirada média de encomendas em até 24 horas\n`;
  }
  function shiftSummary() {
    const important = openOccurrences().slice(0,15).map(o => `- [${o.priority || 'normal'}] ${o.title}: ${o.description || ''}`).join('\n');
    return `VITÓRIA RÉGIA — TROCA DE TURNO\nGerado em ${dateBR(new Date().toISOString(),true)}\nResponsável: ${state.currentUser?.name || state.currentUser?.email || 'Portaria'}\n\nPENDÊNCIAS E OCORRÊNCIAS\n${important || '- Nenhuma ocorrência aberta registrada.'}\n\nEncomendas pendentes: ${pendingPackages().length}\nVisitantes válidos hoje: ${todayVisitors().length}\nPróximas reservas: ${upcomingReservations().length}\nFila offline: ${readQueue().length}\n`;
  }
  function exportAuditCsv() {
    const header = 'data;autor;acao;entidade';
    const lines = dataset('audit').map(a => [dateBR(a.created_at,true),a.actor,a.action,a.entity].map(v => `"${String(v || '').replace(/"/g,'""')}"`).join(';'));
    downloadText(`auditoria-${isoToday()}.csv`, [header,...lines].join('\n'), 'text/csv;charset=utf-8');
  }
  function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printNode(id, title) {
    const node = document.getElementById(id);
    if (!node) return;
    printHtml(title, node.outerHTML);
  }
  function printHtml(title, html) {
    const win = window.open('', '_blank', 'width=980,height=800');
    if (!win) { toast('O navegador bloqueou a janela de impressão.', 'warn'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="/premium-polish.css"><link rel="stylesheet" href="/premium-suite.css"><style>body{padding:32px;background:#fff!important}.vr-suite-page-actions,.vr-suite-header-actions,button,input,textarea,select{display:none!important}.vr-suite-card,.vr-suite-hero,.vr-suite-pricing-hero{break-inside:avoid}</style></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 550);
  }

  async function installApp() {
    if (state.installPrompt) {
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => null);
      state.installPrompt = null;
      return;
    }
    toast('No celular, use o menu do navegador e escolha “Adicionar à tela inicial”.', 'warn');
  }

  function handleInput(event) {
    const range = event.target.closest('[data-suite-units-range]');
    if (range) {
      const units = Number(range.value || 100);
      localStorage.setItem(`${STORAGE_PREFIX}pricing_units`,String(units));
      const p = priceForUnits(units);
      const unitNode = document.getElementById('vr-suite-units-value');
      const priceNode = document.getElementById('vr-suite-price-value');
      const setupNode = document.getElementById('vr-suite-setup-value');
      if (unitNode) unitNode.textContent = String(units);
      if (priceNode) priceNode.textContent = money(p.monthly);
      if (setupNode) setupNode.textContent = `Implantação: ${money(p.setup)}`;
    }
    const auditSearch = event.target.closest('[data-suite-audit-search]');
    if (auditSearch) {
      const q = String(auditSearch.value || '').toLowerCase();
      document.querySelectorAll('#vr-suite-audit-list [data-audit-text]').forEach(node => { node.hidden = q && !node.dataset.auditText.includes(q); });
    }
  }

  function verifyInviteFromUrl() {
    const params = new URLSearchParams(location.search);
    const code = params.get('vr_invite');
    if (!code) return;
    setTimeout(async () => {
      try {
        const visitors = await api('/api/visitors');
        const found = (visitors || []).find(v => String(v.notes || '').includes(code));
        ensureShell();
        state.generatedInvite = found ? { ...found, code, url:location.href, qr:'' } : null;
        await openSuite('convites');
        toast(found ? `Convite válido para ${found.name}.` : 'Código não localizado ou sem permissão de consulta.', found ? 'ok' : 'warn');
      } catch {}
    }, 900);
  }

  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; });
  window.addEventListener('online', flushQueue);
  window.addEventListener('storage', event => { if (event.key?.startsWith(STORAGE_PREFIX) && state.open) render(); });
  document.addEventListener('input', handleInput);

  function boot() {
    ensureShell();
    ensureLauncher();
    flushQueue().catch(() => null);
    verifyInviteFromUrl();
    const observer = new MutationObserver(() => ensureLauncher());
    observer.observe(document.documentElement, { childList:true, subtree:true });
    window.VitoriaRegiaPremiumSuite = { open:openSuite, close:closeSuite, refresh:loadData, version:SUITE_VERSION };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
