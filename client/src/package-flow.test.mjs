import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmationStateAfterResult,
  isOperationFailure,
  normalizeCreatedPackage,
  prependPackage,
  submitPackageRegistration
} from './package-flow.js';

const validResponse = {
  id:42,
  tracking:'BR123',
  unit:'101',
  recipient:'Maria',
  pickup_code:'654321',
  notification_status:'enviando',
  linked:true,
  resident:{ id:7, name:'Maria', email:'maria@example.com' }
};

test('normaliza a confirmação do servidor e os dados do morador', () => {
  const result = normalizeCreatedPackage(validResponse);
  assert.equal(result.id, 42);
  assert.equal(result.resident_name, 'Maria');
  assert.equal(result.notification_status, 'enviando');
});

test('aceita resposta envelopada e evita duplicar a linha otimista', () => {
  const created = normalizeCreatedPackage({ ok:true, package:validResponse, linked:true });
  const rows = prependPackage([{ id:42, tracking:'antigo' }, { id:8 }], created);
  assert.deepEqual(rows.map(item => item.id), [42, 8]);
  assert.equal(rows[0].tracking, 'BR123');
});

test('cadastro bem-sucedido aparece imediatamente, limpa o formulário e atualiza a lista', async () => {
  const calls = [];
  const result = await submitPackageRegistration({
    payload:{ tracking:'BR123' },
    postPackage:async payload => { calls.push(['post', payload]); return validResponse; },
    onCreated:created => calls.push(['created', created.id]),
    resetForm:() => calls.push(['reset']),
    refresh:async () => calls.push(['refresh']),
    notify:(message, fail) => calls.push(['notify', message, fail])
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(result.id, 42);
  assert.deepEqual(calls.slice(0, 3).map(item => item[0]), ['post', 'created', 'reset']);
  assert.ok(calls.some(item => item[0] === 'notify' && item[2] !== true));
  assert.ok(calls.some(item => item[0] === 'refresh'));
});

test('morador sem vínculo não impede o cadastro', async () => {
  const messages = [];
  const result = await submitPackageRegistration({
    payload:{ tracking:'BR999' },
    postPackage:async () => ({ ...validResponse, id:43, tracking:'BR999', resident:null, linked:false, notification_status:'sem_vinculo' }),
    notify:message => messages.push(message)
  });
  assert.equal(result.id, 43);
  assert.equal(result.linked, false);
  assert.match(messages[0], /sem vínculo/i);
});

for (const [name, error] of [
  ['duplicidade', new Error('Já existe uma encomenda ativa com este código.')],
  ['falha de rede', new Error('O servidor demorou para responder.')]
]) {
  test(`${name} mantém os dados e devolve erro operacional`, async () => {
    let reset = false;
    let created = false;
    const notices = [];
    const result = await submitPackageRegistration({
      payload:{ tracking:'BR123' },
      postPackage:async () => { throw error; },
      onCreated:() => { created = true; },
      resetForm:() => { reset = true; },
      notify:(message, fail) => notices.push({ message, fail })
    });
    assert.equal(isOperationFailure(result), true);
    assert.equal(reset, false);
    assert.equal(created, false);
    assert.deepEqual(notices, [{ message:error.message, fail:true }]);
  });
}

test('falha mantém a confirmação aberta; sucesso fecha', () => {
  const current = { title:'Confirmar encomenda', running:true, fields:{ Código:'BR123' } };
  const failed = confirmationStateAfterResult(current, { ok:false, error:'Código duplicado.' });
  assert.equal(failed.running, false);
  assert.equal(failed.error, 'Código duplicado.');
  assert.equal(confirmationStateAfterResult(current, validResponse), null);
});

test('resposta sem id é tratada como falha e não limpa o formulário', async () => {
  let reset = false;
  const result = await submitPackageRegistration({
    payload:{ tracking:'BR123' },
    postPackage:async () => ({ ok:true }),
    resetForm:() => { reset = true; }
  });
  assert.equal(isOperationFailure(result), true);
  assert.equal(reset, false);
});
