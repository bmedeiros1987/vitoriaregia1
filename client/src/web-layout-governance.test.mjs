import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=relative=>readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

test('correção web remove deslocamento duplo da sidebar',()=>{
  const css=read('public/vitoria-one-v14-web-premium.css');
  assert.match(css,/display:grid!important/);
  assert.match(css,/grid-template-columns:var\(--vr-web-sidebar\) minmax\(0,1fr\)!important/);
  assert.match(css,/\.appShell>main\.content\{[\s\S]*margin:0!important/);
  assert.match(css,/\.appShell>aside\{[\s\S]*position:sticky!important/);
});

test('drawer e camadas de foco escondem navegações concorrentes',()=>{
  const css=read('public/vitoria-one-v14-web-premium.css');
  const script=read('public/deletion-governance-v14.js');
  assert.match(css,/\.appShell\.mobile-open \.bottomNav/);
  assert.match(css,/\.appShell\.mobile-open \.subTabs/);
  assert.match(css,/body\.vr-focus-layer \.appShell>aside/);
  assert.match(script,/vr-focus-layer/);
  assert.match(script,/MutationObserver/);
});

test('central premium permite excluir quatro categorias com confirmação',()=>{
  const script=read('public/deletion-governance-v14.js');
  for(const type of ['users','residents','packages','reservations']) assert.match(script,new RegExp(`${type}:\\{label:`));
  assert.match(script,/\/api\/deletion-governance\/list\/\$\{state\.type\}/);
  assert.match(script,/method:'DELETE'/);
  assert.match(script,/window\.confirm/);
  assert.match(script,/Gerenciar exclusões/);
});

test('central aparece somente para gestão autorizada',()=>{
  const script=read('public/deletion-governance-v14.js');
  assert.match(script,/\['master','admin','sindico','subsindico'\]/);
  assert.match(script,/allowedRoles\.has/);
  assert.match(script,/Criado pelo síndico/);
});

test('arquivos são carregados por último para prevalecer sobre o layout antigo',()=>{
  const html=read('index.html');
  const oldCss=html.indexOf('/vitoria-one-v14-layout-audit.css');
  const newCss=html.indexOf('/vitoria-one-v14-web-premium.css');
  const governance=html.indexOf('/deletion-governance-v14.js');
  const react=html.indexOf('/src/main.jsx');
  assert.ok(oldCss>=0&&newCss>oldCss);
  assert.ok(governance>=0&&governance<react);
});
