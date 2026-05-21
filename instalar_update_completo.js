#!/usr/bin/env node
/**
 * Instalador completo Vitória Régia.
 * Execute na raiz do repositório depois de copiar os arquivos do ZIP:
 *   node instalar_update_completo.js
 *
 * O script é idempotente: se as tags/rotas já existirem, não duplica.
 */
const fs = require('fs');
const path = require('path');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content, 'utf8'); }
function exists(file) { return fs.existsSync(file); }
function log(msg) { console.log('✅ ' + msg); }
function warn(msg) { console.warn('⚠️ ' + msg); }

const cwd = process.cwd();
const indexPath = path.join(cwd, 'index.html');
const serverCandidates = [
  path.join(cwd, 'backend', 'src', 'server.js'),
  path.join(cwd, 'backend', 'server.js'),
  path.join(cwd, 'server.js'),
];
const serverPath = serverCandidates.find(exists);

function injectIntoIndex() {
  if (!exists(indexPath)) {
    warn('index.html não encontrado; pulando injeção do frontend.');
    return;
  }
  let html = read(indexPath);
  let changed = false;

  const cssFiles = ['vr-clean-admin.css', 'vr-browser-notifications.css', 'vr-panic.css'];
  const jsFiles = ['vr-clean-admin.js', 'vr-browser-notifications.js', 'vr-panic.js'];

  for (const css of cssFiles) {
    if (!html.includes(css)) {
      const tag = `  <link rel="stylesheet" href="${css}">\n`;
      if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, tag + '</head>');
      else html = tag + html;
      changed = true;
    }
  }

  for (const js of jsFiles) {
    if (!html.includes(js)) {
      const tag = `  <script src="${js}"></script>\n`;
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, tag + '</body>');
      else html += '\n' + tag;
      changed = true;
    }
  }

  if (changed) {
    write(indexPath, html);
    log('Frontend atualizado: layout limpo, notificações e botão de emergência inseridos no index.html.');
  } else {
    log('Frontend já estava atualizado; nada duplicado no index.html.');
  }
}

function injectRequire(code, marker, requireLine) {
  if (code.includes(marker)) return code;
  const lines = code.split(/\r?\n/);
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(const|let|var)\s+.+require\(/.test(lines[i]) || /^\s*import\s+/.test(lines[i])) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, requireLine);
  return lines.join('\n');
}

function injectRoute(code, routeText, useLine) {
  if (code.includes(routeText)) return code;
  const expressJsonIndex = code.search(/app\.use\(\s*express\.json\(/);
  if (expressJsonIndex !== -1) {
    const after = code.indexOf('\n', expressJsonIndex);
    const pos = after === -1 ? code.length : after + 1;
    return code.slice(0, pos) + useLine + '\n' + code.slice(pos);
  }
  const listenIndex = code.search(/app\.listen\(/);
  if (listenIndex !== -1) return code.slice(0, listenIndex) + useLine + '\n\n' + code.slice(listenIndex);
  return code + '\n' + useLine + '\n';
}

function injectBackend() {
  if (!serverPath) {
    warn('backend/src/server.js não encontrado; pulando rotas backend.');
    return;
  }
  let code = read(serverPath);
  const original = code;
  const unix = serverPath.replace(/\\/g, '/');
  const inBackendSrc = unix.includes('/backend/src/');

  // Notificações: backend/src/notifications.routes.js fica no mesmo diretório de server.js.
  if (inBackendSrc) {
    code = injectRequire(code, 'notifications.routes', "const notificationRoutes = require('./notifications.routes');");
  } else {
    code = injectRequire(code, 'notifications.routes', "const notificationRoutes = require('./backend/src/notifications.routes');");
  }
  code = injectRoute(code, "/api/notifications", "app.use('/api/notifications', notificationRoutes);");

  // Pânico/emergência: backend/src/routes/panic.js
  const panicRequirePath = inBackendSrc ? './routes/panic' : './backend/src/routes/panic';
  code = injectRequire(code, 'panicRoutes', `const panicRoutes = require('${panicRequirePath}');`);
  code = injectRoute(code, "/api/panic", "app.use('/api/panic', panicRoutes);");

  if (code !== original) {
    write(serverPath, code);
    log('Backend atualizado com /api/notifications e /api/panic.');
  } else {
    log('Backend já estava atualizado; rotas não duplicadas.');
  }
}

function ensureGitignore() {
  const gitignore = path.join(cwd, '.gitignore');
  const required = [
    'node_modules/',
    'backend/node_modules/',
    '.env',
    '*.env',
    '.env.*',
    '*.pem',
    '*.key',
    '*.crt',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '.gradle/',
    '**/build/',
    'local.properties',
  ];
  let content = exists(gitignore) ? read(gitignore) : '';
  let changed = false;
  for (const line of required) {
    if (!content.split(/\r?\n/).includes(line)) {
      content += (content.endsWith('\n') || !content ? '' : '\n') + line + '\n';
      changed = true;
    }
  }
  if (changed) {
    write(gitignore, content);
    log('.gitignore reforçado para proteger senhas, certificados e node_modules.');
  }
}

injectIntoIndex();
injectBackend();
ensureGitignore();
console.log('\nAtualização completa instalada. Revise o Git status, faça commit e envie para o GitHub.');
