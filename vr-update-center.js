
// Vitória Régia v4.3.9 — Central de Atualizações no admin/síndico
(function () {
  const APP_VERSION = 'v4.3.9';
  const EXPECTED_ZIP = `vitoriaregia_update_${APP_VERSION}.zip`;
  const EXPECTED_BASH = `enviar_vitoriaregia_termux_${APP_VERSION}.sh`;

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function normalize(text) {
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
    const r = normalize(s.role || s.staffRole || s.originalRole || s.perfil || s.tipo || '');
    if (r.includes('owner') || r.includes('propriet') || r.includes('dono')) return 'owner';
    if (r.includes('admin')) return 'admin';
    if (r.includes('sind')) return 'sindico';
    if (r.includes('port')) return 'portaria';
    if (r.includes('limp')) return 'limpeza';
    if (r.includes('zel')) return 'zeladoria';
    return 'morador';
  }

  function allowed() {
    return ['owner','admin','sindico'].includes(role());
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  function toast(msg) {
    let el = document.querySelector('.vr-safe-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'vr-safe-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-open');
    setTimeout(() => el.classList.remove('is-open'), 3500);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Comando copiado.'));
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Comando copiado.');
  }

  function getVersionText() {
    const versionEl = document.querySelector('[data-version], .system-version-footer, footer');
    const text = versionEl ? versionEl.textContent : '';
    const match = text.match(/v\d+\.\d+\.\d+/);
    return match ? match[0] : APP_VERSION;
  }

  function configMount() {
    return document.querySelector('#settings[data-section]')
      || document.querySelector('#configuracoes[data-section]')
      || document.querySelector('[data-page="configuracoes"]')
      || document.querySelector('[data-section="configuracoes"]')
      || document.querySelector('main')
      || document.body;
  }

  function goSettingsAndUpdate() {
    const targets = ['configuracoes','settings'];
    for (const t of targets) {
      const el = document.querySelector(`[data-nav="${t}"], [data-route="${t}"], [data-section="${t}"], a[href="#${t}"], button[data-target="${t}"]`);
      if (el) { el.click(); break; }
    }
    setTimeout(() => {
      injectPanel();
      document.getElementById('vr-update-center')?.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 180);
  }

  function addMenuButton() {
    if (!logged() || !allowed()) return;
    if (document.querySelector('[data-vr-update-menu]')) return;

    const nav = document.querySelector('[data-sidebar] .nav, [data-sidebar] nav, .sidebar .nav, .sidebar nav, [data-sidebar]');
    if (!nav) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vr-update-menu-button';
    btn.setAttribute('data-vr-update-menu', 'true');
    btn.innerHTML = '<span>⬆️</span><span>Atualização</span>';
    btn.addEventListener('click', goSettingsAndUpdate);
    nav.appendChild(btn);
  }

  function panelHtml() {
    const commands = `cd /storage/emulated/0/Download\nbash ${EXPECTED_BASH}`;
    return `
      <section class="vr-update-center" id="vr-update-center">
        <div class="vr-update-head">
          <div>
            <h2>⬆️ Atualização do sistema</h2>
            <p>Área restrita ao síndico, administração e proprietário para atualizar o Vitória Régia com segurança.</p>
          </div>
          <span class="vr-update-badge">Versão atual: <b>${getVersionText()}</b></span>
        </div>

        <div class="vr-update-grid">
          <div class="vr-update-card">
            <strong>1. Conferir arquivo</strong>
            <small>O arquivo correto desta versão deve se chamar <b>${EXPECTED_ZIP}</b>.</small>
            <div class="vr-update-file">
              <input type="file" accept=".zip" data-vr-update-file>
              <div class="vr-update-status" data-vr-update-status>Selecione o ZIP para validar o nome antes de enviar pelo Termux.</div>
            </div>
          </div>

          <div class="vr-update-card">
            <strong>2. Executar pelo Termux</strong>
            <small>Use o bash versionado para evitar subir versão antiga por engano.</small>
            <div class="vr-update-actions">
              <a class="vr-update-btn primary" href="${EXPECTED_BASH}" download>Baixar bash</a>
              <button class="vr-update-btn" type="button" data-copy-update>Copiar comandos</button>
            </div>
            <pre class="vr-update-code" data-vr-update-code>${commands}</pre>
          </div>

          <div class="vr-update-card">
            <strong>3. Publicar no servidor</strong>
            <small>Após enviar ao GitHub, faça o deploy manual no Render para colocar a versão no ar.</small>
            <div class="vr-update-actions">
              <a class="vr-update-btn" href="https://github.com/bmedeiros1987/vitoriaregia1" target="_blank" rel="noopener">Abrir GitHub</a>
              <button class="vr-update-btn warning" type="button" data-register-update>Registrar atualização</button>
            </div>
          </div>
        </div>

        <div class="vr-update-note">
          <b>Importante:</b> por segurança, o sistema não guarda token do GitHub e não altera o servidor sozinho.
          A atualização é feita pelo arquivo ZIP versionado + bash do Termux, com validação de versão antes do envio.
        </div>
      </section>
    `;
  }

  function injectPanel() {
    if (!logged() || !allowed()) return;
    if (document.getElementById('vr-update-center')) return;

    const mount = configMount();
    if (!mount) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = panelHtml();
    const panel = wrapper.firstElementChild;
    mount.insertBefore(panel, mount.firstChild);

    const file = panel.querySelector('[data-vr-update-file]');
    const status = panel.querySelector('[data-vr-update-status]');
    const code = panel.querySelector('[data-vr-update-code]');
    const copyBtn = panel.querySelector('[data-copy-update]');
    const registerBtn = panel.querySelector('[data-register-update]');

    file.addEventListener('change', () => {
      const selected = file.files && file.files[0];
      if (!selected) {
        status.textContent = 'Nenhum arquivo selecionado.';
        return;
      }
      if (selected.name === EXPECTED_ZIP) {
        status.innerHTML = `✅ Arquivo correto: <b>${selected.name}</b>. Você pode executar o bash versionado.`;
      } else if (/vitoriaregia_update_v\d+\.\d+\.\d+\.zip/i.test(selected.name)) {
        status.innerHTML = `⚠️ O arquivo é versionado, mas não é a versão esperada. Selecionado: <b>${selected.name}</b>. Esperado: <b>${EXPECTED_ZIP}</b>.`;
      } else {
        status.innerHTML = `⚠️ Nome fora do padrão. Recomendo renomear para <b>${EXPECTED_ZIP}</b> antes de atualizar.`;
      }
    });

    copyBtn.addEventListener('click', () => {
      code.style.display = 'block';
      copy(code.textContent.trim());
    });

    registerBtn.addEventListener('click', async () => {
      const payload = { version: APP_VERSION, registeredAt: new Date().toISOString(), by: session().email || session().name || 'usuário' };
      try {
        await fetch('/api/admin/system/update-log', {
          method:'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (_) {
        const log = parse(localStorage.getItem('vrUpdateLog'), []);
        log.unshift(payload);
        localStorage.setItem('vrUpdateLog', JSON.stringify(log.slice(0, 20)));
      }
      toast('Atualização registrada no histórico.');
    });
  }

  function init() {
    if (!logged()) return;
    document.body.classList.remove('vr-role-morador','vr-role-portaria','vr-role-limpeza','vr-role-zeladoria','vr-role-sindico','vr-role-admin','vr-role-owner');
    document.body.classList.add('vr-role-' + role());
    addMenuButton();
    injectPanel();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  const observer = new MutationObserver(() => {
    addMenuButton();
    if (document.querySelector('#settings[data-section], #configuracoes[data-section], [data-page="configuracoes"], [data-section="configuracoes"]')) injectPanel();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
