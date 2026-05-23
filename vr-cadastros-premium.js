
(function () {
  const CONFIG = {
    moradores: { cadastro: 'Cadastrar morador', consulta: 'Consultar moradores', helper: 'Cadastre novos moradores em uma aba e pesquise/gerencie os cadastros já aprovados em outra.' },
    equipe: { cadastro: 'Cadastrar usuário', consulta: 'Consultar usuários', helper: 'Perfis, permissões e usuários internos ficam separados da pesquisa para evitar confusão.' },
    portaria: { cadastro: 'Registrar visitante', consulta: 'Consultar visitantes', helper: 'A portaria registra a entrada em uma aba e consulta históricos em outra.' },
    'visitantes-recorrentes': { cadastro: 'Cadastrar recorrente', consulta: 'Consultar recorrentes', helper: 'Separe prestadores e visitantes autorizados da consulta rápida da portaria.' },
    encomendas: { cadastro: 'Registrar encomenda', consulta: 'Consultar encomendas', helper: 'Registre novas entregas sem misturar com as encomendas pendentes ou já recebidas.' },
    financeiro: { cadastro: 'Novo lançamento', consulta: 'Consultar financeiro', helper: 'Receitas, despesas e cobranças ficam em fluxo simples: lançar primeiro, consultar depois.' },
    servicos: { cadastro: 'Novo serviço', consulta: 'Consultar serviços', helper: 'Cadastre serviços e acompanhe solicitações em áreas separadas.' },
    arquivos: { cadastro: 'Enviar arquivo', consulta: 'Consultar arquivos', helper: 'Envie documentos, fotos e vídeos sem perder a organização da busca.' },
    comunicados: { cadastro: 'Novo comunicado', consulta: 'Consultar comunicados', helper: 'Crie avisos e acompanhe o que está visível para moradores e portaria.' },
    reservas: { cadastro: 'Solicitar reserva', consulta: 'Consultar reservas', helper: 'O pedido de reserva fica separado do calendário e do histórico.' }
  };

  function sectionTitle(section) {
    return section.querySelector('.section-head h2')?.textContent?.trim() || section.id || 'Cadastro';
  }

  function setTab(section, tab) {
    section.dataset.vrCurrentSubtab = tab;
    section.querySelectorAll('.vr-cadastro-tab').forEach((btn) => {
      const active = btn.dataset.vrSubtab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function markPanes(section) {
    const grids = Array.from(section.querySelectorAll(':scope > .content-grid, :scope .content-grid')).filter((grid) => grid.querySelector('form'));
    let changed = false;
    grids.forEach((grid) => {
      const children = Array.from(grid.children).filter((el) => el.nodeType === 1);
      children.forEach((child) => {
        if (child.matches('form')) {
          child.dataset.vrPane = 'cadastro';
          changed = true;
          return;
        }
        if (child.matches('article, .panel')) {
          child.dataset.vrPane = 'consulta';
          changed = true;
        }
      });
    });
    return changed;
  }

  function enhanceSection(section, cfg) {
    if (!section || section.dataset.vrSplitActive === '1') return;
    if (!markPanes(section)) return;
    section.dataset.vrSplitActive = '1';
    section.dataset.vrCurrentSubtab = 'cadastro';

    const head = section.querySelector(':scope > .section-head') || section.firstElementChild;
    const helper = document.createElement('p');
    helper.className = 'vr-cadastro-helper';
    helper.textContent = cfg.helper || `Organização simples para ${sectionTitle(section)}.`;

    const tabs = document.createElement('div');
    tabs.className = 'vr-cadastro-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', `Abas de ${sectionTitle(section)}`);
    tabs.innerHTML = `
      <button class="vr-cadastro-tab is-active" type="button" role="tab" aria-selected="true" data-vr-subtab="cadastro">➕ ${cfg.cadastro || 'Cadastrar'}</button>
      <button class="vr-cadastro-tab" type="button" role="tab" aria-selected="false" data-vr-subtab="consulta">🔎 ${cfg.consulta || 'Consultar'}</button>
    `;
    tabs.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-vr-subtab]');
      if (!btn) return;
      setTab(section, btn.dataset.vrSubtab);
    });

    if (head && head.parentNode === section) {
      head.insertAdjacentElement('afterend', helper);
      helper.insertAdjacentElement('afterend', tabs);
    } else {
      section.insertBefore(tabs, section.firstChild);
      section.insertBefore(helper, tabs);
    }
  }

  function addDbHelp() {
    const btn = document.querySelector('[data-clear-cache]');
    if (!btn || document.querySelector('.vr-admin-db-help')) return;
    const help = document.createElement('div');
    help.className = 'vr-admin-db-help';
    help.innerHTML = '<strong>Para que serve “Recarregar banco”?</strong><br>Ele limpa apenas dados temporários deste navegador e baixa novamente as informações salvas no MySQL. Não apaga moradores, encomendas, financeiro ou cadastros. Use quando o administrador perceber tela desatualizada depois de uma atualização ou troca de dispositivo.';
    const topbar = btn.closest('.topbar-actions') || btn.parentElement;
    topbar?.appendChild(help);
    btn.addEventListener('mouseenter', () => document.body.classList.add('vr-show-admin-db-help'));
    btn.addEventListener('focus', () => document.body.classList.add('vr-show-admin-db-help'));
    btn.addEventListener('mouseleave', () => document.body.classList.remove('vr-show-admin-db-help'));
    btn.addEventListener('blur', () => document.body.classList.remove('vr-show-admin-db-help'));
  }

  function init() {
    Object.entries(CONFIG).forEach(([id, cfg]) => enhanceSection(document.getElementById(id), cfg));
    addDbHelp();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  new MutationObserver(() => init()).observe(document.documentElement, { childList: true, subtree: true });
})();
