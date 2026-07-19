import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=relative=>readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

test('recuperação web usa somente uma reserva de largura para a sidebar',()=>{
  const css=read('public/vitoria-one-v14-layout-recovery.css');
  assert.match(css,/display:block!important/);
  assert.match(css,/grid-template-columns:none!important/);
  assert.match(css,/position:fixed!important/);
  assert.match(css,/margin:0 0 0 var\(--vr-recovery-sidebar\)!important/);
  assert.match(css,/width:calc\(100% - var\(--vr-recovery-sidebar\)\)!important/);
  assert.doesNotMatch(css,/grid-template-columns:var\(--vr-recovery-sidebar\)/);
});

test('camada de foco presa é removida e não pode ocultar o sistema',()=>{
  const css=read('public/vitoria-one-v14-layout-recovery.css');
  const script=read('public/deletion-governance-v14.js');
  assert.match(css,/body\.vr-focus-layer:not\(\.vr-deletion-open\):not\(\.vr-scanner-open\)/);
  assert.match(css,/opacity:1!important/);
  assert.match(css,/pointer-events:auto!important/);
  assert.match(script,/function clearStaleFocus/);
  assert.match(script,/document\.body\.classList\.remove\('vr-focus-layer','vr-deletion-open'\)/);
  assert.doesNotMatch(script,/querySelector\('\.cameraReaderOverlay,#vr-telegram-call-root/);
});

test('drawer mobile esconde somente navegação concorrente enquanto aberto',()=>{
  const css=read('public/vitoria-one-v14-web-premium.css');
  assert.match(css,/\.appShell\.mobile-open \.bottomNav/);
  assert.match(css,/\.appShell\.mobile-open \.subTabs/);
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
  assert.match(script,/criados pelo síndico/i);
});

test('núcleo React inicia antes das integrações e CSS de recuperação carrega por último',()=>{
  const html=read('index.html');
  const oldCss=html.indexOf('/vitoria-one-v14-layout-audit.css');
  const premiumCss=html.indexOf('/vitoria-one-v14-web-premium.css');
  const recoveryCss=html.indexOf('/vitoria-one-v14-layout-recovery.css');
  const react=html.indexOf('/src/main.jsx');
  const intelligence=html.indexOf('/package-intelligence-v14.js');
  const governance=html.indexOf('/deletion-governance-v14.js');
  assert.ok(oldCss>=0&&premiumCss>oldCss&&recoveryCss>premiumCss);
  assert.ok(react>=0&&intelligence>react&&governance>react);
  assert.match(html,/<script defer src="\/deletion-governance-v14\.js/);
});

test('tela de inicialização nunca permanece vazia e possui recuperação de cache',()=>{
  const html=read('index.html');
  assert.match(html,/id="vr-boot-fallback"/);
  assert.match(html,/Recarregar sistema/);
  assert.match(html,/navigator\.serviceWorker\.getRegistrations/);
  assert.match(html,/caches\.keys/);
  assert.match(html,/unhandledrejection/);
});
