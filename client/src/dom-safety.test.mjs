import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('HTML não carrega extensões que substituem elementos controlados pelo React', () => {
  const html=read('index.html');
  for(const unsafe of ['telegram-calls-menu-hotfix.js','vitoria-one-v13-nav.js','visitor-qr-v13.js','sindico-one-v14.js']){
    assert.doesNotMatch(html,new RegExp(`<script[^>]+${unsafe.replaceAll('.','\\.')}`));
  }
  assert.match(html,/telegram-calls\.js\?v=20260719a/);
  assert.match(html,/vitoria-one-v13-core\.js\?v=20260719a/);
});

test('núcleo visual não remove, insere ou reescreve filhos do React', () => {
  const core=read('public/vitoria-one-v13-core.js');
  assert.doesNotMatch(core,/mobileViewportHint[^\n]*\.remove\s*\(/);
  assert.doesNotMatch(core,/\.innerHTML\s*=/);
  assert.doesNotMatch(core,/\.insertBefore\s*\(/);
  assert.match(core,/!node\.closest\('#root'\)/);
});

test('integração de chamadas usa o acionador nativo e não injeta menu paralelo', () => {
  const calls=read('public/telegram-calls.js');
  assert.doesNotMatch(calls,/querySelector\('\.appShell aside nav'\)/);
  assert.doesNotMatch(calls,/host\.insertBefore|host\.appendChild/);
  assert.match(calls,/window\.VitoriaRegiaTelegramCalls=\{ open,close,reload:load \}/);
});

test('aplicação possui cabeçalho, perfil e recuperação de erro nativos', () => {
  const main=read('src/main.jsx');
  assert.match(main,/class AppErrorBoundary extends React\.Component/);
  assert.match(main,/className="vr-one-profile-card"/);
  assert.match(main,/className=\{online\?'vr-one-trust'/);
  assert.match(main,/<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
});
