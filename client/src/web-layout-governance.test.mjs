import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=relative=>readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

test('recuperação web vence a camada Super Premium sem somar recuos',()=>{
  const css=read('public/vitoria-one-v14-layout-recovery.css');
  assert.match(css,/body\.vr-one-active \.appShell\.vr-one-shell>main\.content/);
  assert.match(css,/width:calc\(100vw - var\(--vr-shell-offset\)\)!important/);
  assert.match(css,/margin:0 0 0 var\(--vr-shell-offset\)!important/);
  assert.match(css,/padding:28px var\(--vr-shell-gutter\)/);
  assert.match(css,/grid-template-columns:none!important/);
});

test('documento e conteúdo principal permanecem roláveis fora de modais reais',()=>{
  const css=read('public/vitoria-one-v14-layout-recovery.css');
  assert.match(css,/html\{[\s\S]*overflow-y:auto!important/);
  assert.match(css,/body:not\(\.vr-deletion-open\):not\(\.vr-scanner-open\)[\s\S]*overflow-y:visible!important/);
  assert.match(css,/#root,[\s\S]*height:auto!important/);
  assert.match(css,/main\.content[\s\S]*max-height:none!important/);
  assert.match(css,/body\.vr-deletion-open,[\s\S]*overflow:hidden!important/);
});

test('guardião final remove travas órfãs e só bloqueia com camada visível',()=>{
  const css=read('public/vitoria-one-v14-scroll-guard.css');
  const script=read('public/vitoria-one-v14-scroll-guard.js');
  assert.match(css,/body:not\(\.vr-scroll-lock-active\)/);
  assert.match(css,/overflow-y:scroll!important/);
  assert.match(css,/body\.vr-scroll-lock-active[\s\S]*overflow:hidden!important/);
  assert.match(script,/function realBlockingLayer/);
  assert.match(script,/function unlockDocument/);
  assert.match(script,/staleLockClasses/);
  assert.match(script,/window\.__vrEnsurePageScroll/);
  assert.doesNotMatch(script,/function clearInlineLock/);
});

test('camada de foco presa é removida e não pode ocultar o sistema',()=>{
  const css=read('public/vitoria-one-v14-layout-recovery.css');
  const script=read('public/deletion-governance-v14.js');
  assert.match(css,/body\.vr-focus-layer:not\(\.vr-deletion-open\):not\(\.vr-scanner-open\)/);
  assert.match(css,/opacity:1!important/);
  assert.match(css,/pointer-events:auto!important/);
  assert.match(script,/function clearStaleFocus/);
  assert.match(script,/document\.body\.classList\.remove\('vr-focus-layer','vr-deletion-open'\)/);
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

test('núcleo React inicia antes das integrações e guardião carrega por último',()=>{
  const html=read('index.html');
  const oldCss=html.indexOf('/vitoria-one-v14-layout-audit.css');
  const premiumCss=html.indexOf('/vitoria-one-v14-web-premium.css');
  const recoveryCss=html.indexOf('/vitoria-one-v14-layout-recovery.css');
  const scrollCss=html.indexOf('/vitoria-one-v14-scroll-guard.css');
  const react=html.indexOf('/src/main.jsx');
  const intelligence=html.indexOf('/package-intelligence-v14.js');
  const governance=html.indexOf('/deletion-governance-v14.js');
  const core=html.indexOf('/vitoria-one-v13-core.js');
  const scrollScript=html.indexOf('/vitoria-one-v14-scroll-guard.js');
  assert.ok(oldCss>=0&&premiumCss>oldCss&&recoveryCss>premiumCss&&scrollCss>recoveryCss);
  assert.ok(react>=0&&intelligence>react&&governance>react&&scrollScript>core);
  assert.match(html,/vitoria-one-v14-scroll-guard\.css\?v=20260720a/);
  assert.match(html,/vitoria-one-v14-scroll-guard\.js\?v=20260720a/);
});

test('tela de inicialização nunca permanece vazia e possui recuperação de cache',()=>{
  const html=read('index.html');
  assert.match(html,/id="vr-boot-fallback"/);
  assert.match(html,/Recarregar sistema/);
  assert.match(html,/navigator\.serviceWorker\.getRegistrations/);
  assert.match(html,/caches\.keys/);
  assert.match(html,/unhandledrejection/);
});
