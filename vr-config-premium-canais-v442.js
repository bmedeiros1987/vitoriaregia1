
// Vitória Régia v4.4.2 — Configurações Premium, canais, atualização e menu
(function () {
  const VERSION = 'v4.4.2';
  const EXPECTED_ZIP = `vitoriaregia_update_${VERSION}.zip`;
  const EXPECTED_BASH = `enviar_vitoriaregia_termux_${VERSION}.sh`;

  const DEFAULT_CHANNELS = {
    telegramEnabled: true,
    telegramBotUsername: '',
    telegramBotToken: '',
    telegramParseMode: 'HTML',
    telegramDefaultChatId: '',
    telegramTestChatId: '',
    emailEnabled: true,
    smtpHost: "smtp.mailersend.net",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    emailFrom: '',
    emailTestTo: '',
    whatsappEnabled: true,
    whatsappProvider: 'Periskope',
    periskopeId: "",
    periskopeApiUrl: '',
    periskopeToken: '',
    whatsappTestTo: ''
  };

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function saveLocal(settings) {
    localStorage.setItem('vr442ChannelSettings', JSON.stringify(settings));
  }

  function localSettings() {
    return { ...DEFAULT_CHANNELS, ...parse(localStorage.getItem('vr442ChannelSettings'), {}) };
  }

  function norm(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function session() {
    const prefix = 'vitoriaRegia.full.v1.';
    return parse(localStorage.getItem(prefix + 'session'), null)
      || parse(localStorage.getItem('currentUser'), null)
      || parse(localStorage.getItem('user'), null)
      || {};
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

  function allowedSettings() {
    return ['owner', 'admin', 'sindico'].includes(role());
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  function setRoleClass() {
    document.body.classList.remove('vr-role-morador','vr-role-portaria','vr-role-limpeza','vr-role-zeladoria','vr-role-sindico','vr-role-admin','vr-role-owner');
    document.body.classList.add('vr-role-' + role());
  }

  function toast(message) {
    let box = document.querySelector('.vr442-toast');
    if (!box) {
      box = document.createElement('div');
      box.className = 'vr442-toast';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('is-open');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('is-open'), 3600);
  }

  async function getSettings() {
    try {
      const res = await fetch('/api/admin/channels/settings', { cache: 'no-store' });
      if (res.ok) return { ...DEFAULT_CHANNELS, ...(await res.json()).settings };
    } catch (_) {}
    return localSettings();
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha na operação.');
    return data;
  }

  function collectSettings(root) {
    const data = localSettings();
    root.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.getAttribute('data-setting');
      if (input.type === 'checkbox') data[key] = input.checked;
      else data[key] = input.value;
    });
    return data;
  }

  function fillSettings(root, settings) {
    root.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.getAttribute('data-setting');
      if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
      else input.value = settings[key] ?? '';
    });
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open', 'no-scroll');
    document.querySelector('[data-sidebar]')?.classList.remove('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.remove('is-open');
  }

  function openMenu() {
    const sidebar = document.querySelector('[data-sidebar]');
    document.body.classList.add('sidebar-open', 'no-scroll');
    sidebar?.classList.add('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.add('is-open');
  }

  function fixMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    if (!sidebar) return;

    sidebar.querySelectorAll('.vr440-menu-head,.vr441-menu-head,.vr442-menu-head').forEach(el => el.remove());

    const head = document.createElement('div');
    head.className = 'vr442-menu-head';
    head.innerHTML = '<strong>Menu</strong><button type="button" class="vr442-menu-close" data-vr442-menu-close>Fechar ×</button>';
    sidebar.insertBefore(head, sidebar.firstChild);

    const openBtn = document.querySelector('[data-menu-open]');
    if (openBtn && !openBtn.dataset.vr442) {
      openBtn.dataset.vr442 = '1';
      openBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openMenu();
      }, true);
    }

    head.querySelector('[data-vr442-menu-close]').addEventListener('click', closeMenu);

    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.vr442) {
      shadow.dataset.vr442 = '1';
      shadow.addEventListener('click', closeMenu);
    }

    sidebar.querySelectorAll('a[data-nav]').forEach(a => {
      if (!a.dataset.vr442) {
        a.dataset.vr442 = '1';
        a.addEventListener('click', () => setTimeout(closeMenu, 80));
      }
    });

    addSettingsMenuButton();
  }

  function addSettingsMenuButton() {
    if (!allowedSettings()) return;
    if (document.querySelector('[data-vr442-settings-menu]')) return;
    const nav = document.querySelector('[data-sidebar] .nav, .sidebar .nav, [data-sidebar] nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-vr442-settings-menu', 'true');
    btn.innerHTML = '<span>⚙️</span><span>Configurações premium</span>';
    btn.addEventListener('click', () => {
      const cfg = document.querySelector('[href="#configuracoes"], [data-route="configuracoes"], [data-nav][href="#configuracoes"]');
      if (cfg) cfg.click();
      else location.hash = 'configuracoes';
      setTimeout(() => {
        injectSettings();
        document.getElementById('vr442-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      closeMenu();
    });
    nav.appendChild(btn);
  }

  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr442-field"><span>${label}</span><input type="${type}" data-setting="${key}" placeholder="${placeholder}"></div>`;
  }

  function settingsHtml() {
    return `
      <section class="vr442-settings" id="vr442-settings">
        <div class="vr442-settings-hero">
          <h2>Configurações premium</h2>
          <p>Área organizada por setores para síndico e administração. Canais, atualização, permissões, banco, emergências e ajuda ficam separados.</p>
        </div>

        <div class="vr442-tabs">
          <button class="vr442-tab is-active" data-tab="geral">Geral</button>
          <button class="vr442-tab" data-tab="canais">Canais</button>
          <button class="vr442-tab" data-tab="atualizacao">Atualização</button>
          <button class="vr442-tab" data-tab="permissoes">Permissões</button>
          <button class="vr442-tab" data-tab="boletos">Banco/boletos</button>
          <button class="vr442-tab" data-tab="emergencias">Emergências</button>
          <button class="vr442-tab" data-tab="apps">Apps/Ajuda</button>
        </div>

        <div class="vr442-panel is-active" data-panel="geral">
          <h3>Visão geral</h3>
          <p>Use as subabas acima. Moradores e portaria não acessam esta área.</p>
          <div class="vr442-grid">
            <div class="vr442-card"><h3>Versão</h3><p><b>${VERSION}</b> — Configurações premium e canais de teste.</p></div>
            <div class="vr442-card"><h3>Privacidade</h3><p>Financeiro administrativo continua restrito. Morador vê apenas Financeiro morador.</p></div>
          </div>
        </div>

        <div class="vr442-panel" data-panel="canais">
          <h3>Canais de comunicação</h3>
          <p>Dados de teste preenchidos para o projeto piloto. Troque antes do uso definitivo.</p>
          <div class="vr442-grid">
            <div class="vr442-card">
              <h3>Telegram</h3>
              <label class="vr442-field"><span>Ativar Telegram</span><input type="checkbox" data-setting="telegramEnabled"></label>
              ${field('Usuário do bot', 'telegramBotUsername')}
              ${field('Token do bot', 'telegramBotToken')}
              ${field('Chat ID padrão', 'telegramDefaultChatId', 'text', 'opcional')}
              ${field('Chat ID de teste', 'telegramTestChatId', 'text', 'opcional')}
              <div class="vr442-actions"><button class="vr442-btn" data-test-channel="telegram">Testar Telegram</button></div>
            </div>

            <div class="vr442-card">
              <h3>E-mail SMTP</h3>
              <label class="vr442-field"><span>Ativar e-mail</span><input type="checkbox" data-setting="emailEnabled"></label>
              ${field('Servidor SMTP', 'smtpHost')}
              ${field('Porta', 'smtpPort')}
              ${field('Usuário SMTP', 'smtpUser')}
              ${field('Senha SMTP', 'smtpPassword', 'password')}
              ${field('Remetente', 'emailFrom')}
              ${field('E-mail de teste', 'emailTestTo', 'email', 'opcional')}
              <div class="vr442-actions"><button class="vr442-btn" data-test-channel="email">Testar e-mail</button></div>
            </div>

            <div class="vr442-card">
              <h3>WhatsApp / Periskope</h3>
              <label class="vr442-field"><span>Ativar WhatsApp</span><input type="checkbox" data-setting="whatsappEnabled"></label>
              ${field('Fornecedor', 'whatsappProvider')}
              ${field('ID Periskope', 'periskopeId')}
              ${field('URL da API Periskope', 'periskopeApiUrl', 'text', 'se houver')}
              ${field('Token/API Key Periskope', 'periskopeToken', 'password', 'se houver')}
              ${field('WhatsApp de teste', 'whatsappTestTo', 'text', 'opcional')}
              <div class="vr442-actions"><button class="vr442-btn" data-test-channel="whatsapp">Testar WhatsApp</button></div>
            </div>

            <div class="vr442-card">
              <h3>Diagnóstico</h3>
              <div class="vr442-status" data-channel-status>Salve ou teste os canais para ver o resultado aqui.</div>
              <div class="vr442-actions">
                <button class="vr442-btn primary" data-save-channels>Salvar canais</button>
                <button class="vr442-btn" data-load-channels>Recarregar</button>
              </div>
            </div>
          </div>
        </div>

        <div class="vr442-panel" data-panel="atualizacao">
          <h3>Atualização do sistema</h3>
          <p>Envie o ZIP gerado nesta conversa. O sistema valida e envia para o GitHub se o token estiver configurado no Render.</p>
          <div class="vr442-grid">
            <div class="vr442-card">
              <h3>Upload do ZIP</h3>
              <p>Arquivo esperado: <b>${EXPECTED_ZIP}</b></p>
              <input type="file" accept=".zip,application/zip" data-update-file>
              <div class="vr442-progress"><span data-update-progress></span></div>
              <div class="vr442-status" data-update-status>Selecione o ZIP para atualizar.</div>
              <div class="vr442-actions"><button class="vr442-btn primary" data-send-update>Enviar atualização</button></div>
            </div>
            <div class="vr442-card">
              <h3>Termux reserva</h3>
              <p>Se o upload pelo sistema falhar, use o bash versionado.</p>
              <a class="vr442-btn" href="${EXPECTED_BASH}" download>Baixar bash</a>
              <button class="vr442-btn warn" data-copy-termux>Copiar comandos Termux</button>
              <div class="vr442-status" data-termux-code style="display:none">cd /storage/emulated/0/Download<br>bash ${EXPECTED_BASH}</div>
            </div>
          </div>
        </div>

        <div class="vr442-panel" data-panel="permissoes">
          <h3>Permissões e perfis</h3>
          <div class="vr442-note"><b>Financeiro morador</b> é uma permissão separada. Ela libera somente boletos/cobranças da unidade e informações financeiras publicadas pelo síndico, sem abrir o financeiro do prédio.</div>
          <div class="vr442-grid">
            <div class="vr442-card"><h3>Morador</h3><p>Encomendas, reservas, avisos públicos, financeiro da própria unidade e perfil.</p></div>
            <div class="vr442-card"><h3>Síndico/administração</h3><p>Acesso administrativo, financeiro geral, boletos, permissões, canais e atualização.</p></div>
            <div class="vr442-card"><h3>Portaria</h3><p>Encomendas, visitantes, emergências e rotina operacional.</p></div>
            <div class="vr442-card"><h3>Funcionários sem unidade</h3><p>Administração, portaria, zeladoria e limpeza podem ser cadastrados sem unidade residencial.</p></div>
          </div>
        </div>

        <div class="vr442-panel" data-panel="boletos">
          <h3>Banco e boletos</h3>
          <div class="vr442-grid">
            <div class="vr442-card">${field('Banco/intermediador', 'bankProvider', 'text', 'ex.: banco, Asaas, Gerencianet')}${field('Chave/API de boletos', 'bankApiKey', 'password')}${field('Conta/convênio', 'bankAgreement')}</div>
            <div class="vr442-card">${field('Dia de vencimento mensal', 'boletoDueDay', 'number')}${field('Mensagem no boleto', 'boletoMessage')}<div class="vr442-note">O relatório pode incluir despesas fixas, emergenciais e observações do síndico.</div></div>
          </div>
        </div>

        <div class="vr442-panel" data-panel="emergencias">
          <h3>Emergências</h3>
          <div class="vr442-grid">
            <div class="vr442-card">${field('Assistência do elevador', 'elevatorCompany')}${field('Telefone elevador', 'elevatorPhone')}${field('WhatsApp elevador', 'elevatorWhatsapp')}</div>
            <div class="vr442-card">${field('Orientação padrão', 'emergencyGuidance')}${field('Som crítico', 'criticalSoundEnabled')}</div>
          </div>
        </div>

        <div class="vr442-panel" data-panel="apps">
          <h3>Apps e ajuda</h3>
          <div class="vr442-grid">
            <div class="vr442-card"><h3>Aplicativos</h3><p>Links de APK, iOS/PWA e Telegram ficam organizados aqui.</p></div>
            <div class="vr442-card"><h3>Manuais</h3><p>Manuais e vídeos da aba Ajuda continuam separados por perfil.</p></div>
          </div>
        </div>
      </section>
    `;
  }

  function settingsMount() {
    return document.querySelector('#configuracoes[data-section], [data-section="configuracoes"], [data-page="configuracoes"], main') || document.body;
  }

  async function injectSettings() {
    if (!logged() || !allowedSettings()) return;
    setRoleClass();

    const mount = settingsMount();
    if (!mount) return;

    if (!document.getElementById('vr442-settings')) {
      // Limpa visualmente a bagunça antiga de configurações, sem apagar dados.
      Array.from(mount.children).forEach(child => {
        if (!child.classList.contains('vr442-settings') && !child.matches('.topbar, header')) child.style.display = 'none';
      });
      const wrap = document.createElement('div');
      wrap.innerHTML = settingsHtml();
      mount.insertBefore(wrap.firstElementChild, mount.firstChild);
      bindSettings(document.getElementById('vr442-settings'));
    }

    const settings = await getSettings();
    fillSettings(document.getElementById('vr442-settings'), settings);
  }

  function bindSettings(root) {
    root.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-tab');
        root.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
        root.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-panel') === name));
      });
    });

    root.querySelector('[data-save-channels]')?.addEventListener('click', async () => {
      const data = collectSettings(root);
      saveLocal(data);
      try {
        await postJSON('/api/admin/channels/settings', data);
        root.querySelector('[data-channel-status]').innerHTML = '✅ Configurações salvas no servidor.';
      } catch (error) {
        root.querySelector('[data-channel-status]').innerHTML = '⚠️ Salvo localmente. Servidor respondeu: ' + error.message;
      }
    });

    root.querySelector('[data-load-channels]')?.addEventListener('click', async () => {
      const settings = await getSettings();
      fillSettings(root, settings);
      root.querySelector('[data-channel-status]').innerHTML = 'Configurações recarregadas.';
    });

    root.querySelectorAll('[data-test-channel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const channel = btn.getAttribute('data-test-channel');
        const status = root.querySelector('[data-channel-status]');
        const data = collectSettings(root);
        saveLocal(data);
        status.innerHTML = 'Testando ' + channel + '...';
        try {
          const result = await postJSON('/api/admin/channels/test/' + channel, data);
          status.innerHTML = '✅ ' + (result.message || 'Teste concluído.');
        } catch (error) {
          status.innerHTML = '⚠️ ' + error.message;
        }
      });
    });

    bindUpdate(root);
  }

  function bindUpdate(root) {
    const file = root.querySelector('[data-update-file]');
    const send = root.querySelector('[data-send-update]');
    const status = root.querySelector('[data-update-status]');
    const bar = root.querySelector('[data-update-progress]');

    function progress(p, msg) {
      if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%';
      if (msg && status) status.innerHTML = msg;
    }

    file?.addEventListener('change', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Nenhum arquivo selecionado.');
      if (selected.name === EXPECTED_ZIP) progress(5, '✅ Arquivo correto selecionado: <b>' + selected.name + '</b>.');
      else progress(0, '⚠️ Nome selecionado: <b>' + selected.name + '</b>. Esperado: <b>' + EXPECTED_ZIP + '</b>.');
    });

    send?.addEventListener('click', () => {
      const selected = file.files && file.files[0];
      if (!selected) return progress(0, 'Selecione o ZIP antes de enviar.');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/system/upload-update?filename=' + encodeURIComponent(selected.name));
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 35), 'Enviando ZIP... ' + Math.round((event.loaded / event.total) * 35) + '%');
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) progress(45, 'Validando ZIP e preparando GitHub...');
        if (xhr.readyState === 3) progress(78, 'Atualizando GitHub e iniciando deploy...');
        if (xhr.readyState === 4) {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) progress(100, '✅ Atualização enviada. ' + (data.deployTriggered ? 'Deploy acionado.' : 'Faça Manual Deploy no Render se necessário.'));
            else progress(0, '❌ ' + (data.error || 'Falha na atualização.'));
          } catch (_) { progress(0, '❌ Resposta inválida do servidor.'); }
        }
      };
      xhr.onerror = () => progress(0, '❌ Erro de conexão.');
      progress(10, 'Iniciando atualização...');
      xhr.send(selected);
    });

    root.querySelector('[data-copy-termux]')?.addEventListener('click', () => {
      const cmd = `cd /storage/emulated/0/Download\nbash ${EXPECTED_BASH}`;
      navigator.clipboard?.writeText(cmd).then(() => toast('Comandos copiados.'));
      const code = root.querySelector('[data-termux-code]');
      if (code) code.style.display = 'block';
    });
  }

  function addSyndicNotices() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"]');
    if (!dash || dash.querySelector('.vr442-syndic-notices')) return;
    const greeting = dash.querySelector('.vr440-greeting, .vr441-greeting, .vr-home-greeting, .hero, .vr440-home');
    if (!greeting) return;

    const notices = parse(localStorage.getItem('vitoriaRegia.full.v1.notices'), [])
      .filter(n => n && (n.public === true || n.publico === true || n.fromSyndic || /s[ií]ndico|aviso/i.test(String(n.title || n.type || ''))))
      .slice(0, 2);

    if (!notices.length) return;

    const box = document.createElement('div');
    box.className = 'vr442-syndic-notices';
    box.innerHTML = notices.map(n => `<div class="vr442-syndic-notice"><b>${escapeHTML(n.title || 'Aviso do síndico')}</b><br>${escapeHTML(n.message || n.text || '')}</div>`).join('');
    greeting.insertAdjacentElement('afterend', box);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function updateFooter() {
    const text = VERSION + '-mysql-config-premium-canais';
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => el.textContent = text);
  }

  function init() {
    if (!logged()) return;
    setRoleClass();
    fixMenu();
    addSyndicNotices();
    injectSettings();
    updateFooter();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  window.addEventListener('hashchange', () => setTimeout(init, 120));
  const observer = new MutationObserver(() => init());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
