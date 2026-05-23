
// Vitória Régia v4.5.1 — ajustes finais de emergência, menu, configurações e versão
(function () {
  const VERSION_FALLBACK = 'v4.5.1';
  let DISPLAY_VERSION = 'v4.5.1-premium-ajustes-finais-sem-segredos';
  const EXPECTED_ZIP = 'vitoriaregia_update_v4.5.1.zip';
  let channelSettings = null;
  let asaasSettings = null;
  let scheduled = false;

  function parse(value, fallback) { if (!value) return fallback; try { return JSON.parse(value); } catch (_) { return fallback; } }
  function norm(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
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
  function allowedAdmin() { return ['owner','admin','sindico'].includes(role()); }
  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  async function loadVersion() {
    try {
      const res = await fetch('VERSION.json?ts=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data && data.version) DISPLAY_VERSION = data.version + '-premium-ajustes-finais-sem-segredos';
    } catch (_) {
      DISPLAY_VERSION = VERSION_FALLBACK + '-premium-ajustes-finais-sem-segredos';
    }
    updateVersionUI();
  }

  function updateVersionUI() {
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      if (el.textContent !== DISPLAY_VERSION) el.textContent = DISPLAY_VERSION;
    });

    document.querySelectorAll('.vr443-login-version,.vr446-login-version').forEach(el => el.remove());

    if (!logged()) {
      document.body.classList.add('auth-locked');
      let el = document.querySelector('.vr451-login-version');
      if (!el) {
        el = document.createElement('div');
        el.className = 'vr451-login-version';
        el.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(el);
      }
      const strong = el.querySelector('strong');
      if (strong) strong.textContent = DISPLAY_VERSION;
      el.style.display = 'block';
    } else {
      document.body.classList.remove('auth-locked');
      document.querySelectorAll('.vr451-login-version').forEach(el => el.style.display = 'none');
    }
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open','no-scroll');
    document.querySelector('[data-sidebar]')?.classList.remove('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.remove('is-open');
  }
  function openMenu() {
    document.body.classList.add('sidebar-open','no-scroll');
    document.querySelector('[data-sidebar]')?.classList.add('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.add('is-open');
  }
  function go(target) {
    if (!target) return;
    const real = target === 'visitantes' ? 'visitantes-recorrentes' : target;
    const nav = document.querySelector(`[href="#${real}"][data-nav]`);
    if (nav) nav.click();
    else {
      document.querySelectorAll('[data-section], .section').forEach(sec => sec.classList.toggle('is-active', sec.id === real));
      location.hash = real;
    }
    closeMenu();
    setTimeout(runNow, 120);
  }

  function fixMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    if (!sidebar) return;

    sidebar.querySelectorAll('.vr440-menu-head,.vr441-menu-head,.vr442-menu-head,.vr447-menu-head,.vr450-menu-head').forEach(el => el.remove());

    if (!sidebar.querySelector('[data-vr451-menu-close]')) {
      const btn = document.createElement('button');
      btn.className = 'vr451-menu-close-floating';
      btn.type = 'button';
      btn.setAttribute('data-vr451-menu-close', 'true');
      btn.setAttribute('aria-label', 'Fechar menu');
      btn.textContent = '×';
      sidebar.insertBefore(btn, sidebar.firstChild);
    }

    const close = sidebar.querySelector('[data-vr451-menu-close]');
    if (close && !close.dataset.bound451) {
      close.dataset.bound451 = '1';
      close.addEventListener('click', closeMenu);
    }

    const open = document.querySelector('[data-menu-open]');
    if (open && !open.dataset.bound451) {
      open.dataset.bound451 = '1';
      open.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMenu();
      }, true);
    }

    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.bound451) {
      shadow.dataset.bound451 = '1';
      shadow.addEventListener('click', closeMenu);
    }

    sidebar.querySelectorAll('a[data-nav]').forEach(a => {
      if (!a.dataset.bound451) {
        a.dataset.bound451 = '1';
        a.addEventListener('click', () => setTimeout(closeMenu, 80));
      }
    });
  }

  function fixEmergency() {
    document.querySelectorAll('.vr-emergency-user-card').forEach(el => el.remove());

    document.querySelectorAll('.vr-emergency-type').forEach(card => {
      const input = card.querySelector('input[type="radio"], input[type="checkbox"]');
      if (!input) return;

      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      function refresh() {
        document.querySelectorAll('.vr-emergency-type').forEach(c => c.classList.remove('is-selected'));
        if (input.checked) card.classList.add('is-selected');
      }

      if (!card.dataset.bound451) {
        card.dataset.bound451 = '1';
        card.addEventListener('click', event => {
          if (event.target !== input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          refresh();
        });
        card.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            card.click();
          }
        });
        input.addEventListener('change', refresh);
      }

      refresh();
    });
  }

  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr451-field"><span>${escapeHTML(label)}</span><input type="${type}" data-vr451-setting="${key}" placeholder="${escapeHTML(placeholder)}"></div>`;
  }
  function check(label, key) {
    return `<label class="vr451-check"><input type="checkbox" data-vr451-setting="${key}"><span>${escapeHTML(label)}</span></label>`;
  }

  function configHtml() {
    return `
    <div class="vr451-settings" id="vr451-settings">
      <div class="vr451-hero"><h2>Configurações premium</h2><p>Cada item em sua própria aba: canais, boleto, atualização, permissões, emergência, apps e ajuda.</p></div>
      <div class="vr451-tabs">
        <button class="vr451-tab is-active" data-vr451-tab="geral">Geral</button>
        <button class="vr451-tab" data-vr451-tab="telegram">Telegram</button>
        <button class="vr451-tab" data-vr451-tab="email">E-mail</button>
        <button class="vr451-tab" data-vr451-tab="whatsapp">WhatsApp</button>
        <button class="vr451-tab" data-vr451-tab="boleto">Boleto/Banco</button>
        <button class="vr451-tab" data-vr451-tab="atualizacao">Atualização</button>
        <button class="vr451-tab" data-vr451-tab="permissoes">Permissões</button>
        <button class="vr451-tab" data-vr451-tab="emergencia">Emergência</button>
        <button class="vr451-tab" data-vr451-tab="apps">Apps/Ajuda</button>
      </div>

      <div class="vr451-panel is-active" data-vr451-panel="geral">
        <h3>Geral</h3>
        <div class="vr451-grid">
          <div class="vr451-card"><h3>Versão do sistema</h3><p><b data-vr451-version>${DISPLAY_VERSION}</b></p><p>A tela de login usa a mesma versão do VERSION.json.</p></div>
          <div class="vr451-card"><h3>Segurança</h3><p>Atualização sem dados sensíveis. Tokens e senhas ficam no Render ou são salvos pelo backend.</p></div>
          <div class="vr451-card"><h3>Organização</h3><p>Cadastros ficam em Cadastros. Configurações ficam aqui, separadas por finalidade.</p></div>
          <div class="vr451-card"><h3>Compatibilidade</h3><p>Menu lateral ajustado para Chrome, Edge, celular e PC.</p></div>
        </div>
      </div>

      <div class="vr451-panel" data-vr451-panel="telegram">
        <h3>Telegram</h3>
        <p>Configure o bot, chat de teste e teste o envio. O token não aparece depois de salvo.</p>
        <div class="vr451-grid">
          <div class="vr451-card">
            ${check('Ativar Telegram', 'telegramEnabled')}
            ${field('Usuário do bot', 'telegramBotUsername', 'text', 'ex.: vitoriaregia_bot')}
            ${field('Token do bot', 'telegramBotToken', 'password', 'preencha apenas para alterar')}
            ${field('Chat ID padrão', 'telegramDefaultChatId', 'text', 'opcional')}
            ${field('Chat ID de teste', 'telegramTestChatId', 'text', 'opcional')}
            <div class="vr451-actions"><button class="vr451-btn primary" type="button" data-vr451-save="channels">Salvar Telegram</button><button class="vr451-btn" type="button" data-vr451-test="telegram">Testar Telegram</button></div>
          </div>
          <div class="vr451-card"><h3>Orientação ao usuário</h3><p>O morador precisa abrir o bot e tocar em Iniciar para o sistema conseguir enviar mensagens privadas.</p><div class="vr451-status" data-vr451-channel-status>Pronto para testar.</div></div>
        </div>
      </div>

      <div class="vr451-panel" data-vr451-panel="email">
        <h3>E-mail / SMTP</h3>
        <p>Configure SMTP ou MailerSend sem colocar senhas no GitHub.</p>
        <div class="vr451-grid">
          <div class="vr451-card">
            ${check('Ativar e-mail', 'emailEnabled')}
            ${field('Host SMTP', 'smtpHost', 'text', 'ex.: smtp.mailersend.net')}
            ${field('Porta SMTP', 'smtpPort', 'text', 'ex.: 587')}
            ${field('Usuário SMTP', 'smtpUser', 'text', 'usuário do SMTP')}
            ${field('Senha SMTP', 'smtpPassword', 'password', 'preencha apenas para alterar')}
            ${field('Remetente', 'emailFrom', 'text', 'Nome <email@dominio.com>')}
            ${field('E-mail de teste', 'emailTestTo', 'email', 'destino do teste')}
            <div class="vr451-actions"><button class="vr451-btn primary" type="button" data-vr451-save="channels">Salvar e-mail</button><button class="vr451-btn" type="button" data-vr451-test="email">Testar e-mail</button></div>
          </div>
          <div class="vr451-card"><h3>Diagnóstico</h3><div class="vr451-status" data-vr451-email-status>Salve ou teste o e-mail.</div></div>
        </div>
      </div>

      <div class="vr451-panel" data-vr451-panel="whatsapp">
        <h3>WhatsApp / Periskope</h3>
        <p>Configure o provedor de WhatsApp e número de teste.</p>
        <div class="vr451-grid">
          <div class="vr451-card">
            ${check('Ativar WhatsApp', 'whatsappEnabled')}
            ${field('Provedor', 'whatsappProvider', 'text', 'Periskope')}
            ${field('Periskope ID', 'periskopeId', 'text', 'preencha o ID')}
            ${field('URL da API', 'periskopeApiUrl', 'text', 'URL da API')}
            ${field('Token/API Key', 'periskopeToken', 'password', 'preencha apenas para alterar')}
            ${field('WhatsApp de teste', 'whatsappTestTo', 'text', '5561999999999')}
            <div class="vr451-actions"><button class="vr451-btn primary" type="button" data-vr451-save="channels">Salvar WhatsApp</button><button class="vr451-btn" type="button" data-vr451-test="whatsapp">Testar WhatsApp</button></div>
          </div>
          <div class="vr451-card"><h3>Diagnóstico</h3><div class="vr451-status" data-vr451-whatsapp-status>Salve ou teste o WhatsApp.</div></div>
        </div>
      </div>

      <div class="vr451-panel" data-vr451-panel="boleto">
        <h3>Boleto / Banco</h3>
        <p>Integração de boletos e regras financeiras para reservas e cobranças.</p>
        <div class="vr451-grid">
          <div class="vr451-card">
            ${check('Ativar emissão de boleto', 'asaasEnabled')}
            <div class="vr451-field"><span>Ambiente</span><select data-vr451-asaas="environment"><option value="sandbox">Sandbox/teste</option><option value="production">Produção</option></select></div>
            ${field('API Key do banco/Asaas', 'asaasApiKey', 'password', 'preencha apenas para alterar')}
            ${field('Dias antes da reserva para vencer', 'dueDaysBeforeReservation', 'number', '2')}
            ${field('Multa (%)', 'fineValue', 'number', '2')}
            ${field('Juros (%)', 'interestValue', 'number', '1')}
            ${check('Enviar notificações de boleto', 'notificationEnabled')}
            <div class="vr451-actions"><button class="vr451-btn primary" type="button" data-vr451-save-asaas>Salvar boleto</button><button class="vr451-btn" type="button" data-vr451-test-asaas>Testar integração</button></div>
          </div>
          <div class="vr451-card"><h3>Status do boleto</h3><div class="vr451-status" data-vr451-asaas-status>Carregando configuração de boletos...</div><div class="vr451-note">A chave do banco/Asaas não aparece depois de salva.</div></div>
        </div>
      </div>

      <div class="vr451-panel" data-vr451-panel="atualizacao">
        <h3>Atualização do sistema</h3>
        <p>Envie o ZIP limpo gerado nesta conversa. O backend usa GITHUB_UPDATE_TOKEN salvo no Render.</p>
        <div class="vr451-grid">
          <div class="vr451-card">
            <h3>Enviar ZIP</h3>
            <p>Esperado: <b>${EXPECTED_ZIP}</b></p>
            <input type="file" accept=".zip,application/zip" data-vr451-update-file>
            <div class="vr451-progress"><span data-vr451-progress></span></div>
            <div class="vr451-status" data-vr451-update-status>Selecione o ZIP.</div>
            <div class="vr451-actions"><button class="vr451-btn primary" type="button" data-vr451-send-update>Enviar atualização</button><button class="vr451-btn" type="button" data-vr451-check-version>Conferir versão</button></div>
          </div>
          <div class="vr451-card"><h3>Pré-requisitos</h3><p>Render: GITHUB_UPDATE_TOKEN, GITHUB_REPOSITORY, GITHUB_BRANCH e opcional RENDER_DEPLOY_HOOK_URL.</p><div class="vr451-note">O token nunca fica no ZIP.</div></div>
        </div>
      </div>

      <div class="vr451-panel" data-vr451-panel="permissoes"><h3>Permissões</h3><div class="vr451-grid"><div class="vr451-card"><h3>Morador</h3><p>Perfil, reservas, encomendas, avisos públicos e financeiro da própria unidade.</p></div><div class="vr451-card"><h3>Financeiro morador</h3><p>Separado do financeiro administrativo.</p></div><div class="vr451-card"><h3>Síndico/Admin</h3><p>Cadastros, configurações, atualização, boletos e financeiro.</p></div><div class="vr451-card"><h3>Portaria/equipe</h3><p>Usuário sem unidade vinculada para administração, portaria, zeladoria e limpeza.</p></div></div></div>
      <div class="vr451-panel" data-vr451-panel="emergencia"><h3>Emergência</h3><div class="vr451-grid"><div class="vr451-card"><h3>Interface limpa</h3><p>Sem checkbox/bolinha e sem exibir usuário, perfil ou unidade no modal.</p></div><div class="vr451-card"><h3>Tipos</h3><p>Médica, água, gás, elevador, segurança e outra emergência.</p></div><div class="vr451-card"><h3>Escala</h3><p>O sistema deve priorizar porteiros do turno conforme cadastro de escala.</p></div><div class="vr451-card"><h3>Canais</h3><p>App, Telegram, e-mail e WhatsApp, conforme configuração.</p></div></div></div>
      <div class="vr451-panel" data-vr451-panel="apps"><h3>Apps e ajuda</h3><div class="vr451-grid"><div class="vr451-card"><h3>Downloads</h3><p>APK, PWA/iOS e QR codes.</p><div class="vr451-actions"><button class="vr451-btn primary" data-vr451-go="app-android">Abrir apps</button></div></div><div class="vr451-card"><h3>Manuais</h3><p>Manuais e vídeos por perfil.</p><div class="vr451-actions"><button class="vr451-btn primary" data-vr451-go="manual">Abrir ajuda</button></div></div></div></div>
    </div>`;
  }

  function ensureConfig() {
    if (!logged() || !allowedAdmin()) return;
    const section = document.querySelector('#configuracoes[data-section], [data-section="configuracoes"], [data-page="configuracoes"]');
    if (!section) return;

    section.classList.remove('vr447-config-ready', 'vr450-config-ready');
    section.classList.add('vr451-config-ready');

    section.querySelectorAll('.vr447-settings,.vr450-settings').forEach(el => el.remove());

    if (!section.querySelector('.vr451-settings')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = configHtml();
      section.insertBefore(wrap.firstElementChild, section.firstChild);
      bindConfig(section.querySelector('.vr451-settings'));
      loadChannels();
      loadAsaas();
    }
  }

  function bindConfig(root) {
    root.querySelectorAll('[data-vr451-tab]').forEach(tab => tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-vr451-tab');
      root.querySelectorAll('[data-vr451-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
      root.querySelectorAll('[data-vr451-panel]').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-vr451-panel') === name));
    }));

    root.querySelectorAll('[data-vr451-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr451-go'))));
    root.querySelectorAll('[data-vr451-save="channels"]').forEach(btn => btn.addEventListener('click', saveChannels));
    root.querySelectorAll('[data-vr451-test]').forEach(btn => btn.addEventListener('click', () => testChannel(btn.getAttribute('data-vr451-test'))));
    root.querySelector('[data-vr451-save-asaas]')?.addEventListener('click', saveAsaas);
    root.querySelector('[data-vr451-test-asaas]')?.addEventListener('click', testAsaas);
    bindUpdate(root);
  }

  function inputValue(key) {
    const el = document.querySelector(`[data-vr451-setting="${key}"]`);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function setInput(key, value, sensitive = false) {
    const el = document.querySelector(`[data-vr451-setting="${key}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else if (sensitive) {
      el.value = '';
      el.placeholder = value ? 'já configurado — preencha apenas para alterar' : 'preencha para configurar';
    } else {
      el.value = value ?? '';
    }
  }

  async function loadChannels() {
    try {
      const res = await fetch('/api/admin/channels/settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar canais.');
      channelSettings = data.settings || {};
      setInput('telegramEnabled', channelSettings.telegramEnabled);
      setInput('telegramBotUsername', channelSettings.telegramBotUsername);
      setInput('telegramBotToken', channelSettings.telegramBotToken, true);
      setInput('telegramDefaultChatId', channelSettings.telegramDefaultChatId);
      setInput('telegramTestChatId', channelSettings.telegramTestChatId);
      setInput('emailEnabled', channelSettings.emailEnabled);
      setInput('smtpHost', channelSettings.smtpHost);
      setInput('smtpPort', channelSettings.smtpPort);
      setInput('smtpUser', channelSettings.smtpUser);
      setInput('smtpPassword', channelSettings.smtpPassword, true);
      setInput('emailFrom', channelSettings.emailFrom);
      setInput('emailTestTo', channelSettings.emailTestTo);
      setInput('whatsappEnabled', channelSettings.whatsappEnabled);
      setInput('whatsappProvider', channelSettings.whatsappProvider);
      setInput('periskopeId', channelSettings.periskopeId);
      setInput('periskopeApiUrl', channelSettings.periskopeApiUrl);
      setInput('periskopeToken', channelSettings.periskopeToken, true);
      setInput('whatsappTestTo', channelSettings.whatsappTestTo);
      setStatus('channel', '✅ Configurações carregadas.');
    } catch (error) {
      setStatus('channel', '⚠️ ' + error.message);
    }
  }

  async function saveChannels() {
    const next = { ...(channelSettings || {}) };
    const keys = ['telegramEnabled','telegramBotUsername','telegramDefaultChatId','telegramTestChatId','emailEnabled','smtpHost','smtpPort','smtpUser','emailFrom','emailTestTo','whatsappEnabled','whatsappProvider','periskopeId','periskopeApiUrl','whatsappTestTo'];
    keys.forEach(k => { const value = inputValue(k); if (value !== undefined) next[k] = value; });

    const sensitive = ['telegramBotToken','smtpPassword','periskopeToken'];
    sensitive.forEach(k => {
      const value = inputValue(k);
      if (value) next[k] = value;
    });

    setStatus('channel', 'Salvando configurações...');
    try {
      const res = await fetch('/api/admin/channels/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(next) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha ao salvar.');
      channelSettings = data.settings || next;
      await loadChannels();
      setStatus('channel', '✅ Configurações salvas.');
    } catch (error) {
      setStatus('channel', '⚠️ ' + error.message);
    }
  }

  async function testChannel(channel) {
    const body = { ...(channelSettings || {}) };
    ['telegramTestChatId','emailTestTo','whatsappTestTo','telegramBotUsername','telegramDefaultChatId'].forEach(k => {
      const value = inputValue(k);
      if (value) body[k] = value;
    });
    setStatus('channel', 'Testando ' + channel + '...');
    try {
      const res = await fetch('/api/admin/channels/test/' + channel, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha no teste.');
      setStatus('channel', '✅ ' + (data.message || 'Teste concluído.'));
    } catch (error) {
      setStatus('channel', '⚠️ ' + error.message);
    }
  }

  function setStatus(kind, msg) {
    const selectors = {
      channel: '[data-vr451-channel-status], [data-vr451-email-status], [data-vr451-whatsapp-status]',
      asaas: '[data-vr451-asaas-status]'
    };
    document.querySelectorAll(selectors[kind] || selectors.channel).forEach(el => el.textContent = msg);
  }

  function getAsaasField(key) {
    const el = document.querySelector(`[data-vr451-asaas="${key}"], [data-vr451-setting="${key}"]`);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function setAsaasField(key, value, sensitive = false) {
    const el = document.querySelector(`[data-vr451-asaas="${key}"], [data-vr451-setting="${key}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else if (sensitive) {
      el.value = '';
      el.placeholder = value ? 'já configurado — preencha apenas para alterar' : 'preencha para configurar';
    } else {
      el.value = value ?? '';
    }
  }

  async function loadAsaas() {
    try {
      const res = await fetch('/api/integrations/asaas', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar boletos.');
      asaasSettings = data.config || {};
      setAsaasField('asaasEnabled', asaasSettings.enabled);
      setAsaasField('environment', asaasSettings.environment || 'sandbox');
      setAsaasField('asaasApiKey', asaasSettings.apiKeySaved, true);
      setAsaasField('dueDaysBeforeReservation', asaasSettings.dueDaysBeforeReservation);
      setAsaasField('fineValue', asaasSettings.fineValue);
      setAsaasField('interestValue', asaasSettings.interestValue);
      setAsaasField('notificationEnabled', asaasSettings.notificationEnabled);
      setStatus('asaas', '✅ Boleto carregado. Chave: ' + (asaasSettings.apiKeySaved ? 'configurada' : 'não configurada') + '.');
    } catch (error) {
      setStatus('asaas', '⚠️ ' + error.message);
    }
  }

  async function saveAsaas() {
    const next = {
      enabled: Boolean(getAsaasField('asaasEnabled')),
      environment: getAsaasField('environment') || 'sandbox',
      dueDaysBeforeReservation: Number(getAsaasField('dueDaysBeforeReservation') || 2),
      fineValue: Number(getAsaasField('fineValue') || 0),
      interestValue: Number(getAsaasField('interestValue') || 0),
      notificationEnabled: Boolean(getAsaasField('notificationEnabled'))
    };
    const key = getAsaasField('asaasApiKey');
    if (key) next.apiKey = key;

    setStatus('asaas', 'Salvando configuração de boleto...');
    try {
      const res = await fetch('/api/integrations/asaas', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(next) });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha ao salvar boletos.');
      asaasSettings = data.config || next;
      await loadAsaas();
      setStatus('asaas', '✅ Configuração de boleto salva.');
    } catch (error) {
      setStatus('asaas', '⚠️ ' + error.message);
    }
  }

  async function testAsaas() {
    setStatus('asaas', 'Testando integração de boleto...');
    try {
      const res = await fetch('/api/integrations/test-asaas', { method:'POST' });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha no teste.');
      setStatus('asaas', '✅ Integração ativa. Ambiente: ' + (data.environment || 'configurado') + '.');
    } catch (error) {
      setStatus('asaas', '⚠️ ' + error.message);
    }
  }

  function bindUpdate(root) {
    const file = root.querySelector('[data-vr451-update-file]');
    const send = root.querySelector('[data-vr451-send-update]');
    const bar = root.querySelector('[data-vr451-progress]');
    const status = root.querySelector('[data-vr451-update-status]');

    function progress(p, msg) {
      if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%';
      if (msg && status) status.innerHTML = msg;
    }

    file?.addEventListener('change', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Nenhum arquivo selecionado.');
      progress(selected.name === EXPECTED_ZIP ? 5 : 0, selected.name === EXPECTED_ZIP ? '✅ Arquivo correto selecionado.' : '⚠️ Nome diferente do esperado: ' + escapeHTML(selected.name));
    });

    send?.addEventListener('click', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Selecione o ZIP antes de enviar.');

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/system/upload-update?filename=' + encodeURIComponent(selected.name));
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 35);
          progress(pct, 'Enviando ZIP... ' + pct + '%');
        }
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) progress(45, 'Validando ZIP no servidor...');
        if (xhr.readyState === 3) progress(78, 'Atualizando GitHub e preparando deploy...');
        if (xhr.readyState === 4) {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
              progress(100, '✅ Atualização enviada. ' + (data.deployTriggered ? 'Deploy acionado.' : 'Faça Clear build cache & deploy no Render, se necessário.'));
            } else {
              progress(0, '❌ ' + (data.error || 'Falha na atualização.'));
            }
          } catch (_) {
            progress(0, '❌ Resposta inválida do servidor.');
          }
        }
      };
      xhr.onerror = () => progress(0, '❌ Erro de conexão.');
      progress(10, 'Iniciando atualização...');
      xhr.send(selected);
    });

    root.querySelector('[data-vr451-check-version]')?.addEventListener('click', () => {
      updateVersionUI();
      progress(0, 'Versão no rodapé e login: <b>' + DISPLAY_VERSION + '</b>.');
    });
  }

  function runNow() {
    updateVersionUI();
    if (!logged()) return;
    fixMenu();
    fixEmergency();
    ensureConfig();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      runNow();
    }, 200);
  }

  document.addEventListener('DOMContentLoaded', () => { loadVersion(); runNow(); });
  window.addEventListener('load', () => { loadVersion(); runNow(); });
  window.addEventListener('hashchange', () => setTimeout(runNow, 100));
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
