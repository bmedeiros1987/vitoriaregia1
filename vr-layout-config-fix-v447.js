
// Vitória Régia v4.4.7 — layout estável: menu, dashboard e configurações
(function () {
  const VERSION = 'v4.4.7-mysql-layout-config-update-fix';
  const EXPECTED_ZIP = 'vitoriaregia_update_v4.4.7.zip';
  let scheduled = false;

  function parse(value, fallback) { if (!value) return fallback; try { return JSON.parse(value); } catch (_) { return fallback; } }
  function norm(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function session() {
    const prefix = 'vitoriaRegia.full.v1.';
    return parse(localStorage.getItem(prefix + 'session'), null) || parse(localStorage.getItem('currentUser'), null) || parse(localStorage.getItem('user'), null) || {};
  }
  function role() {
    const s = session();
    const r = norm(s.role || s.staffRole || s.originalRole || s.perfil || s.tipo || '');
    if (r.includes('owner') || r.includes('propriet') || r.includes('dono')) return 'owner';
    if (r.includes('admin')) return 'admin';
    if (r.includes('sind')) return 'sindico';
    if (r.includes('port')) return 'portaria';
    if (r.includes('limp')) return 'limpeza';
    if (r.includes('zel')) return 'zeladoria';
    return 'morador';
  }
  function allowedAdmin() { return ['owner', 'admin', 'sindico'].includes(role()); }
  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }
  function firstName() { const s = session(); return String(s.name || s.nome || s.email || 'usuário').trim().split(/\s+/)[0] || 'usuário'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  function setRoleClass() {
    document.body.classList.remove('vr-role-morador','vr-role-portaria','vr-role-limpeza','vr-role-zeladoria','vr-role-sindico','vr-role-admin','vr-role-owner');
    document.body.classList.add('vr-role-' + role());
  }
  function closeMenu() {
    document.body.classList.remove('sidebar-open', 'no-scroll');
    document.querySelector('[data-sidebar]')?.classList.remove('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.remove('is-open');
  }
  function openMenu() {
    document.body.classList.add('sidebar-open', 'no-scroll');
    document.querySelector('[data-sidebar]')?.classList.add('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.add('is-open');
  }
  function go(target) {
    if (!target) return;
    const el = document.querySelector(`[href="#${target}"], [data-route="${target}"], [data-target="${target}"]`);
    if (el) el.click(); else location.hash = target;
    closeMenu(); setTimeout(runNow, 120);
  }
  function ensureMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    if (!sidebar) return;
    sidebar.querySelectorAll('.vr440-menu-head,.vr441-menu-head,.vr442-menu-head').forEach(el => el.remove());
    const heads = Array.from(sidebar.querySelectorAll('.vr447-menu-head'));
    heads.slice(1).forEach(el => el.remove());
    if (!sidebar.querySelector('.vr447-menu-head')) {
      const head = document.createElement('div');
      head.className = 'vr447-menu-head';
      head.innerHTML = '<strong>Menu</strong><button type="button" class="vr447-menu-close" data-vr447-menu-close>Fechar ×</button>';
      sidebar.insertBefore(head, sidebar.firstChild);
    }
    const close = sidebar.querySelector('[data-vr447-menu-close]');
    if (close && !close.dataset.bound447) { close.dataset.bound447 = '1'; close.addEventListener('click', closeMenu); }
    const open = document.querySelector('[data-menu-open]');
    if (open && !open.dataset.bound447) {
      open.dataset.bound447 = '1';
      open.addEventListener('click', function (event) { event.preventDefault(); event.stopImmediatePropagation(); openMenu(); }, true);
    }
    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.bound447) { shadow.dataset.bound447 = '1'; shadow.addEventListener('click', closeMenu); }
    sidebar.querySelectorAll('a[data-nav]').forEach(a => {
      if (!a.dataset.bound447) { a.dataset.bound447 = '1'; a.addEventListener('click', () => setTimeout(closeMenu, 80)); }
    });
  }
  function visibleNotices() {
    const notices = parse(localStorage.getItem('vitoriaRegia.full.v1.notices'), []);
    const r = role();
    return notices.filter(n => {
      if (!n) return false;
      if (r === 'morador') return n.public === true || n.publico === true || n.fromSyndic || /s[ií]ndico|aviso|comunicado/i.test(String(n.title || n.type || ''));
      return true;
    }).slice(0, 3);
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
  function action(icon, title, text, target) {
    return `<button class="vr447-action" type="button" data-vr447-go="${target}"><span>${icon}</span><b>${escapeHTML(title)}</b><small>${escapeHTML(text)}</small></button>`;
  }
  function renderDashboard() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"]');
    if (!dash) return;
    dash.classList.add('vr447-dashboard-ready');
    let home = dash.querySelector('.vr447-home');
    if (home) return;
    const r = role();
    let subtitle = 'Acesso rápido às principais funções.';
    let actions = '';
    if (r === 'morador') {
      subtitle = 'Acesse suas reservas, encomendas, financeiro da sua unidade e perfil.';
      actions = [action('📅','Reservas','Solicitar ou consultar.','reservas'), action('💳','Financeiro morador','Somente sua unidade.','financeiro'), action('📦','Encomendas','Suas entregas.','encomendas'), action('👤','Meu perfil','Dados e senha.','meu-cadastro')].join('');
    } else if (r === 'portaria') {
      subtitle = 'Acesso rápido à rotina da portaria.';
      actions = [action('📦','Encomendas','Registrar entrega.','encomendas'), action('👥','Visitantes','Controle de acesso.','visitantes-recorrentes'), action('🚨','Emergências','Ações rápidas.','automacoes'), action('👤','Meu perfil','Dados e senha.','meu-cadastro')].join('');
    } else {
      subtitle = 'Acesso rápido da administração e síndico.';
      actions = [action('🔔','Pendências','Aprovações e avisos.','aprovacoes'), action('💰','Financeiro','Admin e morador.','financeiro'), action('⚙️','Configurações','Canais e sistema.','configuracoes'), action('⬆️','Atualização','Enviar ZIP do sistema.','configuracoes'), action('👤','Meu perfil','Dados e senha.','meu-cadastro')].join('');
    }
    const notices = visibleNotices();
    const noticesHtml = `<div class="vr447-notices"><h3>🔔 Avisos do síndico</h3>${notices.length ? notices.map(n => `<div class="vr447-notice"><b>${escapeHTML(n.title || 'Aviso')}</b><br>${escapeHTML(n.message || n.text || '')}</div>`).join('') : '<div class="vr447-notice">Nenhum aviso importante no momento.</div>'}</div>`;
    home = document.createElement('section');
    home.className = 'vr447-home';
    home.innerHTML = `<div class="vr447-greeting"><h2>${greeting()}, ${escapeHTML(firstName())}.</h2><p>${escapeHTML(subtitle)}</p></div>${noticesHtml}<div class="vr447-actions">${actions}</div>`;
    dash.insertBefore(home, dash.firstChild);
    home.querySelectorAll('[data-vr447-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr447-go'))));
  }
  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr447-field"><span>${escapeHTML(label)}</span><input type="${type}" data-vr447-setting="${key}" placeholder="${escapeHTML(placeholder)}"></div>`;
  }
  function configHtml() {
    return `
      <div class="vr447-settings" id="vr447-settings">
        <div class="vr447-settings-hero"><h2>Configurações do sistema</h2><p>Área premium organizada por setores. Dados sensíveis ficam no Render e não aparecem no GitHub.</p></div>
        <div class="vr447-tabs">
          <button class="vr447-tab is-active" data-vr447-tab="geral">Geral</button>
          <button class="vr447-tab" data-vr447-tab="canais">Canais</button>
          <button class="vr447-tab" data-vr447-tab="atualizacao">Atualização</button>
          <button class="vr447-tab" data-vr447-tab="permissoes">Permissões</button>
          <button class="vr447-tab" data-vr447-tab="financeiro">Financeiro</button>
          <button class="vr447-tab" data-vr447-tab="emergencias">Emergências</button>
          <button class="vr447-tab" data-vr447-tab="apps">Apps/Ajuda</button>
        </div>
        <div class="vr447-panel is-active" data-vr447-panel="geral"><h3>Visão geral</h3><p>Use as subabas para configurar canais, atualização, permissões, financeiro, emergência e ajuda.</p><div class="vr447-grid"><div class="vr447-card"><h3>Versão</h3><p><b>${VERSION}</b></p></div><div class="vr447-card"><h3>Segurança</h3><p>Tokens, senhas e chaves devem ficar apenas no Render → Environment Variables.</p></div></div></div>
        <div class="vr447-panel" data-vr447-panel="canais"><h3>Canais de comunicação</h3><p>Configure e teste os canais usando os dados salvos no Render. Campos sensíveis ficam ocultos.</p><div class="vr447-grid"><div class="vr447-card"><h3>Telegram</h3>${field('Usuário do bot','telegramBotUsername','text','ex.: vitoriaregia_bot')}${field('Chat ID de teste','telegramTestChatId','text','opcional')}<div class="vr447-note">O token do Telegram deve ficar no Render como TELEGRAM_BOT_TOKEN.</div><button class="vr447-btn" type="button" data-vr447-test="telegram">Testar Telegram</button></div><div class="vr447-card"><h3>E-mail</h3>${field('E-mail de teste','emailTestTo','email','ex.: seuemail@dominio.com')}<div class="vr447-note">SMTP/MailerSend devem ficar no Render. O sistema não mostra senhas aqui.</div><button class="vr447-btn" type="button" data-vr447-test="email">Testar e-mail</button></div><div class="vr447-card"><h3>WhatsApp / Periskope</h3>${field('WhatsApp de teste','whatsappTestTo','text','ex.: 5561999999999')}<div class="vr447-note">PERISKOPE_ID e PERISKOPE_API_KEY devem ficar no Render.</div><button class="vr447-btn" type="button" data-vr447-test="whatsapp">Testar WhatsApp</button></div><div class="vr447-card"><h3>Diagnóstico</h3><div class="vr447-status" data-vr447-channel-status>Selecione um teste para verificar o canal.</div></div></div></div>
        <div class="vr447-panel" data-vr447-panel="atualizacao"><h3>Atualização do sistema</h3><p>Envie o ZIP limpo gerado nesta conversa. O backend enviará para o GitHub usando GITHUB_UPDATE_TOKEN salvo no Render.</p><div class="vr447-grid"><div class="vr447-card"><h3>Enviar ZIP</h3><p>Arquivo esperado para esta versão: <b>${EXPECTED_ZIP}</b></p><input type="file" accept=".zip,application/zip" data-vr447-update-file><div class="vr447-progress"><span data-vr447-progress></span></div><div class="vr447-status" data-vr447-update-status>Selecione o ZIP para iniciar.</div><div class="vr447-actions-row"><button class="vr447-btn primary" type="button" data-vr447-send-update>Enviar atualização</button><button class="vr447-btn" type="button" data-vr447-check-version>Conferir versão</button></div></div><div class="vr447-card"><h3>Render</h3><p>Após enviar ao GitHub, use deploy hook ou faça Clear build cache & deploy.</p><div class="vr447-note">Variáveis necessárias no Render: GITHUB_UPDATE_TOKEN, GITHUB_REPOSITORY, GITHUB_BRANCH e opcionalmente RENDER_DEPLOY_HOOK_URL.</div></div></div></div>
        <div class="vr447-panel" data-vr447-panel="permissoes"><h3>Permissões por perfil</h3><div class="vr447-grid"><div class="vr447-card"><h3>Morador</h3><p>Reservas, encomendas, avisos públicos, financeiro da própria unidade e perfil.</p></div><div class="vr447-card"><h3>Financeiro morador</h3><p>Permissão separada. Não libera o financeiro administrativo do prédio.</p></div><div class="vr447-card"><h3>Síndico/Admin</h3><p>Administração, configuração, usuários, financeiro, boletos, canais e atualização.</p></div><div class="vr447-card"><h3>Portaria/Funcionários</h3><p>Fluxos operacionais sem necessidade de unidade vinculada.</p></div></div></div>
        <div class="vr447-panel" data-vr447-panel="financeiro"><h3>Financeiro e boletos</h3><div class="vr447-grid"><div class="vr447-card"><h3>Financeiro administrativo</h3><p>Restrito ao síndico/administração.</p></div><div class="vr447-card"><h3>Financeiro morador</h3><p>Morador vê somente dados da própria unidade ou informações publicadas.</p></div><div class="vr447-card"><h3>Banco/boletos</h3><p>Credenciais de banco ou Asaas ficam no Render.</p></div><div class="vr447-card"><h3>Relatórios</h3><p>Despesas fixas e emergenciais podem ser resumidas no boleto.</p></div></div></div>
        <div class="vr447-panel" data-vr447-panel="emergencias"><h3>Emergências</h3><div class="vr447-grid"><div class="vr447-card"><h3>Botões rápidos</h3><p>Emergência médica, gás, água, energia, elevador e segurança.</p></div><div class="vr447-card"><h3>Sem checkbox</h3><p>A interface deve ser simples para idosos e crianças.</p></div><div class="vr447-card"><h3>Elevador</h3><p>Cadastre contato da assistência do elevador no Render ou na gestão interna.</p></div><div class="vr447-card"><h3>Notificação</h3><p>Alertas críticos usam app, Telegram, e-mail e WhatsApp conforme canais configurados.</p></div></div></div>
        <div class="vr447-panel" data-vr447-panel="apps"><h3>Apps e ajuda</h3><div class="vr447-grid"><div class="vr447-card"><h3>Aplicativos</h3><p>Links de APK, PWA/iOS e QR codes ficam na aba Apps/Ajuda.</p></div><div class="vr447-card"><h3>Manuais</h3><p>Manuais e vídeos seguem separados por perfil na aba Ajuda.</p></div></div></div>
      </div>`;
  }
  function ensureConfig() {
    if (!logged() || !allowedAdmin()) return;
    const section = document.querySelector('#configuracoes[data-section], [data-section="configuracoes"], [data-page="configuracoes"]');
    if (!section) return;
    section.classList.add('vr447-config-ready');
    if (!section.querySelector('.vr447-settings')) {
      const wrap = document.createElement('div'); wrap.innerHTML = configHtml();
      section.insertBefore(wrap.firstElementChild, section.firstChild);
      bindConfig(section.querySelector('.vr447-settings'));
    }
  }
  function bindConfig(root) {
    if (!root) return;
    root.querySelectorAll('[data-vr447-tab]').forEach(tab => tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-vr447-tab');
      root.querySelectorAll('[data-vr447-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
      root.querySelectorAll('[data-vr447-panel]').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-vr447-panel') === name));
    }));
    root.querySelectorAll('[data-vr447-test]').forEach(btn => btn.addEventListener('click', async () => {
      const channel = btn.getAttribute('data-vr447-test');
      const status = root.querySelector('[data-vr447-channel-status]');
      const body = {};
      root.querySelectorAll('[data-vr447-setting]').forEach(input => { if (input.value) body[input.getAttribute('data-vr447-setting')] = input.value; });
      status.textContent = 'Testando ' + channel + '...';
      try {
        const res = await fetch('/api/admin/channels/test/' + channel, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha no teste.');
        status.textContent = '✅ ' + (data.message || 'Teste concluído.');
      } catch (error) { status.textContent = '⚠️ ' + error.message; }
    }));
    const file = root.querySelector('[data-vr447-update-file]');
    const send = root.querySelector('[data-vr447-send-update]');
    const bar = root.querySelector('[data-vr447-progress]');
    const status = root.querySelector('[data-vr447-update-status]');
    function progress(p, msg) { if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%'; if (msg && status) status.innerHTML = msg; }
    file?.addEventListener('change', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Nenhum arquivo selecionado.');
      if (selected.name === EXPECTED_ZIP) progress(5, '✅ Arquivo correto selecionado: <b>' + escapeHTML(selected.name) + '</b>.');
      else progress(0, '⚠️ Arquivo selecionado: <b>' + escapeHTML(selected.name) + '</b>. O esperado é <b>' + EXPECTED_ZIP + '</b>.');
    });
    send?.addEventListener('click', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Selecione o ZIP antes de enviar.');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/system/upload-update?filename=' + encodeURIComponent(selected.name));
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.upload.onprogress = event => { if (event.lengthComputable) { const pct = Math.round((event.loaded / event.total) * 35); progress(pct, 'Enviando ZIP... ' + pct + '%'); } };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) progress(45, 'Validando ZIP no servidor...');
        if (xhr.readyState === 3) progress(78, 'Atualizando GitHub e preparando deploy...');
        if (xhr.readyState === 4) {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) progress(100, '✅ Atualização enviada. ' + (data.deployTriggered ? 'Deploy acionado.' : 'Faça Clear build cache & deploy no Render, se necessário.'));
            else progress(0, '❌ ' + (data.error || 'Falha na atualização.'));
          } catch (_) { progress(0, '❌ Resposta inválida do servidor.'); }
        }
      };
      xhr.onerror = () => progress(0, '❌ Erro de conexão no envio.');
      progress(10, 'Iniciando atualização...');
      xhr.send(selected);
    });
    root.querySelector('[data-vr447-check-version]')?.addEventListener('click', () => {
      document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => el.textContent = VERSION);
      progress(0, 'Versão exibida no rodapé: <b>' + VERSION + '</b>.');
    });
  }
  function updateFooter() { document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => { if (el.textContent !== VERSION) el.textContent = VERSION; }); }
  function runNow() {
    if (!logged()) { updateFooter(); return; }
    setRoleClass(); ensureMenu(); renderDashboard(); ensureConfig(); updateFooter();
  }
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; runNow(); }, 250); }
  document.addEventListener('DOMContentLoaded', runNow);
  window.addEventListener('load', runNow);
  window.addEventListener('hashchange', () => setTimeout(runNow, 100));
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
