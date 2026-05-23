
// Vitória Régia v4.5.3 — Início, clima, voltar e menu sem confusão
(function () {
  const VERSION = 'v4.5.3';
  let DISPLAY_VERSION = VERSION + '-inicio-clima-menu-voltar-sem-segredos';
  let weatherCache = null;
  let scheduled = false;

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

  async function loadVersion() {
    try {
      const res = await fetch('VERSION.json?ts=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data && data.version) DISPLAY_VERSION = data.version + '-inicio-clima-menu-voltar-sem-segredos';
    } catch (_) {}
    updateVersionUI();
  }

  function updateVersionUI() {
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      el.textContent = DISPLAY_VERSION;
    });
    document.querySelectorAll('.vr443-login-version,.vr446-login-version,.vr451-login-version,.vr452-login-version').forEach(el => el.remove());
    if (!logged()) {
      document.body.classList.add('auth-locked');
      let el = document.querySelector('.vr453-login-version');
      if (!el) {
        el = document.createElement('div');
        el.className = 'vr452-login-version vr453-login-version';
        el.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(el);
      }
      el.querySelector('strong').textContent = DISPLAY_VERSION;
      el.style.display = 'block';
    } else {
      document.body.classList.remove('auth-locked');
      document.querySelectorAll('.vr453-login-version').forEach(el => el.style.display = 'none');
    }
  }

  async function fetchWeather() {
    const cfg = weatherSettings();
    const now = Date.now();
    if (weatherCache && weatherCache.key === cfg.latitude + ',' + cfg.longitude && now - weatherCache.ts < 20 * 60 * 1000) {
      return weatherCache.data;
    }
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(cfg.latitude)}&longitude=${encodeURIComponent(cfg.longitude)}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
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
        rainProb,
        rain,
        alert,
        level,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      weatherCache = { key: cfg.latitude + ',' + cfg.longitude, ts: now, data: result };
      return result;
    } catch (error) {
      return {
        city: cfg.city,
        state: cfg.state,
        temp: null,
        humidity: null,
        rainProb: null,
        rain: null,
        alert: 'Clima indisponível agora. Verifique a conexão.',
        level: 'yellow',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
    }
  }

  async function updateWeatherUI() {
    const w = await fetchWeather();
    const tempText = w.temp === null ? '--°C' : w.temp + '°C';
    const place = `${w.city}${w.state ? ' / ' + w.state : ''}`;
    document.querySelectorAll('[data-vr453-weather-main]').forEach(el => {
      el.textContent = `${w.time} • ${tempText}`;
    });
    document.querySelectorAll('[data-vr453-weather-sub]').forEach(el => {
      el.textContent = `${place}${w.humidity !== null ? ' • Umidade ' + w.humidity + '%' : ''}`;
    });
    document.querySelectorAll('[data-vr453-alert]').forEach(el => {
      el.textContent = w.alert;
      el.classList.toggle('ok', w.level === 'ok');
      el.classList.toggle('is-visible', true);
    });
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

  function goBack() {
    if (history.length > 1) history.back();
    else go('dashboard');
  }

  function setupMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    const nav = sidebar && sidebar.querySelector('.nav, nav');
    if (!sidebar || !nav) return;

    sidebar.querySelectorAll('.vr453-menu-top').forEach((el, index) => { if (index > 0) el.remove(); });
    if (!sidebar.querySelector('.vr453-menu-top')) {
      const top = document.createElement('div');
      top.className = 'vr453-menu-top';
      top.innerHTML = `
        <div class="vr453-menu-weather">
          <strong data-vr453-weather-main>--:-- • --°C</strong>
          <small data-vr453-weather-sub>Carregando clima...</small>
          <div class="vr453-menu-alert" data-vr453-alert>Carregando alerta...</div>
        </div>
        <div class="vr453-menu-actions">
          <button type="button" class="vr453-menu-action" data-vr453-menu-toggle><span>Encolher menu</span></button>
          <button type="button" class="vr453-menu-action" data-vr453-back><span>Voltar</span></button>
          <button type="button" class="vr453-menu-action" data-vr453-close aria-label="Fechar menu"></button>
        </div>`;
      sidebar.insertBefore(top, sidebar.firstChild);
    }

    const toggle = sidebar.querySelector('[data-vr453-menu-toggle]');
    if (toggle && !toggle.dataset.bound453) {
      toggle.dataset.bound453 = '1';
      toggle.addEventListener('click', () => {
        document.body.classList.toggle('vr453-menu-collapsed');
        const collapsed = document.body.classList.contains('vr453-menu-collapsed');
        const span = toggle.querySelector('span');
        if (span) span.textContent = collapsed ? 'Expandir menu' : 'Encolher menu';
      });
    }

    const back = sidebar.querySelector('[data-vr453-back]');
    if (back && !back.dataset.bound453) {
      back.dataset.bound453 = '1';
      back.addEventListener('click', goBack);
    }

    const close = sidebar.querySelector('[data-vr453-close]');
    if (close && !close.dataset.bound453) {
      close.dataset.bound453 = '1';
      close.addEventListener('click', closeMenu);
    }

    const openBtn = document.querySelector('[data-menu-open]');
    if (openBtn && !openBtn.dataset.bound453) {
      openBtn.dataset.bound453 = '1';
      openBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        openMenu();
      }, true);
    }

    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.bound453) {
      shadow.dataset.bound453 = '1';
      shadow.addEventListener('click', closeMenu);
    }

    // Dashboard vira Início nos menus criados na versão anterior.
    nav.querySelectorAll('[data-vr452-nav="dashboard"] span:last-child, [data-vr453-nav="dashboard"] span:last-child').forEach(el => {
      el.textContent = 'Início';
    });

    updateWeatherUI();
  }

  function shortcut(icon, title, text, target) {
    return `<button class="vr453-shortcut" type="button" data-vr453-go="${target}"><span>${icon}</span><b>${escapeHTML(title)}</b><small>${escapeHTML(text)}</small></button>`;
  }

  function renderInicio() {
    if (!logged()) return;
    const dash = document.querySelector('#dashboard[data-section], [data-section="dashboard"], [data-page="dashboard"]');
    if (!dash) return;

    dash.classList.remove('vr452-dashboard-ready');
    dash.classList.add('vr453-inicio-ready');

    dash.querySelectorAll('.vr453-inicio').forEach((el, idx) => { if (idx > 0) el.remove(); });
    if (dash.querySelector('.vr453-inicio')) return;

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

    const inicio = document.createElement('section');
    inicio.className = 'vr453-inicio';
    inicio.innerHTML = `
      <div class="vr453-hero">
        <h2>${greeting()}, ${escapeHTML(firstName())}.</h2>
        <p>Escolha uma ação rápida para continuar.</p>
      </div>
      <div class="vr453-weather-card">
        <div class="vr453-weather-line">
          <b>Tempo e temperatura</b>
          <span data-vr453-weather-main>--:-- • --°C</span>
        </div>
        <p data-vr453-weather-sub>Carregando clima...</p>
        <div class="vr453-alert" data-vr453-alert>Carregando alerta regional...</div>
      </div>
      <div class="vr453-shortcuts">${actions}</div>
    `;
    dash.insertBefore(inicio, dash.firstChild);
    inicio.querySelectorAll('[data-vr453-go]').forEach(btn => btn.addEventListener('click', () => go(btn.getAttribute('data-vr453-go'))));
    updateWeatherUI();
  }

  function field(label, key, type = 'text', placeholder = '') {
    return `<div class="vr452-field"><span>${escapeHTML(label)}</span><input type="${type}" data-vr453-weather-field="${key}" placeholder="${escapeHTML(placeholder)}"></div>`;
  }

  function ensureClimaConfig() {
    if (!logged() || role() !== 'admin') return;
    const config = document.querySelector('#configuracoes .vr452-config, #configuracoes .vr451-settings, #configuracoes .vr450-settings');
    if (!config || config.querySelector('[data-vr453-tab="clima"]')) return;

    const tabs = config.querySelector('.vr452-tabs, .vr451-tabs, .vr450-tabs');
    if (!tabs) return;

    const tab = document.createElement('button');
    tab.className = tabs.classList.contains('vr452-tabs') ? 'vr452-tab' : 'vr451-tab';
    tab.type = 'button';
    tab.setAttribute('data-vr453-tab', 'clima');
    tab.textContent = 'Clima';
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = tabs.classList.contains('vr452-tabs') ? 'vr452-panel' : 'vr451-panel';
    panel.setAttribute('data-vr453-panel', 'clima');
    const cfg = weatherSettings();
    panel.innerHTML = `
      <h3>Clima</h3>
      <p>Defina a localidade usada no menu lateral e na tela Início.</p>
      <div class="vr453-weather-settings">
        <div class="vr452-grid">
          <div class="vr452-card">
            ${field('Cidade', 'city', 'text', 'João Pessoa')}
            ${field('Estado/UF', 'state', 'text', 'PB')}
            ${field('País', 'country', 'text', 'Brasil')}
            ${field('Latitude', 'latitude', 'number', '-7.1195')}
            ${field('Longitude', 'longitude', 'number', '-34.8450')}
            <div class="vr452-row">
              <button class="vr452-btn primary" type="button" data-vr453-save-weather>Salvar clima</button>
              <button class="vr452-btn" type="button" data-vr453-test-weather>Testar clima</button>
            </div>
          </div>
          <div class="vr452-card">
            <h3>Prévia</h3>
            <div class="vr452-status" data-vr453-weather-status>Informe a cidade ou use as coordenadas.</div>
            <div class="vr452-note">Os alertas são gerados por previsão de chuva, umidade baixa e calor. Não substituem boletins oficiais da Defesa Civil/INMET.</div>
          </div>
        </div>
      </div>`;
    const lastPanel = config.querySelector('.vr452-panel:last-of-type, .vr451-panel:last-of-type, .vr450-panel:last-of-type');
    if (lastPanel) lastPanel.after(panel);
    else config.appendChild(panel);

    panel.querySelector('[data-vr453-weather-field="city"]').value = cfg.city || '';
    panel.querySelector('[data-vr453-weather-field="state"]').value = cfg.state || '';
    panel.querySelector('[data-vr453-weather-field="country"]').value = cfg.country || '';
    panel.querySelector('[data-vr453-weather-field="latitude"]').value = cfg.latitude || '';
    panel.querySelector('[data-vr453-weather-field="longitude"]').value = cfg.longitude || '';

    tab.addEventListener('click', () => {
      config.querySelectorAll('.vr452-tab,.vr451-tab,.vr450-tab').forEach(t => t.classList.remove('is-active'));
      config.querySelectorAll('.vr452-panel,.vr451-panel,.vr450-panel').forEach(p => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      panel.classList.add('is-active');
    });

    panel.querySelector('[data-vr453-save-weather]').addEventListener('click', saveWeatherSettings);
    panel.querySelector('[data-vr453-test-weather]').addEventListener('click', async () => {
      weatherCache = null;
      const w = await fetchWeather();
      const status = panel.querySelector('[data-vr453-weather-status]');
      if (status) status.textContent = `${w.city}: ${w.temp === null ? '--' : w.temp + '°C'} • ${w.alert}`;
      updateWeatherUI();
    });
  }

  function saveWeatherSettings() {
    const root = document.querySelector('[data-vr453-panel="clima"]');
    if (!root) return;
    const cfg = {
      city: root.querySelector('[data-vr453-weather-field="city"]').value || 'João Pessoa',
      state: root.querySelector('[data-vr453-weather-field="state"]').value || 'PB',
      country: root.querySelector('[data-vr453-weather-field="country"]').value || 'Brasil',
      latitude: Number(root.querySelector('[data-vr453-weather-field="latitude"]').value || -7.1195),
      longitude: Number(root.querySelector('[data-vr453-weather-field="longitude"]').value || -34.8450)
    };
    localStorage.setItem('vitoriaRegia.weatherSettings', JSON.stringify(cfg));
    weatherCache = null;
    const status = root.querySelector('[data-vr453-weather-status]');
    if (status) status.textContent = '✅ Localidade salva. Atualizando clima...';
    updateWeatherUI();
  }

  function fixEmergencyAgain() {
    document.querySelectorAll('.vr-emergency-user-card').forEach(el => el.remove());
    document.querySelectorAll('*').forEach(el => {
      const txt = el.textContent || '';
      if (txt.includes('Usuário identificado') && txt.includes('Perfil') && txt.includes('Unidade')) {
        el.style.display = 'none';
      }
    });
    document.querySelectorAll('.vr-emergency-type input[type="radio"], .vr-emergency-type input[type="checkbox"]').forEach(input => {
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
    });
  }

  function runNow() {
    updateVersionUI();
    if (!logged()) return;
    setupMenu();
    renderInicio();
    ensureClimaConfig();
    fixEmergencyAgain();
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
  window.addEventListener('hashchange', () => setTimeout(runNow, 100));
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
