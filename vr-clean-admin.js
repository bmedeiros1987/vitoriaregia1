/*
  Vitória Régia — Layout limpo para Cadastros e Consultas
  Versão: 2026-05-21
  Objetivo: separar visualmente Cadastro x Consulta de Moradores e Usuários internos,
  sem alterar regras de banco, autenticação, permissões ou dados já existentes.
*/
(function () {
  'use strict';

  const CONFIG = {
    cssHref: 'vr-clean-admin.css',
    resident: {
      id: 'moradores',
      title: 'Moradores',
      formSelector: '[data-resident-form]',
      listSelector: '[data-residents-list]',
      searchSelector: '[data-resident-search]',
      exportSelector: '[data-export-residents]',
      messageSelector: '[data-resident-message]',
      formTitle: 'Cadastro de morador',
      formDesc: 'Inclua ou atualize moradores aprovados, unidade, vínculo, responsável financeiro e observações.',
      listTitle: 'Consulta de moradores',
      listDesc: 'Pesquise por nome, e-mail, telefone, CPF/CNPJ, apartamento, vínculo ou unidade alugada.',
      searchPlaceholder: 'Buscar morador, unidade, e-mail, telefone ou CPF/CNPJ...'
    },
    staff: {
      id: 'equipe',
      title: 'Usuários',
      formSelector: '[data-staff-form]',
      listSelector: '[data-staff-list]',
      searchSelector: '[data-vr-clean-staff-search]',
      messageSelector: '[data-staff-message]',
      formTitle: 'Cadastro de usuário interno',
      formDesc: 'Cadastre síndico, subsíndico, portaria e usuários administrativos com permissões próprias.',
      listTitle: 'Consulta de usuários',
      listDesc: 'Consulte usuários internos, status, perfil, permissões e disponibilidade para mensagens/escala.',
      searchPlaceholder: 'Buscar usuário, perfil, e-mail, telefone ou situação...'
    }
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function loadCss() {
    if (qs('link[href*="vr-clean-admin.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CONFIG.cssHref;
    document.head.appendChild(link);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function visibleText(el) {
    return normalize(el ? el.textContent : '');
  }

  function findSection(config) {
    return document.getElementById(config.id)
      || qs(`[data-section="${config.id}"]`)
      || qs(`[data-tab-panel="${config.id}"]`)
      || qs(`[data-page="${config.id}"]`)
      || qs(`[data-tab-content="${config.id}"]`)
      || qsa('section, .section, [role="tabpanel"], main > div, main > article')
        .find((el) => {
          const text = visibleText(el).slice(0, 2500);
          if (config.id === 'moradores') return text.includes('moradores e unidades') || text.includes('moradores aprovados');
          if (config.id === 'equipe') return text.includes('usuarios cadastrados') || text.includes('usuarios administradores') || text.includes('novo usuario interno');
          return false;
        });
  }

  function nearestPanel(el) {
    if (!el) return null;
    const panel = el.closest('.vr-clean-panel, .panel, .panel-lite, .card, .content-card, .glass, .box');
    if (panel && !panel.matches('body, main, section')) return panel;
    return el.parentElement && !el.parentElement.matches('body, main') ? el.parentElement : el;
  }

  function makeHeader(title, desc, badge) {
    const header = document.createElement('div');
    header.className = 'vr-clean-panel-header';
    header.innerHTML = `
      <div>
        <span class="vr-clean-kicker">${badge}</span>
        <h3>${title}</h3>
        <p>${desc}</p>
      </div>
    `;
    return header;
  }

  function ensurePanelHeader(panel, config, type) {
    if (!panel || panel.dataset.vrCleanPanelReady === `${config.id}-${type}`) return;
    panel.classList.add('vr-clean-panel', `vr-clean-panel--${type}`);
    panel.dataset.vrCleanPanelReady = `${config.id}-${type}`;
    const title = type === 'form' ? config.formTitle : config.listTitle;
    const desc = type === 'form' ? config.formDesc : config.listDesc;
    const badge = type === 'form' ? 'Cadastro' : 'Consulta';
    if (!qs('.vr-clean-panel-header', panel)) {
      panel.insertBefore(makeHeader(title, desc, badge), panel.firstChild);
    }
  }

  function createSuite(section, config) {
    if (!section || section.dataset.vrCleanReady === config.id) return null;
    section.classList.add('vr-clean-section', `vr-clean-section--${config.id}`);
    section.dataset.vrCleanReady = config.id;

    const top = document.createElement('div');
    top.className = 'vr-clean-section-top';
    top.innerHTML = `
      <div>
        <span class="vr-clean-kicker">Gestão organizada</span>
        <h2>${config.title}</h2>
        <p>Cadastro e consulta agora ficam separados, com foco em leitura rápida e menos poluição visual.</p>
      </div>
      <div class="vr-clean-actions">
        <button type="button" class="vr-clean-chip is-active" data-vr-clean-focus="form">Cadastro</button>
        <button type="button" class="vr-clean-chip" data-vr-clean-focus="list">Consulta</button>
      </div>
    `;

    const anchor = qs('.vr-clean-section-top', section);
    if (!anchor) {
      const firstPanel = qs(config.formSelector, section)?.closest('.panel, .panel-lite, .card') || qs(config.formSelector, section) || section.firstElementChild;
      section.insertBefore(top, firstPanel || section.firstChild);
    }

    section.addEventListener('click', (event) => {
      const button = event.target.closest('[data-vr-clean-focus]');
      if (!button) return;
      const targetType = button.dataset.vrCleanFocus;
      qsa('[data-vr-clean-focus]', section).forEach((item) => item.classList.toggle('is-active', item === button));
      const target = qs(`.vr-clean-panel--${targetType}`, section);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = targetType === 'form' ? qs('input, select, textarea', target) : qs('input[type="search"], input', target);
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 250);
    });

    return top;
  }

  function addToolbar(listPanel, config, section) {
    if (!listPanel || qs(`.vr-clean-toolbar[data-vr-clean-toolbar="${config.id}"]`, listPanel)) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'vr-clean-toolbar';
    toolbar.dataset.vrCleanToolbar = config.id;

    let search = qs(config.searchSelector, section);
    if (!search && config.id === 'equipe') {
      search = document.createElement('input');
      search.type = 'search';
      search.setAttribute('data-vr-clean-staff-search', 'true');
    }
    if (search) {
      search.type = 'search';
      search.placeholder = config.searchPlaceholder;
      search.classList.add('vr-clean-search');
      const searchWrap = document.createElement('label');
      searchWrap.className = 'vr-clean-search-wrap';
      searchWrap.innerHTML = '<span>Busca rápida</span>';
      searchWrap.appendChild(search);
      toolbar.appendChild(searchWrap);
    }

    const exportButton = config.exportSelector ? qs(config.exportSelector, section) : null;
    if (exportButton) {
      exportButton.classList.add('vr-clean-secondary-action');
      toolbar.appendChild(exportButton);
    }

    listPanel.insertBefore(toolbar, qs(config.listSelector, section) || listPanel.firstChild);
  }

  function enhanceForms(panel) {
    if (!panel) return;
    qsa('input, select, textarea', panel).forEach((field) => {
      field.classList.add('vr-clean-field');
      if (!field.getAttribute('autocomplete') && field.name && /email|name|nome|whatsapp|phone|telefone/.test(field.name)) {
        field.setAttribute('autocomplete', field.name.includes('email') ? 'email' : 'off');
      }
    });
    qsa('button:not(.vr-clean-chip)', panel).forEach((button) => button.classList.add('vr-clean-button'));
    qsa('small, .hint, .help, .form-hint, .form-note, .muted', panel).forEach((el) => el.classList.add('vr-clean-muted'));
  }

  function filterList(input, list) {
    if (!input || !list) return;
    const term = normalize(input.value);
    const children = qsa(':scope > *', list);
    children.forEach((child) => {
      const match = !term || visibleText(child).includes(term);
      child.classList.toggle('vr-clean-filter-hidden', !match);
    });
  }

  function setupFilter(config, section) {
    const input = qs(config.searchSelector, section);
    const list = qs(config.listSelector, section);
    if (!input || !list || input.dataset.vrCleanFilterReady) return;
    input.dataset.vrCleanFilterReady = 'true';
    input.addEventListener('input', () => filterList(input, list));
    const observer = new MutationObserver(() => filterList(input, list));
    observer.observe(list, { childList: true, subtree: false });
    filterList(input, list);
  }

  function applyCounters(config, section) {
    const list = qs(config.listSelector, section);
    const top = qs('.vr-clean-section-top', section);
    if (!list || !top) return;
    let counter = qs(`[data-vr-clean-counter="${config.id}"]`, top);
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'vr-clean-counter';
      counter.dataset.vrCleanCounter = config.id;
      qs('.vr-clean-actions', top)?.prepend(counter);
    }
    const items = qsa(':scope > *', list).filter((el) => !el.classList.contains('empty') && visibleText(el));
    const visible = items.filter((el) => !el.classList.contains('vr-clean-filter-hidden'));
    counter.textContent = `${visible.length || items.length || 0} registro(s)`;
  }

  function cleanPermissionGroups(section) {
    // Diminui a sensação de formulário pesado nos checkboxes de permissões, sem remover nenhum campo.
    qsa('fieldset, .checkbox-group, .permissions, [data-permission-group]', section).forEach((group) => {
      group.classList.add('vr-clean-permission-group');
    });
    qsa('label', section).forEach((label) => {
      if (label.querySelector('input[type="checkbox"], input[type="radio"]')) label.classList.add('vr-clean-checkline');
    });
  }

  function enhanceSection(config) {
    const section = findSection(config);
    if (!section) return;
    createSuite(section, config);

    const form = qs(config.formSelector, section);
    const list = qs(config.listSelector, section);
    if (!form || !list) return;

    const formPanel = nearestPanel(form);
    const listPanel = nearestPanel(list);
    ensurePanelHeader(formPanel, config, 'form');
    ensurePanelHeader(listPanel, config, 'list');
    addToolbar(listPanel, config, section);
    enhanceForms(formPanel);
    enhanceForms(listPanel);
    cleanPermissionGroups(section);
    setupFilter(config, section);
    applyCounters(config, section);
  }

  function simplifyLabels() {
    document.body.classList.add('vr-clean-mode');
    qsa('[data-nav], .sidebar, nav').forEach((nav) => nav.classList.add('vr-clean-nav'));
    qsa('.section, section, [role="tabpanel"]').forEach((section) => {
      const text = visibleText(section).slice(0, 1500);
      if (text.includes('moradores') || text.includes('usuarios')) section.classList.add('vr-clean-readable');
    });
  }

  function run() {
    loadCss();
    simplifyLabels();
    enhanceSection(CONFIG.resident);
    enhanceSection(CONFIG.staff);
  }

  function scheduleRun() {
    window.requestAnimationFrame(() => {
      run();
      setTimeout(run, 250);
      setTimeout(run, 800);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleRun);
  } else {
    scheduleRun();
  }

  window.addEventListener('hashchange', scheduleRun);
  window.addEventListener('resize', () => document.body.classList.toggle('vr-clean-mobile', window.innerWidth < 760));

  const globalObserver = new MutationObserver(() => {
    clearTimeout(globalObserver._timer);
    globalObserver._timer = setTimeout(run, 120);
  });
  globalObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
