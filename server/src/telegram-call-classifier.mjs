function normalize(text = '') {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isEmergency(value) {
  return /emerg[eê]ncia|socorro|p[aâ]nico|inc[eê]ndio|vazamento|alarme|risco imediato|alerta urgente|prioridade cr[ií]tica/.test(value);
}

function isPackage(value) {
  return /encomenda|pacote|correios|mercado livre|amazon|entrega/.test(value);
}

function isUrgent(value) {
  return /urgente|medicamento|perec[ií]vel|refrigerad|prioridade/.test(value);
}

function suppressAutomaticCall(raw = '', body = {}) {
  const value = normalize(raw);
  if (body?.telegram_call_suppress === true || body?.disable_call === true || body?.disable_notification === true) return true;
  if (/vr-silent/i.test(String(raw || ''))) return true;
  return /resposta do morador sobre encomenda|prefer[eê]ncia (?:de entrega )?(?:informada|registrada)|resposta registrada|confirma[cç][aã]o registrada|esta a[cç][aã]o j[aá] foi processada|qr code de acesso est[aá] pronto|confirme sua presen[cç]a no evento|c[oó]digo de confirma[cç][aã]o do convite|lembrete.*encomenda aguardando/.test(value);
}

export function classifyTelegramCallMessage(text = '') {
  if (suppressAutomaticCall(text)) return 'notification';
  const value = normalize(text);
  if (isEmergency(value)) return 'emergency';
  // Encomenda vem antes de visitante: uma mensagem pode mencionar a portaria ou
  // uma pessoa aguardando e ainda assim ser, inequivocamente, sobre um pacote.
  if (isPackage(value) && isUrgent(value)) return 'urgent_package';
  if (isPackage(value)) return 'package';
  if (/interfone|chamada da portaria|contato da portaria/.test(value)) return 'intercom';
  if (/visitante|convidad[oa]|aguardando.*portaria|portaria.*aguardando/.test(value)) return 'visitor';
  if (/comunicado|aviso|assembleia|manuten[cç][aã]o/.test(value)) return 'notice';
  return 'notification';
}

export function classifyTelegramCallPayload(body = {}) {
  const text = String(body?.text || '');
  if (suppressAutomaticCall(text, body)) return 'notification';
  const messageCategory = classifyTelegramCallMessage(text);
  if (messageCategory === 'emergency') return messageCategory;

  // O teclado pkg:<id>:<ação> é metadado inequívoco gerado pelo fluxo de
  // encomendas. Ele evita que palavras incidentais façam a ligação dizer
  // “visitante aguardando na portaria”.
  const replyMarkup = JSON.stringify(body?.reply_markup || {});
  if (/pkg:\d+:/i.test(replyMarkup)) {
    return isUrgent(normalize(text)) ? 'urgent_package' : 'package';
  }
  if (/(?:visitor|visitante|invite|convite):\d+:/i.test(replyMarkup)) return 'visitor';
  return messageCategory;
}
