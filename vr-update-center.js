(function () {
  const VERSION = '2026.05.21.3';
  const PACKAGE_NAME = 'vitoriaregia_update.zip';

  function isAdminLike() {
    const raw = [
      localStorage.getItem('role'),
      localStorage.getItem('userRole'),
      localStorage.getItem('perfil'),
      localStorage.getItem('currentUser'),
      localStorage.getItem('user')
    ].filter(Boolean).join(' ').toLowerCase();
    return /admin|sind|subsind|portaria|porteiro/.test(raw) || !raw;
  }

  function findMount() {
    return document.querySelector('#dashboard') ||
      document.querySelector('[data-page="dashboard"]') ||
      document.querySelector('.dashboard') ||
      document.querySelector('main') ||
      document.body;
  }

  function showLog(message) {
    const log = document.querySelector('.vr-update-log');
    if (!log) return;
    log.textContent = message;
    log.classList.add('visible');
  }

  function createCenter() {
    if (document.querySelector('.vr-update-center')) return;
    if (!isAdminLike()) return;
    const mount = findMount();
    if (!mount) return;

    const center = document.createElement('section');
    center.className = 'vr-update-center';
    center.innerHTML = `
      <div class="vr-update-center__header">
        <div>
          <h2 class="vr-update-center__title">Central de Atualizações</h2>
          <p class="vr-update-center__subtitle">Atualizações no padrão profissional: backup antes de instalar, validação dos arquivos críticos, log da operação e rollback.</p>
        </div>
        <div class="vr-update-center__badge">Sistema atualizado</div>
      </div>
      <div class="vr-update-center__body">
        <div class="vr-update-card">
          <div class="vr-update-card__label">Versão instalada</div>
          <div class="vr-update-card__value">${VERSION}</div>
        </div>
        <div class="vr-update-card">
          <div class="vr-update-card__label">Pacote padrão</div>
          <div class="vr-update-card__value">${PACKAGE_NAME}</div>
        </div>
        <div class="vr-update-card">
          <div class="vr-update-card__label">Proteção</div>
          <div class="vr-update-card__value">Backup + rollback</div>
        </div>
      </div>
      <div class="vr-update-center__actions">
        <button type="button" class="vr-update-button" data-vr-update="instructions">Como atualizar</button>
        <button type="button" class="vr-update-button secondary" data-vr-update="repair">Corrigir erro do Render</button>
        <button type="button" class="vr-update-button secondary" data-vr-update="rollback">Rollback</button>
      </div>
      <pre class="vr-update-log"></pre>
    `;

    mount.appendChild(center);
    center.addEventListener('click', (event) => {
      const action = event.target && event.target.getAttribute('data-vr-update');
      if (!action) return;
      if (action === 'instructions') {
        showLog('No Termux:\n\ntermux-setup-storage\npkg install git unzip rsync nodejs-lts curl -y\ncd /storage/emulated/0/Download\nbash atualizador_profissional_vitoriaregia.sh\n\nO script clona uma cópia limpa, aplica o pacote, valida backend/src/server.js, cria backup e envia ao GitHub com token digitado na hora.');
      }
      if (action === 'repair') {
        showLog('Correção do Render:\n\ncd /storage/emulated/0/Download\nbash atualizador_profissional_vitoriaregia.sh repair\n\nEsse modo restaura backend/src/server.js a partir do GitHub, valida o backend e envia a correção.');
      }
      if (action === 'rollback') {
        showLog('Rollback:\n\ncd /storage/emulated/0/Download\nbash atualizador_profissional_vitoriaregia.sh rollback\n\nO script restaura o backup local mais recente criado antes da atualização.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', createCenter);
  window.addEventListener('load', createCenter);
  const observer = new MutationObserver(createCenter);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
