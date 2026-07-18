(() => {
  'use strict';
  const ROOT = 'vr-call-contextual-fields';
  let timer = null;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const field = (name,label,placeholder='',required=false) => `<label>${esc(label)}<input name="${esc(name)}" ${required?'required':''} placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
  const area = (name,label,placeholder='',required=false) => `<label class="full">${esc(label)}<textarea name="${esc(name)}" ${required?'required':''} maxlength="900" placeholder="${esc(placeholder)}"></textarea></label>`;
  function fields(category) {
    if (category === 'emergency') return `<div class="vr-call-context-head full"><span>DETALHES DA EMERGÊNCIA</span><b>A voz citará morador, unidade, tipo, andar e local.</b></div>${field('type_label','Tipo de emergência','Ex.: vazamento de gás ou incêndio',true)}${field('floor','Andar ou pavimento','Ex.: 5º andar ou garagem')}${field('occurrence_location','Local exato','Ex.: corredor próximo ao elevador')}${field('neighbor_unit','Unidade de referência','Ex.: 503')}${area('details','Orientações e detalhes','Descreva o ocorrido, o risco e a providência esperada.',true)}`;
    if (category === 'visitor') return `<div class="vr-call-context-head full"><span>DADOS DO VISITANTE</span><b>A voz citará nome, motivo, documento final e veículo.</b></div>${field('visitor_name','Nome do visitante','Ex.: João da Silva',true)}${field('company','Empresa ou vínculo','Ex.: assistência técnica')}${field('purpose','Motivo da visita','Ex.: manutenção ou visita pessoal')}${field('document','Documento','Somente os quatro últimos números serão falados')}${field('plate','Placa do veículo','Ex.: ABC1D23')}${area('details','Observações da portaria','Ex.: está acompanhado ou trouxe ferramentas.')}`;
    if (category === 'urgent_package' || category === 'package') return `<div class="vr-call-context-head full"><span>DADOS DA ENCOMENDA</span><b>A voz citará remetente, transportadora, rastreamento e recebedor.</b></div>${field('sender','Remetente ou loja','Ex.: Mercado Livre ou Farmácia Central',true)}${field('carrier','Transportadora','Ex.: Correios ou Loggi')}${field('tracking','Código de rastreamento','Somente os últimos números serão falados')}${field('received_by','Recebida por','Nome do porteiro ou responsável')}${field('recipient','Destinatário informado','Quando diferente do morador')}${area('notes','Detalhes da encomenda',category==='urgent_package'?'Explique por que é urgente: medicamento, perecível ou refrigerado.':'Ex.: caixa grande ou retirada mediante identificação.')}`;
    if (category === 'intercom') return `<div class="vr-call-context-head full"><span>CONTATO DA PORTARIA</span><b>A voz citará morador, unidade e motivo.</b></div>${area('reason','Motivo do contato','Ex.: veículo com faróis acesos ou necessidade de liberar acesso.',true)}`;
    return `<div class="vr-call-context-head full"><span>COMUNICADO</span><b>A voz será personalizada com nome e unidade.</b></div>${field('title','Título do aviso','Ex.: interrupção programada de água')}${area('details','Informações completas','Informe data, horário, local, impacto e orientação.',true)}`;
  }
  function compose(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const map = {
      emergency:[['Tipo',values.type_label],['Andar',values.floor],['Local',values.occurrence_location],['Unidade de referência',values.neighbor_unit],['Detalhes',values.details]],
      visitor:[['Visitante',values.visitor_name],['Empresa',values.company],['Motivo',values.purpose],['Documento',values.document],['Placa',values.plate],['Detalhes',values.details]],
      urgent_package:[['Remetente',values.sender],['Transportadora',values.carrier],['Rastreamento',values.tracking],['Recebida por',values.received_by],['Destinatário',values.recipient],['Detalhes',values.notes]],
      package:[['Remetente',values.sender],['Transportadora',values.carrier],['Rastreamento',values.tracking],['Recebida por',values.received_by],['Destinatário',values.recipient],['Detalhes',values.notes]],
      intercom:[['Motivo',values.reason]], notice:[['Título',values.title],['Detalhes',values.details]]
    };
    const details = (map[values.category] || []).filter(([,v])=>String(v||'').trim()).map(([k,v])=>`${k}: ${v}`).join('. ');
    const message = form.querySelector('[name="message"]');
    if (message && details) message.value = details;
  }
  function render(form) {
    const category = form.querySelector('[name="category"]')?.value || 'emergency';
    let root = form.querySelector(`#${ROOT}`);
    if (!root) {
      root = document.createElement('div'); root.id=ROOT; root.className='vr-call-contextual-fields full';
      form.insertBefore(root, form.querySelector('[name="message"]')?.closest('label') || form.querySelector('button[type="submit"]'));
    }
    if (root.dataset.category !== category) { root.dataset.category=category; root.innerHTML=fields(category); }
    const message=form.querySelector('[name="message"]');
    if (message) { message.required=false; message.placeholder='Montado automaticamente com os dados informados e o cadastro do morador.'; }
  }
  function enhance() {
    document.querySelectorAll('form[data-vr-call-manual]').forEach(form => {
      if (!form.dataset.vrDetailedBound) {
        form.dataset.vrDetailedBound='true';
        form.addEventListener('change',event=>{ if(event.target.matches('[name="category"]')) render(form); });
        form.addEventListener('submit',()=>compose(form),true);
        form.addEventListener('reset',()=>setTimeout(()=>render(form),0));
      }
      render(form);
    });
  }
  const observer=new MutationObserver(()=>{ clearTimeout(timer); timer=setTimeout(enhance,40); });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',enhance,{once:true}); else enhance();
})();
