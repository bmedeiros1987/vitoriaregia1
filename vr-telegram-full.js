(function(){
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const ANDROID='https://play.google.com/store/apps/details?id=org.telegram.messenger';
  const IOS='https://apps.apple.com/app/telegram-messenger/id686449807';
  const APPS='https://telegram.org/apps?setln=pt-br';
  function makePanel(context='geral'){
    const adminNote=context==='settings'?'<div class="vr-telegram-warning"><b>Para o síndico/administrador:</b> configure o bot em Configurações > Telegram, salve o token e teste antes de avisar os usuários. O envio automático para uma pessoa precisa do Chat ID dela ou de um grupo/canal configurado.</div>':'';
    return `<section class="vr-telegram-setup-panel" data-telegram-full-guide="${context}">
      <div>
        <span class="eyebrow">Telegram</span>
        <h3>Baixar e configurar o Telegram no celular</h3>
        <p>Use o Telegram para receber avisos de encomendas, visitantes, comunicados e emergências. A pessoa precisa baixar o app e iniciar conversa com o bot do condomínio.</p>
      </div>
      <div class="vr-telegram-setup-grid">
        <article class="vr-telegram-store-card"><img src="assets/telegram-android-qr.png" alt="QR Code para baixar Telegram no Android"><div><strong>Android</strong><span>Aponte a câmera para o QR Code ou toque no botão.</span><a class="btn btn--outline btn--sm" href="${ANDROID}" target="_blank" rel="noopener">Baixar Android</a></div></article>
        <article class="vr-telegram-store-card"><img src="assets/telegram-ios-qr.png" alt="QR Code para baixar Telegram no iPhone"><div><strong>iPhone / iOS</strong><span>Aponte a câmera para o QR Code ou toque no botão.</span><a class="btn btn--outline btn--sm" href="${IOS}" target="_blank" rel="noopener">Baixar iPhone</a></div></article>
        <article class="vr-telegram-step-card"><strong>1. Instale o app</strong><span>Baixe o Telegram pelo QR Code do seu celular.</span></article>
        <article class="vr-telegram-step-card"><strong>2. Abra o bot</strong><span>Pesquise o bot do condomínio no Telegram e toque em Iniciar.</span></article>
        <article class="vr-telegram-step-card"><strong>3. Cadastre no sistema</strong><span>Informe seu Chat ID ou usuário do Telegram no cadastro para receber avisos.</span></article>
      </div>
      <div class="vr-telegram-chip-row"><span class="vr-telegram-chip">Encomendas</span><span class="vr-telegram-chip">Visitantes</span><span class="vr-telegram-chip">Comunicados</span><span class="vr-telegram-chip">Emergências</span><span class="vr-telegram-chip">Avisos internos</span></div>
      ${adminNote}
    </section>`;
  }
  function insertAfter(ref,node){if(ref&&ref.parentNode)ref.parentNode.insertBefore(node,ref.nextSibling)}
  function ensureTelegramGuides(){
    const apps=$('#aplicativos')||$('#help-apps');
    if(apps&&!$('[data-telegram-full-guide="apps"]',apps)){
      const ref=apps.querySelector('.section-head,.panel-header')||apps.firstElementChild||apps;
      insertAfter(ref,document.createRange().createContextualFragment(makePanel('apps')).firstElementChild);
    }
    const help=$('#ajuda,#help,#help-apps');
    if(help&&!$('[data-telegram-full-guide="help"]',help)){
      const ref=help.querySelector('.section-head,.panel-header')||help.firstElementChild||help;
      insertAfter(ref,document.createRange().createContextualFragment(makePanel('help')).firstElementChild);
    }
    const settings=$('#configuracoes');
    if(settings&&!$('[data-telegram-full-guide="settings"]',settings)){
      const target=$('#vr-settings-telegram')||$$('.integration-card',settings).find(c=>/Telegram/i.test(c.textContent||''))||settings.querySelector('.vr-settings-hub')||settings.querySelector('.section-head')||settings;
      insertAfter(target,document.createRange().createContextualFragment(makePanel('settings')).firstElementChild);
    }
  }
  function ensureEmergencyTelegramText(){
    $$('#emergencias,#emergencia,[data-emergency-panel]').forEach(section=>{
      if(section.querySelector('.vr-emergency-telegram-note'))return;
      const note=document.createElement('div');
      note.className='vr-emergency-telegram-note';
      note.innerHTML='<b>Telegram integrado:</b> em emergências, o sistema avisa por Telegram os síndicos/administradores e porteiros do turno que tenham Chat ID cadastrado. Após confirmação, os moradores também podem ser avisados por Telegram.';
      section.insertBefore(note,section.querySelector('.panel,.card,form')||section.firstChild);
    });
  }
  function ensureTelegramButtons(){
    const pairs=[['data-auto-package-email','data-auto-package-telegram','Auto Telegram'],['data-auto-visitor-email','data-auto-visitor-telegram','Auto Telegram'],['data-auto-resident-email','data-auto-resident-telegram','Auto Telegram']];
    pairs.forEach(([base,attr,label])=>{
      $$(`[${base}]`).forEach(btn=>{
        const id=btn.getAttribute(base); if(!id||btn.parentElement?.querySelector(`[${attr}="${CSS.escape(id)}"]`))return;
        const b=document.createElement('button'); b.type='button'; b.className='btn btn--success btn--sm btn--telegram'; b.setAttribute(attr,id); b.textContent=label; insertAfter(btn,b);
      });
    });
  }
  function ensureManualTelegramLinks(){
    $$('a[href*="Manual_"],a[href*="Funcionalidades"]').forEach(a=>{a.setAttribute('target','_blank');a.setAttribute('rel','noopener')});
  }
  function init(){ensureTelegramGuides();ensureEmergencyTelegramText();ensureTelegramButtons();ensureManualTelegramLinks();}
  document.addEventListener('DOMContentLoaded',init); window.addEventListener('load',init);
  const obs=new MutationObserver(()=>{ensureTelegramGuides();ensureEmergencyTelegramText();ensureTelegramButtons();});
  if(document.documentElement)obs.observe(document.documentElement,{childList:true,subtree:true});
})();
