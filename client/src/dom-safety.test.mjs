import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('HTML não carrega extensões que substituem elementos controlados pelo React', () => {
  const html=read('index.html');
  for(const unsafe of ['telegram-calls-menu-hotfix.js','vitoria-one-v13-nav.js','visitor-qr-v13.js','sindico-one-v14.js']){
    assert.doesNotMatch(html,new RegExp(`<script[^>]+${unsafe.replaceAll('.','\\.')}`));
  }
  assert.match(html,/telegram-calls\.js\?v=20260719h/);
  assert.match(html,/vitoria-one-v13-core\.js\?v=20260719h/);
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

test('encomendas reúne leitor, cadastro e histórico em uma única tela', () => {
  const main=read('src/main.jsx');
  assert.doesNotMatch(main,/\['leitor','Leitor Premium'\]/);
  assert.doesNotMatch(main,/function PackageScannerPremium/);
  assert.match(main,/Encomendas \+ leitura inteligente/);
  assert.match(main,/Cadastrar e acompanhar em um só lugar/);
  assert.match(main,/className="packageHistorySection"/);
  assert.match(main,/active === 'portaria' && sub === 'leitor' \? 'encomendas'/);
});

test('visitantes recorrentes usam QR Code nativo sem reativar o script legado', () => {
  const main=read('src/main.jsx');
  const html=read('index.html');
  assert.match(main,/function VisitorQrPassModal/);
  assert.match(main,/\/api\/visitor-invites/);
  assert.match(main,/\/api\/visitor-invites\/verify/);
  assert.match(main,/confirm_entry:confirmEntry/);
  assert.match(main,/function VisitorQrVerifyModal/);
  assert.match(main,/Selecione ao menos um dia da semana para o visitante recorrente/);
  assert.match(main,/Gerar QR Code seguro/);
  assert.doesNotMatch(html,/<script[^>]+visitor-qr-v13\.js/);
});

test('leitor inteligente é carregado sem bloquear a tela de login e mantém contingência', () => {
  const html=read('index.html');
  const intelligence=read('public/package-intelligence-v14.js');
  const scriptPosition=html.indexOf('/package-intelligence-v14.js');
  const reactPosition=html.indexOf('/src/main.jsx');
  assert.ok(scriptPosition > reactPosition);
  assert.match(html,/<script defer src="\/package-intelligence-v14\.js/);
  assert.match(intelligence,/\/api\/ocr-intelligence\/parse-package/);
  assert.match(intelligence,/\/api\/ocr-intelligence\/learn-package/);
  assert.match(intelligence,/return nativeFetch\(input, init\)/);
  assert.match(intelligence,/captureButton\.click\(\)/);
  assert.match(intelligence,/document\.body\.classList\.add\('vr-scanner-open'\)/);
});

test('auditoria visual fixa menu e remove navegação durante a leitura', () => {
  const css=read('public/vitoria-one-v14-layout-audit.css');
  assert.match(css,/\.appShell > aside \{[\s\S]*position: fixed !important/);
  assert.match(css,/body\.vr-scanner-open \.bottomNav/);
  assert.match(css,/body\.vr-scanner-open footer/);
  assert.match(css,/\.cameraReaderBox \{[\s\S]*height: 100dvh !important/);
  assert.match(css,/\.toast,[\s\S]*font-size: \.84rem !important/);
});

test('RSVP público sem login continua disponível sem bloquear a montagem do login', () => {
  const html=read('index.html');
  const publicRsvp=read('public/reservation-rsvp-public-v14.js');
  const reactPosition=html.indexOf('/src/main.jsx');
  assert.ok(html.indexOf('/reservation-rsvp-public-v14.js') > reactPosition);
  assert.ok(html.indexOf('/reservation-rsvp-manager-v14.js') > reactPosition);
  assert.match(html,/<script defer src="\/reservation-rsvp-public-v14\.js/);
  assert.match(publicRsvp,/\/api\/public\/rsvp/);
  assert.match(publicRsvp,/verification_channel/);
  assert.match(publicRsvp,/readonly/);
  assert.match(publicRsvp,/data-rsvp-companion/);
  assert.match(publicRsvp,/Não exige login/);
});

test('gestor de convidados oferece importação, aprovação, revogação e lembretes de encomenda', () => {
  const manager=read('public/reservation-rsvp-manager-v14.js');
  const css=read('public/reservation-rsvp-v14.css');
  assert.match(manager,/\/rsvp\/import/);
  assert.match(manager,/accept="\.csv,\.txt,\.xlsx,\.xls,\.pdf"/);
  assert.match(manager,/data-guest-action="approve"/);
  assert.match(manager,/data-guest-action="revoke"/);
  assert.match(manager,/data-regenerate-campaign/);
  assert.match(manager,/\/api\/package-reminders/);
  assert.match(manager,/\/reminder-now/);
  assert.match(css,/#vr-rsvp-manager/);
  assert.match(css,/#vr-package-reminders/);
});
