
// Vitória Régia v4.5.4 — clima sai do menu e fica dentro do Início
(function () {
  const VERSION = 'v4.5.4';
  let DISPLAY_VERSION = VERSION + '-clima-no-inicio-sem-segredos';
  let weatherCache = null;
  let scheduled = false;

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
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
      if (data && data.version) DISPLAY_VERSION = data.version + '-clima-no-inicio-sem-segredos';
    } catch (_) {}
    updateVersionUI();
  }

  function updateVersionUI() {
    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      el.textContent = DISPLAY_VERSION;
    });

    if (!logged()) {
      document.body.classList.add('auth-locked');
      document.querySelectorAll('.vr443-login-version,.vr446-login-version,.vr451-login-version,.vr452-login-version,.vr453-login-version').forEach(el => el.remove());
      let el = document.querySelector('.vr454-login-version');
      if (!el) {
        el = document.createElement('div');
        el.className = 'vr452-login-version vr454-login-version';
        el.innerHTML = 'Sistema Vitória Régia&nbsp; <strong></strong><br><span>parceria Bruno Saraiva + ChatGPT</span>';
        document.body.appendChild(el);
      }
      el.querySelector('strong').textContent = DISPLAY_VERSION;
      el.style.display = 'block';
    } else {
      document.body.classList.remove('auth-locked');
      document.querySelectorAll('.vr452-login-version,.vr453-login-version,.vr454-login-version').forEach(el => el.style.display = 'none');
    }
  }

  async function fetchWeather() {
    const cfg = weatherSettings();
    const now = Date.now();
    const key = cfg.latitude + ',' + cfg.longitude;
    if (weatherCache && weatherCache.key === key && now - weatherCache.ts < 20 * 60 * 1000) return weatherCache.data;

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
      weatherCache = { key, ts: now, data: result };
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

  function removeWeatherFromMenu() {
    document.querySelectorAll('.sidebar[data-sidebar] .vr453-menu-weather').forEach(el => el.remove());
    document.querySelectorAll('.sidebar[data-sidebar] [data-vr453-weather-main], .sidebar[data-sidebar] [data-vr453-weather-sub], .sidebar[data-sidebar] [data-vr453-alert]').forEach(el => {
      const box = el.closest('.vr453-menu-weather') || el;
      box.remove();
    });

    document.querySelectorAll('.vr453-menu-action[data-vr453-menu-toggle] span').forEach(el => {
      if (!el.textContent || el.textContent.includes('menu')) return;
      el.textContent = 'Encolher menu';
    });
  }

  function ensureWeatherInHero() {
    if (!logged()) return;
    const hero = document.querySelector('#dashboard .vr453-hero, #dashboard .vr452-hero, #dashboard .vr450-hero, #dashboard .vr447-greeting');
    if (!hero) return;

    // Remove card separado da versão anterior para evitar duplicidade.
    document.querySelectorAll('#dashboard .vr453-weather-card').forEach(el => el.remove());

    if (!hero.querySelector('.vr454-hero-weather')) {
      const box = document.createElement('div');
      box.className = 'vr454-hero-weather';
      box.innerHTML = `
        <div class="vr454-hero-weather-main">
          <b>Tempo e temperatura</b>
          <span data-vr454-weather-main>--:-- • --°C</span>
        </div>
        <div class="vr454-hero-weather-sub" data-vr454-weather-sub>Carregando clima...</div>
        <div class="vr454-hero-alert" data-vr454-alert>Carregando alerta regional...</div>
      `;
      hero.appendChild(box);
    }
  }

  async function updateWeatherUI() {
    ensureWeatherInHero();
    const w = await fetchWeather();
    const tempText = w.temp === null ? '--°C' : w.temp + '°C';
    const place = `${w.city}${w.state ? ' / ' + w.state : ''}`;

    document.querySelectorAll('#dashboard [data-vr454-weather-main]').forEach(el => {
      el.textContent = `${w.time} • ${tempText}`;
    });
    document.querySelectorAll('#dashboard [data-vr454-weather-sub]').forEach(el => {
      el.textContent = `${place}${w.humidity !== null ? ' • Umidade ' + w.humidity + '%' : ''}`;
    });
    document.querySelectorAll('#dashboard [data-vr454-alert]').forEach(el => {
      el.textContent = w.alert;
      el.classList.toggle('ok', w.level === 'ok');
    });

    // Garante que nada de clima apareça no menu.
    removeWeatherFromMenu();
  }

  function ensureClimaConfigStillWorks() {
    if (!logged()) return;
    // A aba Clima da versão anterior continua ativa. Este patch só muda onde o clima aparece.
    document.querySelectorAll('[data-vr453-save-weather], [data-vr453-test-weather]').forEach(btn => {
      if (btn.dataset.bound454) return;
      btn.dataset.bound454 = '1';
      btn.addEventListener('click', () => {
        weatherCache = null;
        setTimeout(updateWeatherUI, 300);
      });
    });
  }

  function runNow() {
    updateVersionUI();
    removeWeatherFromMenu();
    if (!logged()) return;
    ensureWeatherInHero();
    ensureClimaConfigStillWorks();
    updateWeatherUI();
    updateVersionUI();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      runNow();
    }, 300);
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
