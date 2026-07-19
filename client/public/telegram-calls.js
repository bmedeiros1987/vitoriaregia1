(() => {
  'use strict';

  const state = { open:false, loading:false, data:null, error:'', toastTimer:null };
  const adminRoles = new Set(['master','admin','sindico','subsindico','portaria']);

  function user() { try { return JSON.parse(localStorage.getItem('vr_user') || 'null'); } catch { return null; } }
  function token() { return localStorage.getItem('vr_token') || ''; }
  function role() { return String(user()?.role || 'morador').toLowerCase(); }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
  function dateTime(value) { if (!value) return '—'; const d=new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR'); }
  function categoryLabel(value) { return ({ emergency:'Emergência',visitor:'Visitante',intercom:'Interfone',urgent_package:'Encomenda urgente',package:'Encomenda',notice:'Comunicado',notification:'Notificação' }[value] || value || 'Notificação'); }
  function statusLabel(value) { return ({ solicitada:'Chamada solicitada',iniciando:'Iniciando',erro:'Falha',pendente:'Pendente' }[value] || value || '—'); }

  async function api(path, options={}) {
    const headers = { ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(token() ? { Authorization:`Bearer ${token()}` } : {}), ...(options.headers || {}) };
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let body={}; try { body=text ? JSON.parse(text) : {}; } catch { body={ raw:text }; }
    if (!response.ok) throw new Error(body.error || body.description || `Erro ${response.status}`);
    return body;
  }

  function toast(message, tone='ok') {
    let node=document.getElementById('vr-call-toast');
    if (!node) { node=document.createElement('div'); node.id='vr-call-toast'; document.body.appendChild(node); }
    node.className=`vr-call-toast ${tone}`;
    node.textContent=message;
    node.hidden=false;
    clearTimeout(state.toastTimer);
    state.toastTimer=setTimeout(()=>{ node.hidden=true; },4800);
  }

  function ensureMenu() {
    // O acionador agora é renderizado nativamente pelo React. Não injetar nós no menu.
    return Boolean(user());
  }

  function ensureRoot() {
    let root=document.getElementById('vr-telegram-call-root');
    if (root) return root;
    root=document.createElement('div');
    root.id='vr-telegram-call-root';
    root.hidden=true;
    root.innerHTML=`<div class="vr-call-shell" role="dialog" aria-modal="true" aria-label="Chamadas pelo Telegram">
      <header class="vr-call-header"><div><span>ALERTAS INTELIGENTES</span><h2>Chamadas pelo Telegram</h2><p>Encomendas, visitantes e emergências com voz e rastreabilidade.</p></div><button type="button" data-vr-call-close aria-label="Fechar">×</button></header>
      <main id="vr-call-content"></main>
    </div>`;
    document.body.appendChild(root);
    root.querySelector('[data-vr-call-close]').addEventListener('click',close);
    root.addEventListener('submit',handleSubmit);
    root.addEventListener('click',handleClick);
    return root;
  }

  async function open() {
    state.open=true;
    const root=ensureRoot();
    root.hidden=false;
    document.body.classList.add('vr-call-open');
    syncPosition();
    await load();
  }
  function close() {
    state.open=false;
    const root=document.getElementById('vr-telegram-call-root');
    if (root) root.hidden=true;
    document.body.classList.remove('vr-call-open');
  }
  function syncPosition() {
    const root=document.getElementById('vr-telegram-call-root');
    const shell=document.querySelector('.appShell');
    if (!root) return;
    root.classList.toggle('menu-closed',Boolean(shell?.classList.contains('menu-closed')));
    root.classList.toggle('menu-floating',Boolean(shell?.classList.contains('menu-floating')));
    root.classList.toggle('menu-horizontal',Boolean(shell?.classList.contains('menu-horizontal')));
  }

  async function load() {
    state.loading=true; state.error=''; render();
    try { state.data=await api('/api/telegram-calls/status'); }
    catch (error) { state.error=error.message; }
    finally { state.loading=false; render(); }
  }

  function render() {
    if (!state.open) return;
    const content=document.getElementById('vr-call-content');
    if (!content) return;
    if (state.loading) { content.innerHTML='<div class="vr-call-loading"><span></span><b>Carregando configuração…</b></div>'; return; }
    if (state.error) {
      content.innerHTML=`<section class="vr-call-card vr-call-error"><h3>Não foi possível abrir a integração</h3><p>${esc(state.error)}</p><button type="button" data-vr-call-retry>Tentar novamente</button></section>`;
      return;
    }
    const data=state.data || {};
    const prefs=data.preferences || {};
    const ready=data.ready;
    const isAdmin=adminRoles.has(role());
    content.innerHTML=`
      <section class="vr-call-hero ${ready?'ready':'pending'}">
        <div><span>${ready?'PRONTO PARA CHAMAR':'CONFIGURAÇÃO PENDENTE'}</span><h3>${ready?'Telegram conectado e identificado':'Conecte e autorize o recebimento de chamadas'}</h3><p>${ready?`As chamadas serão direcionadas para ${esc(data.username)}.`:'O bot do condomínio envia as mensagens e o CallMeBot inicia a chamada de voz.'}</p></div>
        <div class="vr-call-score"><b>${ready?'✓':'!'}</b><small>${data.audio_mode==='edge_mp3'?'Voz neural MP3':'Voz padrão CallMeBot'}</small></div>
      </section>

      <div class="vr-call-grid two">
        <section class="vr-call-card"><header><div><span>Vínculo</span><h3>Seu Telegram</h3></div><em class="${data.linked?'ok':'warn'}">${data.linked?'Conectado':'Não conectado'}</em></header>
          <dl class="vr-call-details"><div><dt>Usuário</dt><dd>${esc(data.username || 'Defina um @username no Telegram')}</dd></div><div><dt>Mensagens do bot</dt><dd>${data.linked?'Ativas':'Aguardando vínculo'}</dd></div><div><dt>Provedor de chamada</dt><dd>CallMeBot</dd></div></dl>
          <div class="vr-call-actions"><a href="${esc(data.authorization_url || 'https://t.me/CallMeBot_txtbot')}" target="_blank" rel="noopener">Abrir CallMeBot</a><button type="button" data-vr-call-test ${!data.username?'disabled':''}>Testar chamada</button></div>
          <ol class="vr-call-steps"><li>Abra o CallMeBot no Telegram.</li><li>Envie <code>/start</code> e autorize chamadas.</li><li>Confirme que seu perfil possui um <strong>@username</strong>.</li><li>Volte e toque em <strong>Testar chamada</strong>.</li></ol>
        </section>

        <section class="vr-call-card"><header><div><span>Preferências</span><h3>Quando o telefone deve tocar</h3></div></header>
          <form data-vr-call-preferences>
            ${toggle('enabled','Ativar chamadas pelo Telegram','Permite que alertas selecionados iniciem uma chamada.',prefs.enabled)}
            ${toggle('emergency','Emergências','Chamada imediata, inclusive no horário silencioso.',prefs.emergency)}
            ${toggle('visitor','Visitante aguardando','Chama após o aviso da portaria.',prefs.visitor)}
            ${toggle('intercom','Portaria tentando contato','Usado quando o interfone não for atendido.',prefs.intercom)}
            ${toggle('urgent_package','Encomenda urgente','Medicamentos, perecíveis ou item marcado como urgente.',prefs.urgent_package)}
            ${toggle('package','Todas as encomendas','Pode gerar muitas chamadas; vem desativado.',prefs.package)}
            ${toggle('notice','Comunicados importantes','Assembleias e avisos administrativos.',prefs.notice)}
            ${toggle('quiet_hours_enabled','Horário silencioso','Suspende chamadas não emergenciais.',prefs.quiet_hours_enabled)}
            <div class="vr-call-time-row"><label>Início<input type="time" name="quiet_start" value="${esc(prefs.quiet_start || '22:00')}"></label><label>Fim<input type="time" name="quiet_end" value="${esc(prefs.quiet_end || '07:00')}"></label></div>
            ${toggle('emergency_overrides_quiet','Emergência ignora silêncio','Mantém alertas críticos durante a madrugada.',prefs.emergency_overrides_quiet)}
            <button class="vr-call-primary" type="submit">Salvar preferências</button>
          </form>
        </section>
      </div>

      <section class="vr-call-card vr-call-warning"><b>Importante para iPhone e iPad</b><p>O CallMeBot informa uma limitação atual do Telegram no iOS: a chamada pode tocar, mas o áudio pode não ser reproduzido ao atender. Para emergências críticas, mantenha também notificação no aplicativo e um contato telefônico alternativo.</p></section>

      ${isAdmin?manualCall():''}
      ${history(data.history || [])}
    `;
  }

  function toggle(name,title,description,checked) {
    return `<label class="vr-call-toggle"><span><b>${esc(title)}</b><small>${esc(description)}</small></span><input type="checkbox" name="${esc(name)}" ${checked?'checked':''}><i></i></label>`;
  }
  function manualCall() {
    return `<section class="vr-call-card"><header><div><span>Portaria e administração</span><h3>Chamada manual</h3></div></header>
      <form class="vr-call-manual" data-vr-call-manual><label>Unidade<input name="unit" required placeholder="Ex.: 501"></label><label>Motivo<select name="category"><option value="emergency">Emergência</option><option value="visitor">Visitante aguardando</option><option value="intercom">Interfone sem resposta</option><option value="urgent_package">Encomenda urgente</option><option value="package">Encomenda</option><option value="notice">Comunicado</option></select></label><label class="full">Mensagem<textarea name="message" required maxlength="800" placeholder="Descreva o aviso que será falado."></textarea></label><button class="vr-call-primary full" type="submit">Iniciar chamada</button></form>
    </section>`;
  }
  function history(items) {
    return `<section class="vr-call-card"><header><div><span>Rastreabilidade</span><h3>Chamadas recentes</h3></div><button type="button" data-vr-call-refresh>Atualizar</button></header>${items.length?`<div class="vr-call-history">${items.map(item=>`<article><i class="${item.status==='solicitada'?'ok':item.status==='erro'?'danger':'warn'}">${item.status==='solicitada'?'✓':item.status==='erro'?'!':'…'}</i><div><b>${esc(categoryLabel(item.category))}</b><small>${esc(item.reason || 'Chamada automática')} · ${dateTime(item.created_at)}</small></div><em>${esc(statusLabel(item.status))}</em></article>`).join('')}</div>`:'<div class="vr-call-empty"><b>Nenhuma chamada registrada</b><span>Os testes e alertas aparecerão aqui.</span></div>'}</section>`;
  }

  async function handleSubmit(event) {
    const preferences=event.target.closest('[data-vr-call-preferences]');
    if (preferences) {
      event.preventDefault();
      const form=new FormData(preferences);
      const names=['enabled','emergency','visitor','intercom','urgent_package','package','notice','quiet_hours_enabled','emergency_overrides_quiet'];
      const payload=Object.fromEntries(names.map(name=>[name,form.has(name)]));
      payload.quiet_start=form.get('quiet_start'); payload.quiet_end=form.get('quiet_end');
      try { await api('/api/telegram-calls/preferences',{ method:'PUT', body:JSON.stringify(payload) }); toast('Preferências salvas.'); await load(); }
      catch(error) { toast(error.message,'error'); }
      return;
    }
    const manual=event.target.closest('[data-vr-call-manual]');
    if (manual) {
      event.preventDefault();
      const data=Object.fromEntries(new FormData(manual).entries());
      const button=manual.querySelector('button[type="submit"]'); button.disabled=true; button.textContent='Solicitando…';
      try { const result=await api('/api/telegram-calls/trigger',{ method:'POST', body:JSON.stringify(data) }); toast(result.description || 'Chamada solicitada.'); manual.reset(); await load(); }
      catch(error) { toast(error.message,'error'); }
      finally { button.disabled=false; button.textContent='Iniciar chamada'; }
    }
  }

  async function handleClick(event) {
    if (event.target.closest('[data-vr-call-close]')) { close(); return; }
    if (event.target.closest('[data-vr-call-retry]') || event.target.closest('[data-vr-call-refresh]')) { await load(); return; }
    const test=event.target.closest('[data-vr-call-test]');
    if (test) {
      test.disabled=true; test.textContent='Chamando…';
      try { const result=await api('/api/telegram-calls/test',{ method:'POST', body:'{}' }); toast(result.description || 'Chamada de teste solicitada.'); await load(); }
      catch(error) { toast(error.message,'error'); }
      finally { test.disabled=false; test.textContent='Testar chamada'; }
    }
  }

  function sync() { ensureMenu(); syncPosition(); }
  let timer=null;
  function scheduleSync() { clearTimeout(timer); timer=setTimeout(sync,40); }
  window.addEventListener('resize',syncPosition);
  window.addEventListener('storage',scheduleSync);
  window.addEventListener('hashchange',scheduleSync);

  function boot() { ensureRoot(); sync(); window.VitoriaRegiaTelegramCalls={ open,close,reload:load }; }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{ once:true }); else boot();
})();
