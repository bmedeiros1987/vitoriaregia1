
// Vitória Régia v4.5.5 — mobile config completo + início igual ao modelo
(function () {
  const VERSION = 'v4.5.5';
  let DISPLAY_VERSION = VERSION + '-mobile-config-inicio-premium-sem-segredos';
  let scheduled = false;
  let weatherCache = null;
  let channels = null;
  let asaas = null;

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function norm(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function session() {
    const p = 'vitoriaRegia.full.v1.';
    return parse(localStorage.getItem(p + 'session'), null) ||
      parse(localStorage.getItem('currentUser'), null) ||
      parse(localStorage.getItem('user'), null) || {};
  }

  function role() {
    const s = session();
    const r = norm(s.role || s.staffRole || s.originalRole || s.perfil || s.tipo || '');
    if (r.includes('owner') || r.includes('propriet') || r.includes('dono') || r.includes('admin') || r.includes('sind')) return 'admin';
    if (r.includes('port')) return 'portaria';
    return 'morador';
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  function firstName() {
    const s = session();
    return String(s.name || s.nome || s.email || 'usuário').trim().split(/\s+/)[0] || 'usuário';
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  async function loadVersion() {
    try {
      const res = await fetch('VERSION.json?ts=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data && data.version) DISPLAY_VERSION = data.version + '-mobile-config-inicio-premium-sem-segredos';
    } catch (_) {}
    updateVersionUI();
  }

  function updateVersionUI() {
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      el.textContent = DISPLAY_VERSION;
    });

    document.querySelectorAll('.vr443-login-version,.vr446-login-version,.vr451-login-version,.vr452-login-version,.vr453-login-version,.vr454-login-version').forEach(el => el.remove());

    if (!logged()) {
      document.body.classList.add('auth-locked');
      let el = document.querySelector('.vr455-login-version');
      if (!el) {
        el = document.createElement('div');
        el.className = 'vr452-login-version vr455-login-version';
        el.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(el);
      }
      el.querySelector('strong').textContent = DISPLAY_VERSION;
      el.style.display = 'block';
    } else {
      document.body.classList.remove('auth-locked');
      document.querySelectorAll('.vr455-login-version').forEach(el => el.style.display = 'none');
    }
  }

  function weatherSettings() {
    const local = parse(localStorage.getItem('vitoriaRegia.weatherSettings'), null);
    const state = parse(localStorage.getItem('vitoriaRegia.full.v1.state'), null) || parse(localStorage.getItem('vrState'), null) || {};
    const settings = (state && state.settings && state.settings.weather) || {};
    return {
      city: local?.city || settings.city || 'João Pessoa',
      state: local?.state || settings.state || 'PB',
      country: local?.country || settings.country || 'Brasil',
      latitude: Number(local?.latitude ?? settings.latitude ?? -7.1195),
      longitude: Number(local?.longitude ?? settings.longitude ?? -34.8450)
    };
  }

  async function fetchWeather() {
    const cfg = weatherSettings();
    const now = Date.now();
    const key = cfg.latitude + ',' + cfg.longitude;
    if (weatherCache && weatherCache.key === key && now - weatherCache.ts < 20 * 60 * 1000) return weatherCache.data;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(cfg.latitude)}&longitude=${encodeURIComponent(cfg.longitude)}&current=temperature_2m,relative_humidity_2m,precipitation&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max&timezone=auto&forecast_days=1`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      const current = data.current || {};
      const daily = data.daily || {};

      const temp = Math.round(Number(current.temperature_2m ?? 0));
      const humidity = Math.round(Number(current.relative_humidity_2m ?? 0));
      const rainProb = Number((daily.precipitation_probability_max || [0])[0] || 0);
      const rain = Number((daily.precipitation_sum || [0])[0] || current.precipitation || 0);

      let alert = 'Sem alerta climático relevante no momento.';
      let level = 'ok';
      if (rainProb >= 70 || rain >= 20) {
        alert = 'Alerta amarelo: possibilidade de chuva forte na região.';
        level = 'yellow';
      } else if (humidity > 0 && humidity <= 35) {
        alert = 'Alerta amarelo: tempo seco na região. Reforce hidratação.';
        level = 'yellow';
      } else if (temp >= 34) {
        alert = 'Alerta amarelo: calor elevado na região.';
        level = 'yellow';
      }

      const result = {
        city: cfg.city,
        state: cfg.state,
        temp,
        humidity,
        alert,
        level,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      weatherCache = { key, ts: now, data: result };
      return result;
    } catch (_) {
      return {
        city: cfg.city,
        state: cfg.state,
        temp: null,
        humidity: null,
        alert: 'Clima indisponível agora. Verifique a conexão.',
        level: 'yellow',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
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
    const nav = document.querySelector(`[href="#${target}"][data-nav]`);
    if (nav) nav.click();
    else {
      document.querySelectorAll('[data-section], .section').forEach(sec => sec.classList.toggle('is-active', sec.id === target));
      location.hash = target;
    }
    closeMenu();
    setTimeout(runNow, 120);
  }

  function setupMobileMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    const nav = sidebar && sidebar.querySelector('.nav, nav');
    if (!sidebar || !nav) return;

    sidebar.querySelectorAll('.vr453-menu-weather, .vr453-menu-alert, .vr452-menu-close, .vr451-menu-close-floating, .vr440-menu-head, .vr441-menu-head, .vr442-menu-head, .vr447-menu-head, .vr450-menu-head').forEach(el => el.remove());

    if (!sidebar.querySelector('.vr455-mobile-top')) {
      const top = document.createElement('div');
      top.className = 'vr455-mobile-top';
      top.innerHTML = '<div><strong>Menu</strong><br><small>Sistema Vitória Régia</small></div><button class="vr455-close" type="button" aria-label="Fechar menu">×</button>';
      sidebar.insertBefore(top, sidebar.firstChild);
      top.querySelector('button').addEventListener('click', closeMenu);
    }

    const openBtn = document.querySelector('[data-menu-open]');
    if (openBtn && !openBtn.dataset.bound455) {
      openBtn.dataset.bound455 = '1';
      openBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        openMenu();
      }, true);
    }

    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.bound455) {
      shadow.dataset.bound455 = '1';
      shadow.addEventListener('click', closeMenu);
    }

    // Garante Configurações no menu mobile para admin, mesmo se o menu anterior não criou.
    if (role() === 'admin' && !nav.querySelector('[data-vr455-nav="configuracoes"]')) {
      const a = document.createElement('a');
      a.href = '#configuracoes';
      a.setAttribute('data-nav', '');
      a.setAttribute('data-vr455-nav', 'configuracoes');
      a.innerHTML = '<span>⚙️</span><span>Configurações</span>';
      a.addEventListener('click', e => {
        e.preventDefault();
        go('configuracoes');
      });
      nav.appendChild(a);
    }

    nav.querySelectorAll('[data-vr452-nav="dashboard"] span:last-child, [data-vr453-nav="dashboard"] span:last-child, [data-vr455-nav="dashboard"] span:last-child').forEach(el => {
      el.textContent = 'Início';
    });
  }

  function shortcut(icon, title, text, target) {
    return `<button class="vr455-shortcut" type="button" data-vr455-go="${target}"><span>${icon}</span><b>${escapeHTML(title)}</b><small>${escapeHTML(text)}</small></button>`;
  }

  function renderInicio() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"]');
    if (!dash) return;

    dash.classList.remove('vr452-dashboard-ready','vr453-inicio-ready');
    dash.classList.add('vr455-inicio-ready');

    dash.querySelectorAll('.vr452-dashboard,.vr453-inicio,.vr453-weather-card,.vr454-hero-weather').forEach(el => el.remove());
    if (dash.querySelector('.vr455-inicio')) return;

    const actions = role() === 'admin'
      ? [
          shortcut('📅', 'Nova reserva', 'Criar ou consultar reserva.', 'reservas'),
          shortcut('💰', 'Financeiro', 'Abrir área financeira.', 'financeiro'),
          shortcut('📦', 'Encomendas', 'Consultar ou registrar entregas.', 'encomendas'),
          shortcut('⚙️', 'Configurações', 'Canais, clima, boleto e sistema.', 'configuracoes')
        ].join('')
      : [
          shortcut('📅', 'Nova reserva', 'Solicitar uma área comum.', 'reservas'),
          shortcut('💰', 'Financeiro', 'Consultar financeiro.', 'financeiro'),
          shortcut('📦', 'Encomendas', 'Ver entregas e retiradas.', 'encomendas'),
          shortcut('❔', 'Ajuda', 'Manuais e suporte.', 'manual')
        ].join('');

    const box = document.createElement('section');
    box.className = 'vr455-inicio';
    box.innerHTML = `
      <div class="vr455-hero">
        <div>
          <h2>${greeting()}, ${escapeHTML(firstName())}.</h2>
          <p>Escolha uma ação rápida para continuar.</p>
        </div>
        <div class="vr455-weather">
          <div class="vr455-weather-main">
            <b>Tempo e temperatura</b>
            <span data-vr455-weather-main>--:-- • --°C</span>
          </div>
          <div class="vr455-weather-sub" data-vr455-weather-sub>Carregando clima...</div>
          <div class="vr455-weather-alert" data-vr455-weather-alert>Carregando alerta regional...</div>
        </div>
      </div>
      <div class="vr455-shortcuts">${actions}</div>
    `;
    dash.insertBefore(box, dash.firstChild);
    box.querySelectorAll('[data-vr455-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr455-go'))));
    updateWeatherUI();
  }

  async function updateWeatherUI() {
    const w = await fetchWeather();
    const tempText = w.temp === null ? '--°C' : w.temp + '°C';
    const place = `${w.city}${w.state ? ' / ' + w.state : ''}`;
    document.querySelectorAll('#dashboard [data-vr455-weather-main]').forEach(el => el.textContent = `${w.time} • ${tempText}`);
    document.querySelectorAll('#dashboard [data-vr455-weather-sub]').forEach(el => el.textContent = `${place}${w.humidity !== null ? ' • Umidade ' + w.humidity + '%' : ''}`);
    document.querySelectorAll('#dashboard [data-vr455-weather-alert]').forEach(el => {
      el.textContent = w.alert;
      el.classList.toggle('ok', w.level === 'ok');
    });
  }

  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr455-field"><span>${escapeHTML(label)}</span><input type="${type}" data-vr455-field="${key}" placeholder="${escapeHTML(placeholder)}"></div>`;
  }

  function checkbox(label, key) {
    return `<label class="vr455-check"><input type="checkbox" data-vr455-field="${key}"><span>${escapeHTML(label)}</span></label>`;
  }

  function updateBlock(source) {
    return `<h3>Atualização do sistema</h3><p>Envie o ZIP limpo gerado nesta conversa. O token fica no Render.</p><div class="vr455-grid"><div class="vr455-card"><h3>Enviar ZIP</h3><p>Esperado: <b>vitoriaregia_update_${VERSION}.zip</b></p><input type="file" accept=".zip,application/zip" data-vr455-update-file="${source}"><div class="vr455-progress"><span data-vr455-update-bar="${source}"></span></div><div class="vr455-status" data-vr455-update-status="${source}">Selecione o ZIP.</div><div class="vr455-actions"><button class="vr455-btn primary" data-vr455-send-update="${source}">Enviar atualização</button></div></div><div class="vr455-card"><h3>Pré-requisitos</h3><p>Render: GITHUB_UPDATE_TOKEN, GITHUB_REPOSITORY e GITHUB_BRANCH.</p></div></div>`;
  }

  function ensureConfigMobile() {
    if (!logged() || role() !== 'admin') return;
    const sec = document.getElementById('configuracoes');
    if (!sec) return;

    sec.classList.add('vr455-config-ready');
    sec.querySelectorAll('.vr452-config,.vr451-settings,.vr450-settings,.vr447-settings').forEach(el => el.remove());

    if (sec.querySelector('.vr455-config')) return;

    const cfg = weatherSettings();
    sec.insertAdjacentHTML('afterbegin', `
      <div class="vr455-config">
        <div class="vr455-config-hero">
          <h2>Configurações</h2>
          <p>Todas as funções disponíveis também no celular.</p>
        </div>
        <div class="vr455-tabs">
          <button class="vr455-tab is-active" data-vr455-tab="clima">Clima</button>
          <button class="vr455-tab" data-vr455-tab="telegram">Telegram</button>
          <button class="vr455-tab" data-vr455-tab="email">E-mail</button>
          <button class="vr455-tab" data-vr455-tab="whatsapp">WhatsApp</button>
          <button class="vr455-tab" data-vr455-tab="boleto">Boleto/Banco</button>
          <button class="vr455-tab" data-vr455-tab="atualizacao">Atualização</button>
          <button class="vr455-tab" data-vr455-tab="permissoes">Permissões</button>
        </div>

        <div class="vr455-panel is-active" data-vr455-panel="clima">
          <h3>Clima do Início</h3>
          <p>Define o clima exibido junto da saudação da página Início.</p>
          <div class="vr455-grid">
            <div class="vr455-card">
              ${field('Cidade','weatherCity','text','João Pessoa')}
              ${field('UF','weatherState','text','PB')}
              ${field('Latitude','weatherLatitude','number','-7.1195')}
              ${field('Longitude','weatherLongitude','number','-34.8450')}
              <div class="vr455-actions">
                <button class="vr455-btn primary" data-vr455-save-weather>Salvar clima</button>
                <button class="vr455-btn" data-vr455-test-weather>Testar clima</button>
              </div>
            </div>
            <div class="vr455-card">
              <h3>Prévia</h3>
              <div class="vr455-status" data-vr455-weather-status>Carregando...</div>
            </div>
          </div>
        </div>

        <div class="vr455-panel" data-vr455-panel="telegram">
          <h3>Telegram</h3>
          <div class="vr455-grid">
            <div class="vr455-card">
              ${checkbox('Ativar Telegram','telegramEnabled')}
              ${field('Usuário do bot','telegramBotUsername','text','vitoriaregia_bot')}
              ${field('Token do bot','telegramBotToken','password','preencha apenas para alterar')}
              ${field('Chat ID teste','telegramTestChatId','text','opcional')}
              <div class="vr455-actions">
                <button class="vr455-btn primary" data-vr455-save-channels>Salvar Telegram</button>
                <button class="vr455-btn" data-vr455-test-channel="telegram">Testar</button>
              </div>
            </div>
            <div class="vr455-card"><h3>Status</h3><div class="vr455-status" data-vr455-channel-status>Carregando...</div></div>
          </div>
        </div>

        <div class="vr455-panel" data-vr455-panel="email">
          <h3>E-mail</h3>
          <div class="vr455-grid">
            <div class="vr455-card">
              ${checkbox('Ativar e-mail','emailEnabled')}
              ${field('Host SMTP','smtpHost','text','smtp.mailersend.net')}
              ${field('Porta','smtpPort','text','587')}
              ${field('Usuário SMTP','smtpUser','text','usuário')}
              ${field('Senha SMTP','smtpPassword','password','preencha apenas para alterar')}
              ${field('Remetente','emailFrom','text','Nome <email@dominio.com>')}
              ${field('E-mail teste','emailTestTo','email','destino')}
              <div class="vr455-actions">
                <button class="vr455-btn primary" data-vr455-save-channels>Salvar e-mail</button>
                <button class="vr455-btn" data-vr455-test-channel="email">Testar</button>
              </div>
            </div>
            <div class="vr455-card"><h3>Status</h3><div class="vr455-status" data-vr455-email-status>Carregando...</div></div>
          </div>
        </div>

        <div class="vr455-panel" data-vr455-panel="whatsapp">
          <h3>WhatsApp</h3>
          <div class="vr455-grid">
            <div class="vr455-card">
              ${checkbox('Ativar WhatsApp','whatsappEnabled')}
              ${field('Provedor','whatsappProvider','text','Periskope')}
              ${field('Periskope ID','periskopeId','text','ID')}
              ${field('URL API','periskopeApiUrl','text','URL')}
              ${field('Token/API Key','periskopeToken','password','preencha apenas para alterar')}
              ${field('WhatsApp teste','whatsappTestTo','text','5561999999999')}
              <div class="vr455-actions">
                <button class="vr455-btn primary" data-vr455-save-channels>Salvar WhatsApp</button>
                <button class="vr455-btn" data-vr455-test-channel="whatsapp">Testar</button>
              </div>
            </div>
            <div class="vr455-card"><h3>Status</h3><div class="vr455-status" data-vr455-whatsapp-status>Carregando...</div></div>
          </div>
        </div>

        <div class="vr455-panel" data-vr455-panel="boleto">
          <h3>Boleto/Banco</h3>
          <div class="vr455-grid">
            <div class="vr455-card">
              ${checkbox('Ativar boleto','asaasEnabled')}
              <div class="vr455-field"><span>Ambiente</span><select data-vr455-field="asaasEnvironment"><option value="sandbox">Sandbox/teste</option><option value="production">Produção</option></select></div>
              ${field('API Key banco/Asaas','asaasApiKey','password','preencha apenas para alterar')}
              ${field('Dias antes do vencimento','dueDaysBeforeReservation','number','2')}
              ${field('Multa (%)','fineValue','number','2')}
              ${field('Juros (%)','interestValue','number','1')}
              <div class="vr455-actions">
                <button class="vr455-btn primary" data-vr455-save-asaas>Salvar boleto</button>
                <button class="vr455-btn" data-vr455-test-asaas>Testar</button>
              </div>
            </div>
            <div class="vr455-card"><h3>Status</h3><div class="vr455-status" data-vr455-asaas-status>Carregando...</div></div>
          </div>
        </div>

        <div class="vr455-panel" data-vr455-panel="atualizacao">${updateBlock('config')}</div>

        <div class="vr455-panel" data-vr455-panel="permissoes">
          <h3>Permissões</h3>
          <div class="vr455-grid">
            <div class="vr455-card"><h3>Morador</h3><p>Reservas, encomendas, financeiro e ajuda.</p></div>
            <div class="vr455-card"><h3>Admin/Síndico</h3><p>Configurações, boletos, canais e atualização.</p></div>
            <div class="vr455-card"><h3>Portaria</h3><p>Operação, visitantes e encomendas.</p></div>
            <div class="vr455-card"><h3>Financeiro da unidade</h3><p>Permissão separada para o perfil do usuário.</p></div>
          </div>
        </div>
      </div>
    `);

    setField('weatherCity', cfg.city);
    setField('weatherState', cfg.state);
    setField('weatherLatitude', cfg.latitude);
    setField('weatherLongitude', cfg.longitude);

    bindConfig(sec);
    loadChannels();
    loadAsaas();
  }

  function bindConfig(root) {
    root.querySelectorAll('[data-vr455-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-vr455-tab');
        root.querySelectorAll('[data-vr455-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
        root.querySelectorAll('[data-vr455-panel]').forEach(p => p.classList.toggle('is-active', p.getAttribute('data-vr455-panel') === name));
      });
    });

    root.querySelector('[data-vr455-save-weather]')?.addEventListener('click', saveWeather);
    root.querySelector('[data-vr455-test-weather]')?.addEventListener('click', async () => {
      weatherCache = null;
      const w = await fetchWeather();
      const s = root.querySelector('[data-vr455-weather-status]');
      if (s) s.textContent = `${w.city}/${w.state} • ${w.temp === null ? '--' : w.temp + '°C'} • ${w.alert}`;
      updateWeatherUI();
    });

    root.querySelectorAll('[data-vr455-save-channels]').forEach(btn => btn.addEventListener('click', saveChannels));
    root.querySelectorAll('[data-vr455-test-channel]').forEach(btn => btn.addEventListener('click', () => testChannel(btn.getAttribute('data-vr455-test-channel'))));
    root.querySelector('[data-vr455-save-asaas]')?.addEventListener('click', saveAsaas);
    root.querySelector('[data-vr455-test-asaas]')?.addEventListener('click', testAsaas);
    bindUpdate(root);
  }

  function getField(key) {
    const el = document.querySelector(`[data-vr455-field="${key}"]`);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function setField(key, value, sensitive) {
    document.querySelectorAll(`[data-vr455-field="${key}"]`).forEach(el => {
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else if (sensitive) {
        el.value = '';
        el.placeholder = value ? 'já configurado — preencha apenas para alterar' : 'preencha para configurar';
      } else {
        el.value = value ?? '';
      }
    });
  }

  function saveWeather() {
    const cfg = {
      city: getField('weatherCity') || 'João Pessoa',
      state: getField('weatherState') || 'PB',
      country: 'Brasil',
      latitude: Number(getField('weatherLatitude') || -7.1195),
      longitude: Number(getField('weatherLongitude') || -34.8450)
    };
    localStorage.setItem('vitoriaRegia.weatherSettings', JSON.stringify(cfg));
    weatherCache = null;
    updateWeatherUI();
    const s = document.querySelector('[data-vr455-weather-status]');
    if (s) s.textContent = '✅ Localidade salva e atualizada no Início.';
  }

  async function loadChannels() {
    try {
      const res = await fetch('/api/admin/channels/settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar canais.');
      channels = data.settings || {};
      ['telegramEnabled','telegramBotUsername','telegramTestChatId','emailEnabled','smtpHost','smtpPort','smtpUser','emailFrom','emailTestTo','whatsappEnabled','whatsappProvider','periskopeId','periskopeApiUrl','whatsappTestTo'].forEach(k => setField(k, channels[k]));
      ['telegramBotToken','smtpPassword','periskopeToken'].forEach(k => setField(k, channels[k], true));
      setChannelStatus('✅ Canais carregados.');
    } catch (error) {
      setChannelStatus('⚠️ ' + error.message);
    }
  }

  async function saveChannels() {
    try {
      const next = { ...(channels || {}) };
      ['telegramEnabled','telegramBotUsername','telegramTestChatId','emailEnabled','smtpHost','smtpPort','smtpUser','emailFrom','emailTestTo','whatsappEnabled','whatsappProvider','periskopeId','periskopeApiUrl','whatsappTestTo'].forEach(k => {
        const v = getField(k);
        if (v !== undefined) next[k] = v;
      });
      ['telegramBotToken','smtpPassword','periskopeToken'].forEach(k => {
        const v = getField(k);
        if (v) next[k] = v;
      });
      const res = await fetch('/api/admin/channels/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha ao salvar.');
      channels = data.settings || next;
      await loadChannels();
      setChannelStatus('✅ Configuração salva.');
    } catch (error) {
      setChannelStatus('⚠️ ' + error.message);
    }
  }

  async function testChannel(channel) {
    try {
      setChannelStatus('Testando ' + channel + '...');
      const body = { ...(channels || {}) };
      ['telegramTestChatId','emailTestTo','whatsappTestTo','telegramBotUsername'].forEach(k => {
        const v = getField(k);
        if (v) body[k] = v;
      });
      const res = await fetch('/api/admin/channels/test/' + channel, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha no teste.');
      setChannelStatus('✅ ' + (data.message || 'Teste concluído.'));
    } catch (error) {
      setChannelStatus('⚠️ ' + error.message);
    }
  }

  function setChannelStatus(text) {
    document.querySelectorAll('[data-vr455-channel-status], [data-vr455-email-status], [data-vr455-whatsapp-status]').forEach(el => el.textContent = text);
  }

  async function loadAsaas() {
    try {
      const res = await fetch('/api/integrations/asaas', { cache:'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar boleto.');
      asaas = data.config || {};
      setField('asaasEnabled', asaas.enabled);
      setField('asaasEnvironment', asaas.environment || 'sandbox');
      setField('asaasApiKey', asaas.apiKeySaved || asaas.apiKey, true);
      setField('dueDaysBeforeReservation', asaas.dueDaysBeforeReservation);
      setField('fineValue', asaas.fineValue);
      setField('interestValue', asaas.interestValue);
      const s = document.querySelector('[data-vr455-asaas-status]');
      if (s) s.textContent = '✅ Boleto carregado. Chave: ' + (asaas.apiKeySaved ? 'configurada' : 'não configurada') + '.';
    } catch (error) {
      const s = document.querySelector('[data-vr455-asaas-status]');
      if (s) s.textContent = '⚠️ ' + error.message;
    }
  }

  async function saveAsaas() {
    try {
      const next = {
        enabled: Boolean(getField('asaasEnabled')),
        environment: getField('asaasEnvironment') || 'sandbox',
        dueDaysBeforeReservation: Number(getField('dueDaysBeforeReservation') || 2),
        fineValue: Number(getField('fineValue') || 0),
        interestValue: Number(getField('interestValue') || 0)
      };
      const key = getField('asaasApiKey');
      if (key) next.apiKey = key;
      const res = await fetch('/api/integrations/asaas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha ao salvar boleto.');
      await loadAsaas();
      const s = document.querySelector('[data-vr455-asaas-status]');
      if (s) s.textContent = '✅ Boleto/Banco salvo.';
    } catch (error) {
      const s = document.querySelector('[data-vr455-asaas-status]');
      if (s) s.textContent = '⚠️ ' + error.message;
    }
  }

  async function testAsaas() {
    const s = document.querySelector('[data-vr455-asaas-status]');
    try {
      if (s) s.textContent = 'Testando boleto/banco...';
      const res = await fetch('/api/integrations/test-asaas', { method:'POST' });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch (_) {}
      if (!res.ok || data.ok === false) throw new Error(data.error || text || 'Falha no teste.');
      if (s) s.textContent = '✅ Integração respondeu. Ambiente: ' + (data.environment || 'configurado') + '.';
    } catch (error) {
      if (s) s.textContent = '⚠️ ' + error.message;
    }
  }

  function bindUpdate(root) {
    root.querySelectorAll('[data-vr455-send-update]').forEach(btn => {
      if (btn.dataset.bound455) return;
      btn.dataset.bound455 = '1';
      btn.addEventListener('click', () => sendUpdate(btn.getAttribute('data-vr455-send-update') || 'config'));
    });
  }

  function sendUpdate(key) {
    const input = document.querySelector(`[data-vr455-update-file="${key}"]`);
    const file = input && input.files && input.files[0];
    if (!file) return updateProgress(key, 0, 'Selecione o ZIP antes de enviar.');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/system/upload-update?filename=' + encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 35);
        updateProgress(key, pct, 'Enviando ZIP... ' + pct + '%');
      }
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 2) updateProgress(key, 45, 'Validando ZIP no servidor...');
      if (xhr.readyState === 3) updateProgress(key, 78, 'Atualizando GitHub e preparando deploy...');
      if (xhr.readyState === 4) {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) updateProgress(key, 100, '✅ Atualização enviada. ' + (data.deployTriggered ? 'Deploy acionado.' : 'Faça Clear build cache & deploy no Render, se necessário.'));
          else updateProgress(key, 0, '❌ ' + (data.error || 'Falha na atualização.'));
        } catch (_) {
          updateProgress(key, 0, '❌ Resposta inválida do servidor.');
        }
      }
    };
    xhr.onerror = () => updateProgress(key, 0, '❌ Erro de conexão.');
    updateProgress(key, 10, 'Iniciando atualização...');
    xhr.send(file);
  }

  function updateProgress(key, pct, msg) {
    const bar = document.querySelector(`[data-vr455-update-bar="${key}"]`);
    const status = document.querySelector(`[data-vr455-update-status="${key}"]`);
    if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (status) status.textContent = msg;
  }

  function runNow() {
    updateVersionUI();
    if (!logged()) return;
    setupMobileMenu();
    renderInicio();
    ensureConfigMobile();
    updateVersionUI();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      runNow();
    }, 250);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadVersion();
    runNow();
  });
  window.addEventListener('load', async () => {
    await loadVersion();
    runNow();
    setInterval(updateWeatherUI, 10 * 60 * 1000);
  });
  window.addEventListener('hashchange', () => setTimeout(runNow, 120));
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
