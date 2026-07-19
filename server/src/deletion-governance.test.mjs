import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('central de exclusões cobre usuários, moradores, encomendas e reservas',()=>{
  const code=source('deletion-governance-preload.mjs');
  for(const type of ['users','residents','packages','reservations']){
    assert.match(code,new RegExp(`${type}:\\{`));
    assert.match(code,new RegExp(`/api/\\$\\{type\\}/:id|/api/${type}/:id`));
  }
  assert.match(code,/UPDATE users SET active=false,deleted_at=now\(\)/);
  assert.match(code,/UPDATE residents SET active=false,deleted_at=now\(\)/);
  assert.match(code,/UPDATE packages SET deleted_at=now\(\),status='removida'/);
  assert.match(code,/UPDATE reservations SET deleted_at=now\(\),status='cancelada'/);
});

test('somente gestão autorizada exclui e admin respeita autoria do síndico',()=>{
  const code=source('deletion-governance-preload.mjs');
  assert.match(code,/\['master','admin','sindico','subsindico'\]/);
  assert.match(code,/actorRole==='admin'&&clean\(owner\.created_by_role\)\.toLowerCase\(\)==='sindico'&&!isTest/);
  assert.match(code,/cadastros claramente identificados como teste/);
  assert.match(code,/você não pode excluir o próprio acesso/);
  assert.match(code,/acesso técnico principal não pode ser excluído/);
});

test('autoria e exclusões ficam registradas para auditoria',()=>{
  const code=source('deletion-governance-preload.mjs');
  assert.match(code,/CREATE TABLE IF NOT EXISTS vr_entity_ownership/);
  assert.match(code,/CREATE TABLE IF NOT EXISTS vr_deletion_log/);
  assert.match(code,/rememberOwnership/);
  assert.match(code,/INSERT INTO audit/);
  assert.match(code,/snapshot JSONB/);
});

test('central possui listagem própria sem depender da permissão users.manage',()=>{
  const code=source('deletion-governance-preload.mjs');
  assert.match(code,/\/api\/deletion-governance\/list\/\$\{type\}/);
  assert.match(code,/function publicRecord/);
  assert.match(code,/can_delete/);
  assert.match(code,/delete_block_reason/);
});

test('preload é carregado antes do núcleo do servidor',()=>{
  const pkg=JSON.parse(source('../package.json'));
  assert.match(pkg.scripts.start,/deletion-governance-preload\.mjs/);
  assert.ok(pkg.scripts.start.indexOf('deletion-governance-preload.mjs')<pkg.scripts.start.indexOf('src/index.js'));
  assert.match(pkg.scripts.build,/node --check src\/deletion-governance-preload\.mjs/);
});
