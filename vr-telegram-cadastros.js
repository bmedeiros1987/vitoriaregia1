
(function(){
  function addAfter(afterEl, html){ if(!afterEl || afterEl.parentElement?.querySelector('[data-vr-telegram-added="1"]')) return; const wrap=document.createElement('div'); wrap.setAttribute('data-vr-telegram-added','1'); wrap.innerHTML=html; afterEl.insertAdjacentElement('afterend', wrap); }
  function ensure(){
    document.querySelectorAll('form').forEach(form=>{
      if(form.querySelector('[name="telegram"]')) return;
      const whats=form.querySelector('[name="whatsapp"], [name="phone"]');
      if(!whats) return;
      const label=whats.closest('label')||whats;
      addAfter(label, '<label><span>Telegram</span><input name="telegram" placeholder="@usuario ou Chat ID" /></label><p class="vr-telegram-field-note">Opcional. Use quando o usuário já iniciou conversa com o bot do condomínio.</p>');
    });
  }
  document.addEventListener('DOMContentLoaded', ensure); window.addEventListener('load', ensure); new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
})();
