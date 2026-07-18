(() => {
  'use strict';

  const IDS = {
    tools: 'vr-presentation-tools',
    modal: 'vr-presentation-modal',
    nudge: 'vr-telegram-nudge',
    toast: 'vr-presentation-toast'
  };

  const state = {
    mode: '',
    loading: false,
    error: '',
    profile: null,
    calls: null,
    linkUrl: '',
    manifest: null,
    deferredInstall: null,
    pollTimer: null,
    syncTimer: null,
    activeTabTimer: null
  };

  const adminRoles = new Set(['master', 'admin', 'sindico', 'subsindico', 'portaria']);

  function currentUser() {
    try { return JSON.parse(localStorage.getItem('vr_user') || 'null'); }
    catch { return null; }
  }

  function currentRole() {
    return String(currentUser()?.role || 'morador').toLowerCase();
  }

  function authToken() {
    return localStorage.getItem('vr_token') || '';
  }

  function hasSession() {
    return Boolean(authToken() && currentUser());
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  async function api(path, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch { body = { raw: text }; }
    if (!response.ok) throw new Error(body.error || body.message || body.description || `Erro ${response.status}`);
    return body;
  }

  function toast(message, tone = 'ok') {
    let node = document.getElementById(IDS.toast);
    if (!node) {
      node = document.createElement('div');
      node.id = IDS.toast;
      document.body.appendChild(node);
    }
    node.className = `vr-presentation-toast ${tone}`;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._hideTimer);
    node._hideTimer = setTimeout(() => { node.hidden = true; }, 5000);
  }

  function findMenuHost() {
    return document.querySelector('.appShell > aside > nav, .appShell aside nav, aside nav');
  }

  function findConfigButton(host) {
    return [...(host?.children || [])].find(node => node.matches?.('button') && /configura/i.test(node.textContent || '')) || null;
  }

  function normalizeManagementMenu(host) {
    const section = document.getElementById('vr-integrated-menu');
    if (!section || !host) return;
    section.classList.add('vr-management-single');
    section.querySelector('.vr-integrated-menu-title')?.setAttribute('aria-hidden', 'true');
    const main = section.querySelector('.vr-integrated-mainbutton');
    if (main) {
      const label = main.querySelector('span');
      if (label) label.textContent = 'Central de Gestão';
      main.setAttribute('aria-label', 'Abrir Central de Gestão');
      main.title = 'Abrir Central de Gestão';
    }
    const config = findConfigButton(host);
    if (config && section.nextElementSibling !== config) host.insertBefore(section, config);
  }

  function createToolButton(kind, label, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vr-premium-tool-button';
    button.dataset.vrPresentationAction = kind;
    button.innerHTML = `<span aria-hidden="true">${icon}</span><b>${label}</b>`;
    button.addEventListener('click', () => openModal(kind));
    return button;
  }

  function ensureToolsMenu(host) {
    if (!host || !hasSession()) return;
    let section = document.getElementById(IDS.tools);
    if (section && section.parentElement !== host) section.remove();
    section = document.getElementById(IDS.tools);
    if (!section) {
      section = document.createElement('section');
      section.id = IDS.tools;
      section.className = 'vr-premium-tools-menu';
      section.innerHTML = '<small>CONEXÕES</small><div class="vr-premium-tools-grid"></div>';
      const grid = section.querySelector('.vr-premium-tools-grid');
      grid.append(
        createToolButton('telegram', 'Telegram', '✈'),
        createToolButton('android', 'Android', '⬇')
      );
    }
    const config = findConfigButton(host);
    if (!section.isConnected) host.insertBefore(section, config || null);
    else if (config && section.nextElementSibling !== config) host.insertBefore(section, config);
  }

  function hideLegacyLaunchers() {
    ['vr-telegram-call-native-entry', 'vr-telegram-call-menu', 'vr-telegram-call-fallback-entry']
      .forEach(id => document.getElementById(id)?.setAttribute('aria-hidden', 'true'));
  }

  function syncBodyLock() {
    const open = Boolean(document.querySelector('.appShell.mobile-open'));
    document.body.classList.toggle('vr-mobile-menu-lock', open);
  }

  function centerActiveTab() {
    document.querySelectorAll('.subTabs, .configTabs, .vr-suite-layout > nav').forEach(host => {
      const active = host.querySelector('button.active, button[aria-current="page"]');
      if (!active || host.scrollWidth <= host.clientWidth + 4) return;
      const target = Math.max(0, active.offsetLeft - (host.clientWidth - active.offsetWidth) / 2);
      if (Math.abs(host.scrollLeft - target) > 12) host.scrollTo({ left: target, behavior: 'smooth' });
    });
  }

  function syncModalPosition() {
    const modal = document.getElementById(IDS.modal);
    const shell = document.querySelector('.appShell');
    if (!modal) return;
    modal.classList.toggle('vr-menu-closed', Boolean(shell?.classList.contains('menu-closed')));
    modal.classList.toggle('vr-menu-floating', Boolean(shell?.classList.contains('menu-floating')));
    modal.classList.toggle('vr-menu-horizontal', Boolean(shell?.classList.contains('menu-horizontal')));
  }

  function ensureNavigation() {
    hideLegacyLaunchers();
    syncBodyLock();
    syncModalPosition();
    if (!hasSession()) {
      document.getElementById(IDS.tools)?.remove();
      document.getElementById(IDS.nudge)?.remove();
      return;
    }
    const host = findMenuHost();
    if (!host) return;
    normalizeManagementMenu(host);
    ensureToolsMenu(host);
    clearTimeout(state.activeTabTimer);
    state.activeTabTimer = setTimeout(centerActiveTab, 50);
  }

  function ensureModal() {
    let root = document.getElementById(IDS.modal);
    if (root) return root;
    root = document.createElement('div');
    root.id = IDS.modal;
    root.hidden = true;
    root.innerHTML = `
      <div class="vr-presentation-backdrop" data-vr-modal-close></div>
      <section class="vr-presentation-shell" role="dialog" aria-modal="true" aria-label="Central de conexões">
        <header class="vr-presentation-header">
          <div><span>VITÓRIA RÉGIA PRO</span><h2 id="vr-presentation-title">Central de conexões</h2><p id="vr-presentation-subtitle"></p></div>
          <button type="button" data-vr-modal-close aria-label="Fechar">×</button>
        </header>
        <main id="vr-presentation-content"></main>
      </section>`;
    document.body.appendChild(root);
    root.addEventListener('click', handleModalClick);
    return root;
  }

  function closeModal() {
    const root = document.getElementById(IDS.modal);
    if (root) root.hidden = true;
    document.body.classList.remove('vr-presentation-modal-open');
    state.mode = '';
    stopTelegramPolling();
  }

  async function openModal(mode) {
    state.mode = mode;
    state.error = '';
    state.loading = true;
    const root = ensureModal();
    root.hidden = false;
    document.body.classList.add('vr-presentation-modal-open');
    renderModal();
    try {
      if (mode === 'telegram') await loadTelegramSetup(true);
      else await loadAndroidSetup();
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      renderModal();
    }
  }

  function setModalHead(title, subtitle) {
    const root = ensureModal();
    const h = root.querySelector('#vr-presentation-title');
    const p = root.querySelector('#vr-presentation-subtitle');
    if (h) h.textContent = title;
    if (p) p.textContent = subtitle;
  }

  function profileTelegram() {
    const profile = state.profile || {};
    const user = profile.user || {};
    const resident = profile.resident || {};
    return {
      chatId: String(user.telegram_chat_id || resident.telegram_chat_id || '').trim(),
      username: String(user.telegram_username || resident.telegram_username || '').trim()
    };
  }

  function successfulCallExists() {
    return Boolean((state.calls?.history || []).some(item => item.status === 'solicitada'));
  }

  function telegramProgress() {
    const tg = profileTelegram();
    let done = 0;
    if (tg.chatId) done += 1;
    if (tg.username) done += 1;
    if (successfulCallExists()) done += 1;
    return { done, percent: Math.round((done / 3) * 100), tg };
  }

  async function loadTelegramSetup(autoGenerate = false) {
    const [profile, calls] = await Promise.all([
      api('/api/profile'),
      api('/api/telegram-calls/status').catch(() => null)
    ]);
    state.profile = profile;
    state.calls = calls;
    const { chatId } = profileTelegram();
    if (!chatId && autoGenerate && !state.linkUrl) await generateTelegramLink(false);
    if (!chatId) startTelegramPolling();
    else stopTelegramPolling();
    refreshLocalUser(profile);
  }

  function refreshLocalUser(profile) {
    const saved = currentUser();
    const user = profile?.user || {};
    const resident = profile?.resident || {};
    if (!saved) return;
    const next = {
      ...saved,
      telegram_chat_id: user.telegram_chat_id || resident.telegram_chat_id || saved.telegram_chat_id || '',
      telegram_username: user.telegram_username || resident.telegram_username || saved.telegram_username || ''
    };
    localStorage.setItem('vr_user', JSON.stringify(next));
  }

  async function generateTelegramLink(shouldRender = true) {
    const result = await api('/api/telegram/link-token', {
      method: 'POST',
      body: JSON.stringify({ entity: 'me', id: '' })
    });
    state.linkUrl = result.url || result.telegram_link_url || '';
    if (!state.linkUrl) throw new Error('O sistema não retornou o link de conexão do Telegram.');
    if (shouldRender) renderModal();
    return state.linkUrl;
  }

  function startTelegramPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(async () => {
      if (state.mode !== 'telegram' || document.getElementById(IDS.modal)?.hidden) return;
      try {
        const previous = profileTelegram().chatId;
        await loadTelegramSetup(false);
        const current = profileTelegram().chatId;
        if (!previous && current) {
          toast('Telegram conectado ao Vitória Régia.');
          stopTelegramPolling();
        }
        renderModal();
        ensureTelegramNudge();
      } catch {}
    }, 3000);
  }

  function stopTelegramPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  async function loadAndroidSetup() {
    state.manifest = await api('/api/apps/manifest');
  }

  function apkKind() {
    const role = currentRole();
    if (role === 'portaria' || role === 'funcionario') return 'portaria';
    if (['master', 'admin', 'sindico', 'subsindico', 'financeiro'].includes(role)) return 'sindico';
    return 'morador';
  }

  function apkLabel(kind) {
    return ({ portaria: 'Portaria', sindico: 'Síndico e Gestão', morador: 'Morador' }[kind] || 'Morador');
  }

  async function downloadApk() {
    if (!state.manifest) await loadAndroidSetup();
    const kind = apkKind();
    const app = state.manifest?.apps?.[kind] || {};
    if (app.enabled === false) throw new Error('O aplicativo deste perfil está temporariamente desativado.');
    if (app.url) {
      window.open(app.url, '_blank', 'noopener');
      return;
    }
    const response = await fetch(`/api/apps/download/${encodeURIComponent(kind)}`, {
      headers: authToken() ? { Authorization: `Bearer ${authToken()}` } : {}
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || 'O APK ainda não foi publicado.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vitoria-regia-${kind}.apk`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function installPwa() {
    if (!state.deferredInstall) throw new Error('A instalação rápida não está disponível neste navegador. Use o download do APK.');
    state.deferredInstall.prompt();
    const result = await state.deferredInstall.userChoice;
    if (result?.outcome === 'accepted') toast('Instalação iniciada.');
    state.deferredInstall = null;
    renderModal();
  }

  function renderModal() {
    const root = ensureModal();
    const content = root.querySelector('#vr-presentation-content');
    if (!content || root.hidden) return;

    if (state.loading) {
      setModalHead('Preparando sua experiência', 'Organizando vínculos, permissões e instalação.');
      content.innerHTML = '<div class="vr-presentation-loading"><span></span><b>Carregando configurações…</b></div>';
      return;
    }
    if (state.error) {
      setModalHead('Não foi possível concluir', 'Confira sua conexão e tente novamente.');
      content.innerHTML = `<section class="vr-presentation-error"><b>${esc(state.error)}</b><button type="button" data-vr-retry>Tentar novamente</button></section>`;
      return;
    }
    if (state.mode === 'telegram') renderTelegram(content);
    else renderAndroid(content);
  }

  function renderTelegram(content) {
    const { done, percent, tg } = telegramProgress();
    const callsEnabled = Boolean(state.calls?.preferences?.enabled);
    const tested = successfulCallExists();
    setModalHead('Telegram em três etapas', 'O sistema gera o vínculo, acompanha a conexão e leva você direto ao teste da chamada.');
    content.innerHTML = `
      <section class="vr-setup-hero">
        <div><span>CONFIGURAÇÃO ASSISTIDA</span><h3>${done === 3 ? 'Telegram pronto para uso' : 'Conecte uma vez e o sistema faz o restante'}</h3><p>Mensagens, visitantes, encomendas e emergências organizados no mesmo fluxo.</p></div>
        <div class="vr-setup-progress"><b>${percent}%</b><small>${done} de 3 etapas</small><i><span style="width:${percent}%"></span></i></div>
      </section>
      <div class="vr-setup-grid">
        ${setupStep(1, 'Vincular o bot', tg.chatId, tg.chatId ? 'Conta conectada automaticamente.' : 'Abra o bot, toque em Iniciar e volte para esta tela.', tg.chatId
          ? '<button type="button" class="secondary" data-vr-refresh-telegram>Atualizar vínculo</button>'
          : `<div class="vr-step-actions"><button type="button" class="primary" data-vr-open-link ${state.linkUrl ? '' : 'disabled'}>Conectar meu Telegram</button><button type="button" class="secondary" data-vr-copy-link ${state.linkUrl ? '' : 'disabled'}>Copiar link</button></div>`)}
        ${setupStep(2, 'Identificar seu usuário', tg.username, tg.username ? `Usuário reconhecido: ${esc(tg.username)}` : 'Defina um @username no Telegram. O sistema atualiza sozinho após o vínculo.', '<button type="button" class="secondary" data-vr-open-callmebot>Autorizar chamadas</button>')}
        ${setupStep(3, 'Validar a chamada', tested, tested ? 'Uma chamada já foi aceita pelo provedor.' : (callsEnabled ? 'Preferências ativas. Faça a chamada de teste.' : 'Ative as chamadas e escolha quais alertas podem tocar.'), '<button type="button" class="primary" data-vr-open-calls>Preferências e teste</button>')}
      </div>
      <section class="vr-setup-note"><b>Automação ativa</b><p>Enquanto esta tela estiver aberta, o Vitória Régia verifica o vínculo a cada poucos segundos. Não é necessário preencher Chat ID manualmente.</p></section>
      ${adminRoles.has(currentRole()) ? '<section class="vr-setup-admin"><b>Apresentação para moradores</b><p>O mesmo assistente aparece para cada usuário e associa somente a conta autenticada, preservando segurança e privacidade.</p></section>' : ''}`;
  }

  function setupStep(number, title, complete, description, actions) {
    return `<article class="vr-setup-step ${complete ? 'complete' : ''}"><span>${complete ? '✓' : number}</span><div><small>ETAPA ${number}</small><h4>${esc(title)}</h4><p>${description}</p>${actions || ''}</div></article>`;
  }

  function renderAndroid(content) {
    const manifest = state.manifest || {};
    const kind = apkKind();
    const app = manifest.apps?.[kind] || {};
    const ready = app.enabled !== false;
    setModalHead('Aplicativo para Android', 'Instale a versão adequada ao seu perfil com atualização centralizada.');
    content.innerHTML = `
      <section class="vr-apk-hero">
        <div class="vr-apk-logo"><img src="${esc(manifest.logoUrl || '/logo-vitoria-regia.png')}" alt="Vitória Régia"></div>
        <div><span>APP OFICIAL</span><h3>Vitória Régia — ${esc(apkLabel(kind))}</h3><p>Versão ${esc(manifest.apkVersion || manifest.systemVersion || 'atual')} · conteúdo web atualizado pelo sistema.</p></div>
        <em class="${ready ? 'ok' : 'warn'}">${ready ? 'Disponível' : 'Indisponível'}</em>
      </section>
      <div class="vr-apk-grid">
        <article><span>↻</span><div><b>Atualização inteligente</b><small>As telas online acompanham os novos deploys sem reinstalação.</small></div></article>
        <article><span>⌁</span><div><b>Perfil correto</b><small>O sistema selecionou automaticamente o aplicativo ${esc(apkLabel(kind))}.</small></div></article>
        <article><span>◇</span><div><b>Uso seguro</b><small>Emergências exigem conexão para garantir entrega em tempo real.</small></div></article>
      </div>
      <section class="vr-apk-actions-card">
        <div><b>Instalar no Android</b><p>Baixe o APK oficial ou use a instalação rápida quando o navegador oferecer essa opção.</p></div>
        <div class="vr-apk-actions">
          <button type="button" class="primary" data-vr-download-apk ${ready ? '' : 'disabled'}>Baixar APK</button>
          <button type="button" class="secondary" data-vr-install-pwa ${state.deferredInstall ? '' : 'disabled'}>Instalação rápida</button>
        </div>
      </section>`;
  }

  async function handleModalClick(event) {
    if (event.target.closest('[data-vr-modal-close]')) return closeModal();
    if (event.target.closest('[data-vr-retry]')) return openModal(state.mode || 'telegram');
    if (event.target.closest('[data-vr-refresh-telegram]')) {
      state.loading = true; renderModal();
      try { await loadTelegramSetup(false); state.error = ''; }
      catch (error) { state.error = error.message; }
      finally { state.loading = false; renderModal(); }
      return;
    }
    if (event.target.closest('[data-vr-open-link]')) {
      try {
        const link = state.linkUrl || await generateTelegramLink(true);
        window.open(link, '_blank', 'noopener');
        startTelegramPolling();
      } catch (error) { toast(error.message, 'error'); }
      return;
    }
    if (event.target.closest('[data-vr-copy-link]')) {
      try {
        const link = state.linkUrl || await generateTelegramLink(true);
        await navigator.clipboard.writeText(link);
        toast('Link do Telegram copiado.');
      } catch (error) { toast(error.message, 'error'); }
      return;
    }
    if (event.target.closest('[data-vr-open-callmebot]')) {
      window.open('https://t.me/CallMeBot_txtbot', '_blank', 'noopener');
      return;
    }
    if (event.target.closest('[data-vr-open-calls]')) {
      closeModal();
      const opener = window.VitoriaRegiaOpenTelegramCalls || window.VitoriaRegiaTelegramCalls?.open;
      if (opener) opener();
      else toast('A central de chamadas ainda está carregando. Atualize a página.', 'error');
      return;
    }
    if (event.target.closest('[data-vr-download-apk]')) {
      const button = event.target.closest('button');
      button.disabled = true; button.textContent = 'Preparando…';
      try { await downloadApk(); toast('Download do aplicativo iniciado.'); }
      catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; button.textContent = 'Baixar APK'; }
      return;
    }
    if (event.target.closest('[data-vr-install-pwa]')) {
      try { await installPwa(); }
      catch (error) { toast(error.message, 'error'); }
    }
  }

  async function ensureTelegramNudge() {
    if (!hasSession() || localStorage.getItem('vr_telegram_nudge_dismissed') === '1') return;
    const active = document.querySelector('.appShell aside nav button.active');
    if (!active || !/in[ií]cio/i.test(active.textContent || '')) {
      document.getElementById(IDS.nudge)?.remove();
      return;
    }
    try {
      if (!state.profile) state.profile = await api('/api/profile');
      if (profileTelegram().chatId) {
        document.getElementById(IDS.nudge)?.remove();
        return;
      }
    } catch { return; }
    const content = document.querySelector('.appShell > .content');
    const topbar = content?.querySelector('.topbar');
    if (!content || !topbar || document.getElementById(IDS.nudge)) return;
    const card = document.createElement('section');
    card.id = IDS.nudge;
    card.className = 'vr-telegram-nudge';
    card.innerHTML = '<span>✈</span><div><b>Conecte seu Telegram em poucos segundos</b><small>O Vitória Régia gera o link, identifica sua conta e acompanha a confirmação automaticamente.</small></div><button type="button" data-vr-nudge-open>Conectar</button><button type="button" data-vr-nudge-close aria-label="Fechar">×</button>';
    card.querySelector('[data-vr-nudge-open]').addEventListener('click', () => openModal('telegram'));
    card.querySelector('[data-vr-nudge-close]').addEventListener('click', () => {
      localStorage.setItem('vr_telegram_nudge_dismissed', '1');
      card.remove();
    });
    topbar.insertAdjacentElement('afterend', card);
  }

  function scheduleSync() {
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(() => {
      ensureNavigation();
      ensureTelegramNudge();
    }, 50);
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredInstall = event;
    if (state.mode === 'android') renderModal();
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstall = null;
    toast('Vitória Régia instalado com sucesso.');
  });

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-current']
  });

  window.addEventListener('hashchange', scheduleSync);
  window.addEventListener('storage', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });

  function boot() {
    ensureModal();
    ensureNavigation();
    setTimeout(ensureTelegramNudge, 1200);
    window.VitoriaRegiaPresentation = {
      openTelegram: () => openModal('telegram'),
      openAndroid: () => openModal('android'),
      sync: ensureNavigation
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
