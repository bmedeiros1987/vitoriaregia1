
// Vitória Régia v4.3.2 - Dashboard por perfil e privacidade
(function () {
  const VERSION = 'v4.3.2';

  function parse(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  function getStoredUser() {
    const keys = ['currentUser', 'user', 'loggedUser', 'authUser', 'vrCurrentUser', 'profile'];
    for (const key of keys) {
      const value = parse(localStorage.getItem(key));
      if (value && typeof value === 'object') return value;
    }

    const username = localStorage.getItem('username') || localStorage.getItem('usuario');
    const role = localStorage.getItem('role') || localStorage.getItem('perfil') || localStorage.getItem('userRole');
    const unit = localStorage.getItem('unit') || localStorage.getItem('unidade');
    if (username || role || unit) return { username, role, unit };

    return {};
  }

  function normalizeRole(role) {
    role = String(role || '').toLowerCase();
    if (role.includes('owner') || role.includes('propriet') || role.includes('dono')) return 'owner';
    if (role.includes('admin')) return 'admin';
    if (role.includes('sind') || role.includes('sínd')) return 'sindico';
    if (role.includes('port') || role.includes('porteir')) return 'portaria';
    if (role.includes('zel')) return 'zeladoria';
    if (role.includes('limp')) return 'limpeza';
    return 'morador';
  }

  function roleLabel(role) {
    return {
      owner: 'Administrador proprietário',
      admin: 'Administração',
      sindico: 'Síndico',
      portaria: 'Portaria',
      zeladoria: 'Zeladoria',
      limpeza: 'Limpeza',
      morador: 'Morador'
    }[role] || 'Usuário';
  }

  function firstName(user) {
    const candidate = user.name || user.nome || user.fullName || user.username || user.usuario || user.email || 'Usuário';
    return String(candidate).trim().split(/\s+/)[0] || 'Usuário';
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function userUnit(user) {
    return user.unit || user.unidade || user.apartment || user.apartamento || user.residencial || '';
  }

  function loadArray(keys) {
    for (const key of keys) {
      const value = parse(localStorage.getItem(key));
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function belongsToUser(item, user) {
    const unit = userUnit(user);
    const userId = user.id || user.userId || user.username || user.usuario || user.email;
    if (!item || typeof item !== 'object') return false;
    const itemUnit = item.unit || item.unidade || item.apartment || item.apartamento;
    const itemUser = item.userId || item.usuario || item.username || item.email || item.moradorEmail;
    if (unit && String(itemUnit) === String(unit)) return true;
    if (userId && itemUser && String(itemUser).toLowerCase() === String(userId).toLowerCase()) return true;
    return false;
  }

  function getData(user, role) {
    const packages = loadArray(['packages', 'encomendas', 'vrPackages']);
    const reservations = loadArray(['reservations', 'reservas', 'vrReservations']);
    const notifications = loadArray(['notifications', 'notificacoes', 'vrNotifications']);
    const requests = loadArray(['serviceRequests', 'solicitacoes', 'vrRequests']);
    const financial = loadArray(['financeCharges', 'cobrancas', 'charges', 'vrFinanceCharges']);

    if (role === 'morador') {
      return {
        packages: packages.filter(x => belongsToUser(x, user)),
        reservations: reservations.filter(x => belongsToUser(x, user)),
        notifications: notifications.filter(x => belongsToUser(x, user) || x.public === true || x.publico === true),
        requests: requests.filter(x => belongsToUser(x, user)),
        financial: financial.filter(x => belongsToUser(x, user))
      };
    }

    return { packages, reservations, notifications, requests, financial };
  }

  function isUnread(item) {
    return !(item.read || item.lida || item.status === 'lida' || item.status === 'read');
  }

  function navigateTo(target) {
    if (!target) return;
    const selectors = [
      `[data-route="${target}"]`,
      `[data-page="${target}"]`,
      `[data-section="${target}"]`,
      `button[data-target="${target}"]`,
      `a[href="#${target}"]`,
      `[href="#/${target}"]`
    ];
    const el = selectors.map(s => document.querySelector(s)).find(Boolean);
    if (el) {
      el.click();
      return;
    }
    window.location.hash = target;
  }

  function action(icon, title, subtitle, target) {
    return `<button class="vr-profile-action" type="button" data-vr-goto="${target}">
      <span class="vr-profile-icon">${icon}</span>
      <strong>${title}</strong>
      <span>${subtitle}</span>
    </button>`;
  }

  function item(icon, title, text, badge) {
    return `<div class="vr-profile-item">
      <span class="vr-profile-icon">${icon}</span>
      <span><b>${title}</b><small>${text}</small></span>
      <span class="vr-profile-badge">${badge}</span>
    </div>`;
  }

  function buildActions(role) {
    if (role === 'morador') {
      return [
        action('📦','Minhas encomendas','Acompanhe apenas suas entregas.','encomendas'),
        action('📅','Minhas reservas','Veja suas reservas e solicitações.','reservas'),
        action('🧹','Solicitar limpeza','Abra reclamação ou pedido de manutenção.','solicitacoes'),
        action('👥','Visitantes','Cadastre ou acompanhe suas visitas.','visitantes'),
        action('📣','Comunicados','Veja avisos públicos ou da sua unidade.','comunicados'),
        action('🚨','Emergência','Use somente em caso real.','emergencias')
      ];
    }

    if (role === 'portaria') {
      return [
        action('📦','Registrar encomenda','Entrada, foto e aviso ao morador.','encomendas'),
        action('👥','Cadastrar visitante','Controle rápido de acesso.','visitantes'),
        action('🚨','Emergências do turno','Acompanhe alertas ativos.','emergencias'),
        action('📣','Avisar morador','Enviar comunicado ou notificação.','comunicados'),
        action('🧾','Logs da portaria','Histórico operacional.','portaria'),
        action('❓','Ajuda','Vídeos e manuais rápidos.','ajuda')
      ];
    }

    if (role === 'zeladoria' || role === 'limpeza') {
      return [
        action('🧹','Solicitações recebidas','Ver tarefas aprovadas pelo síndico.','solicitacoes'),
        action('✅','Concluir tarefa','Registrar conclusão e observação.','solicitacoes'),
        action('🚨','Emergências','Apoio operacional quando acionado.','emergencias'),
        action('📣','Comunicados','Avisos internos da administração.','comunicados'),
        action('❓','Ajuda','Manuais simples de uso.','ajuda')
      ];
    }

    return [
      action('🔔','Pendências do síndico','Aprovações, solicitações e alertas.','notificacoes'),
      action('👤','Usuários','Moradores e funcionários por perfil.','usuarios'),
      action('💰','Financeiro','Dados restritos da administração.','financeiro'),
      action('🧹','Solicitações','Aprovar e encaminhar equipes.','solicitacoes'),
      action('📣','Comunicados','Definir o que é público ou restrito.','comunicados'),
      action('⚙️','Configurações','Canais, apps, backup e permissões.','configuracoes'),
      action('🚨','Emergências','Confirmar, notificar e resetar alarme.','emergencias'),
      action('⭐','Central Premium','Recursos exclusivos do sistema.','premium')
    ];
  }

  function buildPanel(user, role, data) {
    const unread = data.notifications.filter(isUnread).length;
    const pendingRequests = data.requests.filter(x => /pendente|aberto|novo|aguardando/i.test(String(x.status || 'pendente'))).length;
    const pendingPackages = data.packages.filter(x => !/retirad|entregue|conclu/i.test(String(x.status || ''))).length;
    const pendingReservations = data.reservations.filter(x => /pendente|aguardando|solicit/i.test(String(x.status || ''))).length;

    const title = role === 'morador' ? 'Suas informações' :
      role === 'portaria' ? 'Tarefas da portaria' :
      role === 'zeladoria' || role === 'limpeza' ? 'Tarefas da equipe' :
      'Pendências administrativas';

    const leftItems = [];
    if (role === 'morador') {
      leftItems.push(item('📦','Encomendas da sua unidade', `${pendingPackages} pendente(s) para sua unidade.`, 'Privado'));
      leftItems.push(item('📅','Reservas da sua unidade', `${pendingReservations} reserva(s) em acompanhamento.`, 'Privado'));
      leftItems.push(item('🧹','Suas solicitações', `${pendingRequests} solicitação(ões) aberta(s).`, 'Privado'));
      leftItems.push(item('💰','Cobranças da sua unidade', `${data.financial.length} registro(s) da sua unidade.`, 'Privado'));
    } else if (role === 'portaria') {
      leftItems.push(item('📦','Encomendas a registrar', `${pendingPackages} entrega(s) pendente(s).`, 'Operação'));
      leftItems.push(item('👥','Visitantes e acessos', 'Verifique autorizações e histórico do dia.', 'Portaria'));
      leftItems.push(item('🚨','Emergências do turno', 'Alertas aparecem conforme escala cadastrada.', 'Turno'));
    } else if (role === 'zeladoria' || role === 'limpeza') {
      leftItems.push(item('🧹','Serviços aprovados', `${pendingRequests} tarefa(s) para acompanhar.`, 'Equipe'));
      leftItems.push(item('📣','Avisos internos', `${unread} aviso(s) não lido(s).`, 'Interno'));
    } else {
      leftItems.push(item('🔔','Notificações do síndico', `${unread} notificação(ões) não lida(s).`, 'Restrito'));
      leftItems.push(item('🧹','Solicitações de moradores', `${pendingRequests} pedido(s) aguardando análise.`, 'Aprovar'));
      leftItems.push(item('👤','Cadastros pendentes', 'Aprovar moradores e funcionários.', 'Admin'));
      leftItems.push(item('💰','Financeiro do prédio', 'Visível apenas para perfis autorizados.', 'Privado'));
    }

    return `<section class="vr-profile-panels">
      <div class="vr-profile-panel">
        <h3>📌 ${title}</h3>
        <div class="vr-profile-list">${leftItems.join('')}</div>
      </div>
      <div class="vr-profile-panel">
        <h3>🔐 Privacidade e visibilidade</h3>
        <div class="vr-profile-privacy-note">
          ${role === 'morador'
            ? 'Você vê apenas informações da sua unidade, suas encomendas, suas reservas, seus avisos e suas pendências. Dados gerais do condomínio, principalmente financeiros, só aparecem quando o síndico marcar como público.'
            : 'Dados administrativos e financeiros são restritos por perfil. O síndico pode publicar apenas o que desejar compartilhar com moradores.'}
        </div>
        <span class="vr-public-finance-toggle vr-syndic-only">💰 Financeiro público somente se autorizado</span>
      </div>
    </section>`;
  }

  function injectDashboard() {
    if (document.querySelector('.vr-profile-home')) return;

    const user = getStoredUser();
    const role = normalizeRole(user.role || user.perfil || user.tipo || user.profile || user.userType);
    const name = firstName(user);
    const unit = userUnit(user);
    const data = getData(user, role);
    const unread = data.notifications.filter(isUnread).length;
    const summary = [
      ['📦', data.packages.length, role === 'morador' ? 'suas encomendas' : 'encomendas'],
      ['📅', data.reservations.length, role === 'morador' ? 'suas reservas' : 'reservas'],
      ['🔔', unread, 'não lidas'],
      ['🧹', data.requests.length, role === 'morador' ? 'suas solicitações' : 'solicitações']
    ];

    document.body.classList.remove('vr-role-owner','vr-role-admin','vr-role-sindico','vr-role-portaria','vr-role-porteiro','vr-role-morador','vr-role-limpeza','vr-role-zeladoria');
    document.body.classList.add(`vr-role-${role}`);

    const financePublic = String(localStorage.getItem('financeiroPublico') || localStorage.getItem('vrFinancePublic') || '').toLowerCase();
    if (financePublic === 'true' || financePublic === 'sim' || financePublic === '1') {
      document.body.classList.add('vr-finance-public');
    }

    const html = `<section class="vr-profile-home" data-vr-version="${VERSION}">
      <div class="vr-profile-hero">
        <div>
          <span class="vr-profile-pill">👋 ${roleLabel(role)}${unit && role === 'morador' ? ' • Unidade ' + unit : ''}</span>
          <h2>${greeting()}, ${name}.</h2>
          <p>${role === 'morador'
            ? 'Aqui aparecem somente seus dados, suas entregas, suas reservas, suas pendências e avisos liberados para você.'
            : role === 'portaria'
              ? 'Veja as tarefas operacionais do turno, registros de encomendas, visitantes e emergências.'
              : 'Acompanhe notificações, aprovações, solicitações e informações administrativas logo após o login.'}</p>
        </div>
        <div class="vr-profile-summary">
          ${summary.map(s => `<div class="vr-profile-summary-card"><strong>${s[0]} ${s[1]}</strong><span>${s[2]}</span></div>`).join('')}
        </div>
      </div>
      <div class="vr-profile-actions">${buildActions(role).join('')}</div>
      ${buildPanel(user, role, data)}
    </section>`;

    const mount = document.querySelector('[data-page="dashboard"], #dashboard, .dashboard, main, .content, .app-main') || document.body;
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    mount.insertBefore(tmp.firstChild, mount.firstChild);

    document.querySelectorAll('[data-vr-goto]').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-vr-goto')));
    });
  }

  function protectMoradorData() {
    const user = getStoredUser();
    const role = normalizeRole(user.role || user.perfil || user.tipo || user.profile || user.userType);
    if (role !== 'morador') return;

    const sensitiveTexts = ['financeiro do prédio', 'caixa do condomínio', 'saldo do condomínio', 'inadimplência geral', 'despesa geral'];
    const nodes = Array.from(document.querySelectorAll('section, article, div, .card, .panel'));
    nodes.forEach(node => {
      const txt = (node.innerText || '').toLowerCase();
      if (sensitiveTexts.some(t => txt.includes(t)) && !txt.includes('sua unidade') && !txt.includes('publicado pelo síndico')) {
        node.style.display = 'none';
      }
    });
  }

  function init() {
    injectDashboard();
    protectMoradorData();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  const mo = new MutationObserver(() => {
    if (!document.querySelector('.vr-profile-home')) injectDashboard();
    protectMoradorData();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
