(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const state = {
    lastTemplateKey: '',
    lastParseAt: 0,
    scannerCleanup: null,
    scannerOverlay: null,
  };

  function asUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return new URL(raw, window.location.href);
    } catch {
      return null;
    }
  }

  function replaceApiPath(url, path) {
    if (!url) return path;
    const next = new URL(url.toString());
    next.pathname = path;
    next.search = '';
    return next.toString();
  }

  async function readJsonBody(input, init = {}) {
    const body = init?.body;
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch { return null; }
    }
    if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
    if (body instanceof FormData) return Object.fromEntries(body.entries());
    if (input instanceof Request) {
      try {
        const text = await input.clone().text();
        return text ? JSON.parse(text) : null;
      } catch { return null; }
    }
    return null;
  }

  function authHeaders(input, init = {}) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    return headers;
  }

  async function smartParse(input, init, url) {
    const smartUrl = replaceApiPath(url, '/api/ocr-intelligence/parse-package');
    try {
      const response = await nativeFetch(smartUrl, init);
      if (response.ok) {
        response.clone().json().then(data => {
          state.lastTemplateKey = String(data?.template_key || '');
          state.lastParseAt = Date.now();
          try {
            sessionStorage.setItem('vr_last_package_template', state.lastTemplateKey);
          } catch {}
        }).catch(() => null);
        return response;
      }
      if (![404, 405, 500, 502, 503].includes(response.status)) return response;
    } catch {
      // O leitor original continua como contingência segura.
    }
    return nativeFetch(input, init);
  }

  function learnInBackground(url, payload, headers) {
    if (!payload?.extracted_text) return;
    const templateKey = state.lastTemplateKey || (() => {
      try { return sessionStorage.getItem('vr_last_package_template') || ''; } catch { return ''; }
    })();
    const body = {
      ...payload,
      template_key: templateKey,
      learned_from: 'package_registration',
    };
    const learningUrl = replaceApiPath(url, '/api/ocr-intelligence/learn-package');
    const requestHeaders = new Headers(headers || {});
    requestHeaders.set('Content-Type', 'application/json');
    window.setTimeout(() => {
      nativeFetch(learningUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => null);
    }, 60);
  }

  window.fetch = async function enhancedFetch(input, init = {}) {
    const url = asUrl(input);
    const pathname = url?.pathname || '';
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();

    if (method === 'POST' && pathname.endsWith('/api/ocr/parse-package')) {
      return smartParse(input, init, url);
    }

    if (method === 'POST' && pathname.endsWith('/api/packages')) {
      const payloadPromise = readJsonBody(input, init);
      const response = await nativeFetch(input, init);
      if (response.ok) {
        payloadPromise.then(payload => learnInBackground(url, payload, authHeaders(input, init))).catch(() => null);
      }
      return response;
    }

    return nativeFetch(input, init);
  };

  function stopTracks(video) {
    try { video?.srcObject?.getTracks?.().forEach(track => track.stop()); } catch {}
  }

  function addAutoBadge(overlay) {
    const guide = overlay.querySelector('.cameraGuide');
    if (!guide || guide.querySelector('.vr-auto-capture-status')) return null;
    const badge = document.createElement('small');
    badge.className = 'vr-auto-capture-status';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.textContent = 'Leitura automática preparando a câmera…';
    guide.appendChild(badge);
    return badge;
  }

  function calculateFrameMetrics(ctx, width, height, previous) {
    const image = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    let brightness = 0;
    let edge = 0;
    let motion = 0;
    for (let index = 0, pixel = 0; index < image.length; index += 4, pixel += 1) {
      const value = Math.round(image[index] * 0.299 + image[index + 1] * 0.587 + image[index + 2] * 0.114);
      gray[pixel] = value;
      brightness += value;
      if (previous) motion += Math.abs(value - previous[pixel]);
      if (pixel % width > 0) edge += Math.abs(value - gray[pixel - 1]);
      if (pixel >= width) edge += Math.abs(value - gray[pixel - width]);
    }
    const count = gray.length || 1;
    return {
      gray,
      brightness: brightness / count,
      sharpness: edge / (count * 2),
      motion: previous ? motion / count : 999,
    };
  }

  function activateScanner(overlay) {
    if (!overlay || overlay === state.scannerOverlay) return;
    state.scannerCleanup?.();
    state.scannerOverlay = overlay;
    document.body.classList.add('vr-scanner-open');
    const video = overlay.querySelector('video');
    const captureButton = overlay.querySelector('.cameraReaderActions .confirmAction');
    const closeButton = overlay.querySelector('[aria-label="Fechar"]');
    const statusLine = overlay.querySelector('.cameraReaderHead small');
    const badge = addAutoBadge(overlay);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let previous = null;
    let stableFrames = 0;
    let captured = false;
    let startedAt = Date.now();
    let interval = null;

    function setText(text, tone = '') {
      if (badge) {
        badge.textContent = text;
        badge.dataset.tone = tone;
      }
    }

    function cleanup() {
      if (interval) window.clearInterval(interval);
      interval = null;
      state.scannerOverlay = null;
      state.scannerCleanup = null;
      document.body.classList.remove('vr-scanner-open');
    }

    function finishCapture() {
      if (captured || !captureButton) return;
      captured = true;
      setText('Etiqueta identificada. Capturando automaticamente…', 'ready');
      overlay.classList.add('vr-auto-capturing');
      captureButton.click();
      window.setTimeout(() => {
        if (document.body.contains(overlay)) {
          stopTracks(video);
          closeButton?.click();
        }
      }, 4500);
    }

    function analyze() {
      if (!document.body.contains(overlay)) {
        cleanup();
        return;
      }
      if (captured || !video || !context || video.readyState < 2 || !video.videoWidth) return;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const metrics = calculateFrameMetrics(context, canvas.width, canvas.height, previous);
        previous = metrics.gray;
        const hasCode = Boolean(overlay.querySelector('.scannerDetectedBox'));
        const goodLight = metrics.brightness >= 42 && metrics.brightness <= 222;
        const sharp = metrics.sharpness >= 10.5;
        const still = metrics.motion <= (hasCode ? 11 : 7.2);
        const elapsed = Date.now() - startedAt;

        if (!goodLight) {
          stableFrames = 0;
          setText(metrics.brightness < 42 ? 'Aproxime a etiqueta de uma área mais iluminada.' : 'Evite reflexo direto sobre a etiqueta.', 'warn');
          return;
        }
        if (!sharp) {
          stableFrames = 0;
          setText('Aproxime um pouco e mantenha o celular firme.', 'warn');
          return;
        }
        if (!still) {
          stableFrames = Math.max(0, stableFrames - 1);
          setText('Mantenha a etiqueta parada por um instante.', '');
          return;
        }

        stableFrames += 1;
        const required = hasCode ? 2 : 4;
        setText(hasCode ? 'Código localizado. Confirmando enquadramento…' : `Imagem nítida ${Math.min(required, stableFrames)}/${required}`, 'ok');
        if (elapsed > 1400 && stableFrames >= required) finishCapture();
      } catch {
        // A captura manual permanece disponível em navegadores restritivos.
      }
    }

    interval = window.setInterval(analyze, 420);
    state.scannerCleanup = cleanup;
    setText('Centralize a etiqueta. A captura será automática quando a imagem estiver nítida.');
  }

  function syncTelegramSessionError() {
    const errorCard = document.querySelector('#vr-telegram-call-root .vr-call-error');
    if (!errorCard || errorCard.dataset.vrSessionHandled === 'true') return;
    const message = String(errorCard.querySelector('p')?.textContent || '');
    if (!/sess[aã]o.*(inv[aá]lida|expirada)|token.*expir/i.test(message)) return;
    errorCard.dataset.vrSessionHandled = 'true';
    const title = errorCard.querySelector('h3');
    const paragraph = errorCard.querySelector('p');
    const button = errorCard.querySelector('button');
    if (title) title.textContent = 'Sua sessão expirou';
    if (paragraph) paragraph.textContent = 'Entre novamente para abrir as chamadas e manter as integrações protegidas.';
    if (button) {
      button.textContent = 'Entrar novamente';
      button.removeAttribute('data-vr-call-retry');
      button.addEventListener('click', () => {
        try { localStorage.removeItem('vr_token'); localStorage.removeItem('vr_user'); } catch {}
        window.location.reload();
      }, { once: true });
    }
  }

  function syncUiState() {
    const overlay = document.querySelector('.cameraReaderOverlay');
    if (overlay) activateScanner(overlay);
    else if (state.scannerOverlay) state.scannerCleanup?.();
    syncTelegramSessionError();
  }

  const observer = new MutationObserver(syncUiState);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      syncUiState();
    }, { once: true });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    syncUiState();
  }
})();
