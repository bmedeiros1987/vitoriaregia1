
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const TELEGRAM_APPS_URL = 'https://telegram.org/apps?setln=pt-br';

  function insertAfter(ref, node){ if(ref && ref.parentNode) ref.parentNode.insertBefore(node, ref.nextSibling); }
  function ensureTelegramFields(){
    const form = $('[data-notification-settings-form]');
    if(!form || $('[data-vr-channel="telegram"]', form)) return;
    const whatsappCard = $$('.integration-card', form).find(card => /WhatsApp automático/i.test(card.textContent || ''));
    if(whatsappCard) whatsappCard.setAttribute('data-vr-channel','whatsapp');
    const emailCard = $$('.integration-card', form).find(card => /E-mail automático/i.test(card.textContent || ''));
    if(emailCard) emailCard.setAttribute('data-vr-channel','email');
    const asaasCard = $$('.integration-card', form).find(card => /Asaas/i.test(card.textContent || ''));
    if(asaasCard) asaasCard.setAttribute('data-vr-channel','asaas');
    const storageCard = $$('.integration-card', form).find(card => /Armazenamento externo/i.test(card.textContent || ''));
    if(storageCard) storageCard.setAttribute('data-vr-channel','storage');
    const card = document.createElement('div');
    card.className = 'integration-card';
    card.setAttribute('data-vr-channel','telegram');
    card.innerHTML = `
      <h3>Telegram automático</h3>
      <p class="form-hint">Use um bot do Telegram para enviar avisos de encomendas, visitantes, emergências e comunicados. O usuário precisa iniciar conversa com o bot antes de receber mensagens.</p>
      <label class="checkline"><input type="checkbox" name="telegramEnabled" /> <span>Ativar envio automático por Telegram.</span></label>
      <div class="integration-subcard">
        <h4>Bot do condomínio</h4>
        <div class="form-row">
          <label><span>Usuário do bot</span><input name="telegramBotUsername" placeholder="ex.: vitoriaregia_bot" /></label>
          <label><span>Modo de texto</span><select name="telegramParseMode"><option value="HTML">HTML</option><option value="">Texto simples</option></select></label>
        </div>
        <label><span>Token do bot</span><input name="telegramBotToken" type="password" autocomplete="new-password" placeholder="Deixe em branco para manter o token salvo" /></label>
        <div class="form-row">
          <label><span>Chat ID padrão</span><input name="telegramDefaultChatId" placeholder="ex.: -1001234567890 ou 123456789" /></label>
          <label><span>Chat ID de teste</span><input name="telegramTestChatId" placeholder="opcional" /></label>
        </div>
        <p class="form-hint">Para encontrar o Chat ID: o usuário abre o bot, toca em Iniciar e o síndico cadastra o ID no perfil ou usa um grupo padrão do condomínio.</p>
      </div>
      <button class="btn btn--outline" type="button" data-test-telegram>Enviar Telegram de teste</button>
    `;
    if(whatsappCard) form.insertBefore(card, whatsappCard); else form.insertBefore(card, form.firstChild);
  }

  function ensureRules(){
    const form = $('[data-notification-rules-form]');
    if(!form || form.notifyTelegram) return;
    const ref = form.querySelector('[name="notifyWhatsapp"]')?.closest('label');
    const label = document.createElement('label');
    label.className = 'checkline';
    label.innerHTML = '<input type="checkbox" name="notifyTelegram" /> <span>Enviar Telegram automático quando houver chat cadastrado ou chat padrão configurado.</span>';
    insertAfter(ref, label);
  }

  function ensureSettingsHub(){
    const section = $('#configuracoes');
    if(!section || $('.vr-settings-hub', section)) return;
    const head = $('.section-head', section);
    const hub = document.createElement('div');
    hub.className = 'vr-settings-hub';
    hub.innerHTML = `
      <section class="vr-settings-hub__hero">
        <div>
          <span class="eyebrow">Central organizada</span>
          <h3>Configurações do sistema</h3>
          <p>Tudo fica agrupado por assunto: regras, canais de envio, diagnóstico, apps e armazenamento. Use os botões abaixo para ir direto ao que precisa.</p>
          <div class="vr-settings-tabs">
            <button type="button" class="vr-settings-tab" data-go-settings="regras">Regras</button>
            <button type="button" class="vr-settings-tab" data-go-settings="email">E-mail</button>
            <button type="button" class="vr-settings-tab" data-go-settings="telegram">Telegram</button>
            <button type="button" class="vr-settings-tab" data-go-settings="whatsapp">WhatsApp</button>
            <button type="button" class="vr-settings-tab" data-go-settings="apps">Apps</button>
            <button type="button" class="vr-settings-tab" data-go-settings="diagnostico">Diagnóstico</button>
          </div>
        </div>
      </section>
      <section class="vr-settings-diagnostics" id="vr-settings-diagnostico">
        <h3>Diagnóstico rápido de envio</h3>
        <p>Teste os canais sem procurar no final da página.</p>
        <div class="vr-settings-diagnostics__grid">
          <div class="vr-diagnostic-tile"><strong>E-mail</strong><span>Confirma SMTP ou provedor de e-mail.</span><button type="button" class="btn btn--outline" data-test-email>Testar e-mail</button></div>
          <div class="vr-diagnostic-tile"><strong>Telegram</strong><span>Confirma bot, token e chat de teste.</span><button type="button" class="btn btn--outline" data-test-telegram>Testar Telegram</button></div>
          <div class="vr-diagnostic-tile"><strong>WhatsApp</strong><span>Confirma provedor e número de teste.</span><button type="button" class="btn btn--outline" data-test-whatsapp>Testar WhatsApp</button></div>
        </div>
        <div class="vr-channel-guide">
          <div><strong>Interno</strong><small>Notificação dentro do app para leitura rápida.</small></div>
          <div><strong>Telegram</strong><small>Boa opção para respostas rápidas e botões.</small></div>
          <div><strong>E-mail/WhatsApp</strong><small>Usados como reforço para mensagens importantes.</small></div>
        </div>
      </section>
    `;
    if(head) insertAfter(head, hub); else section.insertBefore(hub, section.firstChild);
  }

  function ensureTelegramDownloadCards(){
    const html = `
      <article class="vr-telegram-download-card" data-telegram-download>
        <img class="vr-telegram-qr" src="assets/telegram-apps-qr.png" alt="QR Code para baixar o Telegram" />
        <div>
          <span class="eyebrow">Telegram</span>
          <h3>Baixar Telegram para receber avisos</h3>
          <p>Use o QR Code ou o botão abaixo para instalar o Telegram no celular. Depois abra o bot do condomínio e toque em Iniciar para liberar as mensagens.</p>
          <div class="vr-telegram-actions"><a class="btn btn--primary" href="${TELEGRAM_APPS_URL}" target="_blank" rel="noopener">Abrir página oficial do Telegram</a></div>
        </div>
      </article>`;
    const apps = $('#aplicativos .section-head') || $('#aplicativos');
    if(apps && !$('#aplicativos [data-telegram-download]')) insertAfter(apps, document.createRange().createContextualFragment(html).firstElementChild);
    const helpApps = $('#help-apps .panel-header') || $('#help-apps');
    if(helpApps && !$('#help-apps [data-telegram-download]')) insertAfter(helpApps, document.createRange().createContextualFragment(html).firstElementChild);
  }

  function tagAnchors(){
    const rules = $('[data-notification-rules-form]'); if(rules) rules.id = 'vr-settings-regras', rules.classList.add('vr-settings-section-anchor');
    const form = $('[data-notification-settings-form]');
    if(form){
      $$('.integration-card', form).forEach(card => {
        if(/E-mail automático/i.test(card.textContent||'')) card.id='vr-settings-email';
        if(/Telegram automático/i.test(card.textContent||'')) card.id='vr-settings-telegram';
        if(/WhatsApp automático/i.test(card.textContent||'')) card.id='vr-settings-whatsapp';
      });
    }
    const apps = $('#aplicativos') || $('#help-apps'); if(apps) apps.id = apps.id || 'vr-settings-apps';
  }

  function injectTelegramButtons(){
    const types = [
      ['data-auto-visitor-whatsapp','data-auto-visitor-telegram','Telegram'],
      ['data-auto-package-whatsapp','data-auto-package-telegram','Telegram'],
      ['data-auto-resident-whatsapp','data-auto-resident-telegram','Telegram']
    ];
    types.forEach(([base, attr, label]) => {
      $$(`[${base}]`).forEach(btn => {
        if(btn.parentElement?.querySelector(`[${attr}="${btn.getAttribute(base)}"]`)) return;
        const clone = btn.cloneNode(true);
        clone.removeAttribute(base);
        clone.setAttribute(attr, btn.getAttribute(base));
        clone.textContent = label;
        clone.classList.add('btn--telegram');
        insertAfter(btn, clone);
      });
    });
  }

  function goSettings(which){
    const map = { regras:'#vr-settings-regras', email:'#vr-settings-email', telegram:'#vr-settings-telegram', whatsapp:'#vr-settings-whatsapp', apps:'#aplicativos, #help-apps', diagnostico:'#vr-settings-diagnostico' };
    const selector = map[which];
    const target = selector?.includes(',') ? selector.split(',').map(s => $(s.trim())).find(Boolean) : $(selector);
    if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
  }

  function init(){
    ensureRules();
    ensureTelegramFields();
    ensureSettingsHub();
    ensureTelegramDownloadCards();
    tagAnchors();
    injectTelegramButtons();
  }
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-go-settings]');
    if(tab){ event.preventDefault(); goSettings(tab.dataset.goSettings); }
  });
  const observer = new MutationObserver(() => { injectTelegramButtons(); ensureTelegramDownloadCards(); });
  if(document.body) observer.observe(document.body, { childList:true, subtree:true });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
