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
  assert.match(index,/email:true, telegram:true/);
  assert.match(index,/event_type:'package_arrival', force_email:true/);
  assert.match(index,/event_type:'reservation_status', force_email:true/);
  assert.match(index,/sendEmailSmart\(\{ to:emailTargets\.join\(','\)/);
  assert.match(index,/actionUrl:fullActionUrl\(action_url\)/);
  assert.match(index,/notifyReservationUpdate\(reserva,status\)/);
  assert.doesNotMatch(index,/notifyReservationUpdate\(reserva,'pre_agendada'\)[\s\S]{0,220}pendente_aceite_regras/);
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
  assert.match(preload,/capture|tracking|resident_name/i);
  assert.match(preload,/jwt\.verify\(token, JWT_SECRET\)/);
  assert.match(pkg.scripts.start,/package-ocr-intelligence-preload\.mjs/);
});
