
// Vitória Régia v4.4.1 — atualização pelo sistema, cache/versionamento, menu e OCR
(function () {
  const VERSION = 'v4.4.1';
  const EXPECTED_ZIP = `vitoriaregia_update_${VERSION}.zip`;
  const EXPECTED_BASH = `enviar_vitoriaregia_termux_${VERSION}.sh`;

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
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
    return 'morador';
  }

  function allowedUpdate() {
    return ['owner', 'admin', 'sindico'].includes(role());
  }

  function logged() {
    const app = document.querySelector('[data-app]');
    const login = document.querySelector('[data-login-screen]');
    return Boolean(document.body.classList.contains('vr-authenticated') || (app && !app.hidden && (!login || login.hidden)));
  }

  function toast(message) {
    let box = document.querySelector('.vr440-emergency-toast');
    if (!box) {
      box = document.createElement('div');
      box.className = 'vr440-emergency-toast';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('is-open');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('is-open'), 3600);
  }

  async function refreshFooterVersion() {
    let display = VERSION;
    try {
      const res = await fetch(`/VERSION.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        display = data.display || data.version || VERSION;
      }
    } catch (_) {}

    document.querySelectorAll('[data-system-version-footer] strong, .system-version-footer strong').forEach(el => {
      el.textContent = display;
    });
  }

  async function clearOldCachesOnce() {
    const key = 'vrCacheCleared-' + VERSION;
    if (localStorage.getItem(key) === 'true') return;
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.update().catch(() => null)));
      }
      localStorage.setItem(key, 'true');
    } catch (_) {}
  }

  function fixMenu() {
    if (!logged()) return;
    const sidebar = document.querySelector('[data-sidebar]');
    if (!sidebar) return;

    sidebar.querySelectorAll('.vr441-menu-head').forEach((el, idx) => { if (idx > 0) el.remove(); });
    if (!sidebar.querySelector('.vr441-menu-head')) {
      const head = document.createElement('div');
      head.className = 'vr441-menu-head';
      head.innerHTML = '<strong>Menu</strong><button type="button" class="vr441-menu-close" data-vr441-menu-close>Fechar ×</button>';
      sidebar.insertBefore(head, sidebar.firstChild);
    }

    const openBtn = document.querySelector('[data-menu-open]');
    if (openBtn && !openBtn.dataset.vr441) {
      openBtn.dataset.vr441 = '1';
      openBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        document.body.classList.add('sidebar-open', 'no-scroll');
        sidebar.classList.add('is-open');
        document.querySelector('[data-sidebar-shadow]')?.classList.add('is-open');
      }, true);
    }

    const closeBtn = sidebar.querySelector('[data-vr441-menu-close]');
    if (closeBtn && !closeBtn.dataset.vr441) {
      closeBtn.dataset.vr441 = '1';
      closeBtn.addEventListener('click', closeMenu);
    }

    const shadow = document.querySelector('[data-sidebar-shadow]');
    if (shadow && !shadow.dataset.vr441) {
      shadow.dataset.vr441 = '1';
      shadow.addEventListener('click', closeMenu);
    }

    sidebar.querySelectorAll('a[data-nav]').forEach(a => {
      if (!a.dataset.vr441) {
        a.dataset.vr441 = '1';
        a.addEventListener('click', () => setTimeout(closeMenu, 90));
      }
    });
  }

  function closeMenu() {
    document.body.classList.remove('sidebar-open', 'no-scroll');
    document.querySelector('[data-sidebar]')?.classList.remove('is-open');
    document.querySelector('[data-sidebar-shadow]')?.classList.remove('is-open');
  }

  function goConfigUpdate() {
    const config = document.querySelector('[href="#configuracoes"], [data-route="configuracoes"], [data-nav][href="#configuracoes"]');
    if (config) config.click();
    else location.hash = 'configuracoes';
    setTimeout(() => {
      injectUpdateCenter();
      document.getElementById('vr441-update-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
    closeMenu();
  }

  function addUpdateMenuButton() {
    if (!logged() || !allowedUpdate()) return;
    if (document.querySelector('[data-vr441-update-menu]')) return;
    const nav = document.querySelector('[data-sidebar] .nav, .sidebar .nav, [data-sidebar] nav');
    if (!nav) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vr-update-menu-button';
    btn.setAttribute('data-vr441-update-menu', 'true');
    btn.innerHTML = '<span>⬆️</span><span>Atualizar sistema</span>';
    btn.addEventListener('click', goConfigUpdate);
    nav.appendChild(btn);
  }

  function updateCenterHtml() {
    return `
      <section class="vr441-update" id="vr441-update-center">
        <div class="vr441-update-head">
          <h2>⬆️ Atualização do sistema</h2>
          <p>Envie aqui o ZIP que foi gerado para o Vitória Régia. O sistema valida, envia ao GitHub e aciona o deploy quando configurado.</p>
        </div>

        <div class="vr441-update-grid">
          <div class="vr441-update-card">
            <h3>Atualizar pelo ZIP</h3>
            <p>Arquivo esperado: <b>${EXPECTED_ZIP}</b></p>
            <div class="vr441-upload">
              <input type="file" accept=".zip,application/zip" data-vr441-update-file>
              <div class="vr441-progress"><span data-vr441-progress-bar></span></div>
              <div class="vr441-status" data-vr441-update-status>Selecione o ZIP da versão atual para iniciar.</div>
              <div class="vr441-update-actions">
                <button class="vr441-btn primary" type="button" data-vr441-send-update>Enviar atualização</button>
                <button class="vr441-btn" type="button" data-vr441-check-version>Verificar versão na tela</button>
              </div>
            </div>
          </div>

          <div class="vr441-update-card">
            <h3>Fallback pelo Termux</h3>
            <p>Se o upload pelo sistema falhar, use o bash versionado.</p>
            <div class="vr441-update-actions">
              <a class="vr441-btn" href="${EXPECTED_BASH}" download>Baixar bash</a>
              <button class="vr441-btn warn" type="button" data-vr441-copy-termux>Copiar comandos</button>
            </div>
            <div class="vr441-status" data-vr441-termux-code style="display:none;">cd /storage/emulated/0/Download<br>bash ${EXPECTED_BASH}</div>
          </div>
        </div>

        <div class="vr441-status" style="margin-top:12px;">
          Para funcionar 100% pelo sistema, configure no Render:
          <b>GITHUB_UPDATE_TOKEN</b>, <b>GITHUB_REPOSITORY=bmedeiros1987/vitoriaregia1</b> e, se quiser deploy automático, <b>RENDER_DEPLOY_HOOK_URL</b>.
        </div>
      </section>`;
  }

  function injectUpdateCenter() {
    if (!logged() || !allowedUpdate()) return;
    if (document.getElementById('vr441-update-center')) return;

    const mount = document.querySelector('#configuracoes[data-section], [data-section="configuracoes"], [data-page="configuracoes"], main') || document.body;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = updateCenterHtml();
    const panel = wrapper.firstElementChild;
    mount.insertBefore(panel, mount.firstChild);

    const fileInput = panel.querySelector('[data-vr441-update-file]');
    const sendBtn = panel.querySelector('[data-vr441-send-update]');
    const status = panel.querySelector('[data-vr441-update-status]');
    const bar = panel.querySelector('[data-vr441-progress-bar]');

    function setProgress(p, text) {
      bar.style.width = `${Math.max(0, Math.min(100, p))}%`;
      if (text) status.innerHTML = text;
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return setProgress(0, 'Nenhum arquivo selecionado.');
      if (file.name !== EXPECTED_ZIP) {
        setProgress(0, `⚠️ O nome do arquivo é <b>${file.name}</b>. O esperado é <b>${EXPECTED_ZIP}</b>.`);
      } else {
        setProgress(5, `✅ Arquivo correto selecionado: <b>${file.name}</b>.`);
      }
    });

    sendBtn.addEventListener('click', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return setProgress(0, 'Selecione o ZIP antes de enviar.');
      if (file.name !== EXPECTED_ZIP && !confirm('O nome do ZIP não é o esperado. Deseja continuar mesmo assim?')) return;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/admin/system/upload-update?filename=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('Content-Type', 'application/zip');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const uploadPct = Math.round((event.loaded / event.total) * 35);
          setProgress(uploadPct, `Enviando ZIP para o servidor... ${uploadPct}%`);
        }
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) setProgress(45, 'ZIP recebido. Validando versão e preparando atualização...');
        if (xhr.readyState === 3) setProgress(70, 'Atualizando repositório no GitHub...');
        if (xhr.readyState === 4) {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
              setProgress(100, `✅ Atualização enviada. Commit: <b>${data.commit || 'registrado'}</b>. ${data.deployTriggered ? 'Deploy acionado.' : 'Agora faça o deploy no Render, se não houver hook configurado.'}`);
              setTimeout(refreshFooterVersion, 1500);
            } else {
              setProgress(0, `❌ Falha: ${data.error || xhr.statusText || 'não foi possível atualizar.'}`);
            }
          } catch (_) {
            setProgress(0, '❌ Falha ao interpretar resposta do servidor.');
          }
        }
      };

      xhr.onerror = () => setProgress(0, '❌ Erro de conexão durante o envio.');
      setProgress(10, 'Iniciando atualização...');
      xhr.send(file);
    });

    panel.querySelector('[data-vr441-check-version]')?.addEventListener('click', () => {
      refreshFooterVersion();
      toast('Versão conferida no rodapé.');
    });

    panel.querySelector('[data-vr441-copy-termux]')?.addEventListener('click', () => {
      const cmd = `cd /storage/emulated/0/Download\nbash ${EXPECTED_BASH}`;
      navigator.clipboard?.writeText(cmd).then(() => toast('Comandos copiados.'));
      const code = panel.querySelector('[data-vr441-termux-code]');
      if (code) code.style.display = 'block';
    });
  }

  function ensureOcrModal() {
    let modal = document.querySelector('.vr441-ocr-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'vr441-ocr-modal';
    modal.innerHTML = `
      <div class="vr441-ocr-card">
        <h2>Analisando etiqueta</h2>
        <p data-vr441-ocr-message>O sistema está procurando código de barras, QR Code, nome, unidade e transportadora.</p>
        <div class="vr441-ocr-percent" data-vr441-ocr-percent>0%</div>
        <div class="vr441-progress"><span data-vr441-ocr-bar></span></div>
        <div class="vr441-ocr-steps">
          <span data-step="1">1. Melhorando a imagem</span>
          <span data-step="2">2. Procurando código/QR</span>
          <span data-step="3">3. Lendo texto da etiqueta</span>
          <span data-step="4">4. Sugerindo morador e unidade</span>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function startOcrProgress(kind) {
    const modal = ensureOcrModal();
    const percent = modal.querySelector('[data-vr441-ocr-percent]');
    const bar = modal.querySelector('[data-vr441-ocr-bar]');
    const msg = modal.querySelector('[data-vr441-ocr-message]');
    let p = 3;
    modal.classList.add('is-open');
    msg.textContent = kind === 'nota'
      ? 'O sistema está analisando a nota/cupom para sugerir valor, data e fornecedor.'
      : 'O sistema está analisando a etiqueta para sugerir morador, unidade, transportadora e código.';

    function render(value) {
      p = Math.max(p, Math.min(value, 98));
      percent.textContent = `${Math.round(p)}%`;
      bar.style.width = `${Math.round(p)}%`;
      modal.querySelectorAll('[data-step]').forEach(step => {
        step.classList.toggle('is-active', Number(step.dataset.step) <= Math.ceil(p / 25));
      });
    }

    render(3);
    clearInterval(window.__vr441OcrTimer);
    window.__vr441OcrTimer = setInterval(() => {
      if (p < 35) render(p + 5);
      else if (p < 70) render(p + 3);
      else if (p < 92) render(p + 1.5);
    }, 650);

    clearTimeout(window.__vr441OcrFailSafe);
    window.__vr441OcrFailSafe = setTimeout(() => finishOcrProgress(false), 45000);
  }

  function finishOcrProgress(success = true) {
    const modal = ensureOcrModal();
    const percent = modal.querySelector('[data-vr441-ocr-percent]');
    const bar = modal.querySelector('[data-vr441-ocr-bar]');
    const msg = modal.querySelector('[data-vr441-ocr-message]');
    clearInterval(window.__vr441OcrTimer);
    clearTimeout(window.__vr441OcrFailSafe);
    percent.textContent = success ? '100%' : 'Atenção';
    bar.style.width = success ? '100%' : '92%';
    msg.textContent = success ? 'Análise concluída. Confira os campos antes de salvar.' : 'A análise demorou mais que o esperado. Confira os campos ou tente outra foto.';
    setTimeout(() => modal.classList.remove('is-open'), success ? 1400 : 2600);
  }

  function patchOcrProgress() {
    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!target || !target.matches) return;
      if (target.matches('[data-package-label-image]')) startOcrProgress('etiqueta');
      if (target.matches('[data-finance-invoice-image]')) startOcrProgress('nota');
    }, true);

    const observer = new MutationObserver(() => {
      const texts = [
        document.querySelector('[data-package-scan-message]')?.textContent || '',
        document.querySelector('[data-finance-invoice-message]')?.textContent || ''
      ].join(' ').toLowerCase();

      if (/conclu[ií]da|confira os campos|preenchid|identifiquei|leitura conclu/.test(texts)) finishOcrProgress(true);
      if (/n[aã]o foi poss[ií]vel|erro|falhou/.test(texts)) finishOcrProgress(false);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    refreshFooterVersion();
    clearOldCachesOnce();
    fixMenu();
    addUpdateMenuButton();
    injectUpdateCenter();
  }

  patchOcrProgress();
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  window.addEventListener('hashchange', () => setTimeout(init, 120));
  const observer = new MutationObserver(() => init());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
