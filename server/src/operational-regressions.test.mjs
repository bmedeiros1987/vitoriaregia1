import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyTelegramCallMessage, classifyTelegramCallPayload } from './telegram-call-classifier.mjs';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('teclado de decisão de encomenda nunca gera chamada de visitante', () => {
  assert.equal(classifyTelegramCallPayload({
    text:'Há uma entrega aguardando a confirmação do visitante na portaria.',
    reply_markup:{ inline_keyboard:[[{ text:'Retirar agora', callback_data:'pkg:42:retirar_agora' }]] }
  }), 'package');
  assert.equal(classifyTelegramCallMessage('Sua encomenda chegou na portaria.'), 'package');
  assert.equal(classifyTelegramCallMessage('Visitante João aguardando na portaria.'), 'visitor');
});

test('resposta e lembrete de encomenda no Telegram não iniciam nova ligação', () => {
  assert.equal(classifyTelegramCallMessage('Resposta do morador sobre encomenda: retirada mais tarde.'), 'notification');
  assert.equal(classifyTelegramCallMessage('Lembrete: encomenda aguardando retirada na portaria.'), 'notification');
  assert.equal(classifyTelegramCallPayload({ text:'Sua encomenda continua aguardando.', disable_notification:true }), 'notification');
  assert.equal(classifyTelegramCallMessage('Sua encomenda chegou na portaria.'), 'package');
});

test('migração obrigatória cobre todas as colunas gravadas pelo leitor de encomendas', () => {
  const index = source('index.js');
  for (const column of ['carrier','barcode','barcode_format','order_number','invoice_number','validation_status','ocr_confidence','source_type']) {
    assert.match(index, new RegExp(`\\['packages','${column} `));
    assert.match(index, new RegExp(`\\['${column}',["']${column} `));
  }
  assert.match(index, /await ensurePackageReaderColumns\(\)/);
  assert.match(index, /telegram_call_category:'package'/);
});

test('convite QR recorrente exige dias definidos e preserva janela de acesso', () => {
  const preload = source('visitor-qr-preload.mjs');
  assert.match(preload, /recurring && !dates\.length && !weekdays\.length/);
  assert.match(preload, /access_start_time/);
  assert.match(preload, /access_end_time/);
  assert.match(preload, /\/api\/visitor-invites\/verify/);
  assert.match(preload, /parseVisitorJson\(req,res/);
  assert.match(preload, /req\.body!==undefined/);
});

test('encomendas e reservas sempre tentam e-mail para a conta vinculada', () => {
  const index=source('index.js');
  assert.match(index,/async function residentEmailTargets/);
  assert.match(index,/SELECT email FROM users WHERE resident_id=\$1/);
  assert.match(index,/event_type:'package_arrival', force_email:true/);
  assert.match(index,/event_type:'reservation_status', force_email:true/);
  assert.match(index,/sendEmailSmart\(\{ to:emailTargets\.join\(','\)/);
  assert.match(index,/notifyReservationUpdate\(reserva,status\)/);
});

test('sessão das integrações usa o mesmo segredo do núcleo antes de instalar as rotas', () => {
  const runtime=source('runtime-secret-alignment-preload.mjs');
  const pkg=JSON.parse(source('../package.json'));
  assert.match(runtime,/vitoria-regia-jwt-v14/);
  assert.match(runtime,/process\.env\.JWT_SECRET = createHash/);
  assert.ok(pkg.scripts.start.indexOf('runtime-secret-alignment-preload.mjs') < pkg.scripts.start.indexOf('telegram-callmebot-ssl-hotfix.mjs'));
});

test('OCR inteligente reconhece etiquetas, aprende correções e mantém autenticação', () => {
  const preload=source('package-ocr-intelligence-preload.mjs');
  const pkg=JSON.parse(source('../package.json'));
  assert.match(preload,/CREATE TABLE IF NOT EXISTS package_ocr_learning/);
  assert.match(preload,/J&T Express/);
  assert.match(preload,/\/parse-package/);
  assert.match(preload,/\/learn-package/);
  assert.match(preload,/jwt\.verify\(token, JWT_SECRET\)/);
  assert.match(pkg.scripts.start,/package-ocr-intelligence-preload\.mjs/);
});

test('reserva de morador renova a permissão e continua na rota canônica', () => {
  const preload=source('reservation-rsvp-preload.mjs');
  const pkg=JSON.parse(source('../package.json'));
  assert.match(preload,/router\.post\('\/reservations',authenticate,handleResidentReservation\)/);
  assert.match(preload,/String\(user\.role \|\| ''\)\.toLowerCase\(\)!=='morador'/);
  assert.match(preload,/'reservations\.manage':true/);
  assert.match(preload,/jwt\.sign\(upgraded,JWT_SECRET/);
  assert.match(preload,/req\.headers\.authorization=/);
  assert.match(preload,/return next\(\)/);
  assert.doesNotMatch(preload,/router\.use\(authenticate\)/);
  assert.ok(pkg.scripts.start.indexOf('reservation-rsvp-preload.mjs') < pkg.scripts.start.indexOf('src/index.js'));
});

test('RSVP usa links assinados, OTP temporário, aprovação e revogação', () => {
  const lib=source('reservation-rsvp-lib.mjs');
  const service=source('reservation-rsvp-service.mjs');
  const preload=source('reservation-rsvp-preload.mjs');
  assert.match(lib,/createHmac/);
  assert.match(lib,/timingSafeEqual/);
  assert.match(lib,/mode TEXT DEFAULT 'invite_only'/);
  assert.match(service,/15\*60\*1000/);
  assert.match(preload,/verification_attempts \|\| 0\)>=5/);
  assert.match(preload,/status='confirmado'/);
  assert.match(preload,/status='revogado'/);
  assert.match(preload,/regenerate_link/);
  assert.match(preload,/max_companions/);
});

test('importação de convidados cobre Excel, PDF, CSV e Google Forms exportado', () => {
  const service=source('reservation-rsvp-service.mjs');
  const pkg=JSON.parse(source('../package.json'));
  assert.equal(pkg.dependencies.xlsx, '^0.18.5');
  assert.equal(pkg.dependencies['pdf-parse'], '^1.1.1');
  assert.match(service,/XLSX\.read/);
  assert.match(service,/pdfParse\(file\.buffer\)/);
  assert.match(service,/parseDelimited/);
  assert.match(service,/whats\|telefone\|celular/);
  assert.match(service,/acompanh\|agregad/);
});

test('lembretes de encomenda mantêm e-mail obrigatório e respeitam a resposta do morador', () => {
  const reminders=source('package-reminders-preload.mjs');
  const lib=source('reservation-rsvp-lib.mjs');
  assert.match(reminders,/const channels=\{app:true,email:true,telegram:true,whatsapp:true/);
  assert.match(reminders,/results\.email=await sendEmail/);
  assert.match(reminders,/response_email_notified_at/);
  assert.match(reminders,/retirar_agora/);
  assert.match(reminders,/nextMinutes=60/);
  assert.match(reminders,/setInterval\(\(\)=>void processDue\(\),60\*1000\)/);
  assert.doesNotMatch(reminders,/router\.use\(authenticate\)/);
  assert.match(lib,/disable_notification:true/);
});
