#!/usr/bin/env node
// Injetor do dashboard compacto Vitória Régia.
// Execute na raiz do projeto: node injetar_dashboard_compacto.js
const fs = require('fs');
const path = require('path');

const indexPath = path.join(process.cwd(), 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('index.html não encontrado. Execute na raiz do repositório.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
let changed = false;

function injectBefore(pattern, tag) {
  if (html.includes(tag)) return;
  if (pattern.test(html)) html = html.replace(pattern, `  ${tag}\n$&`);
  else html += `\n${tag}\n`;
  changed = true;
}

injectBefore(/<\/head>/i, '<link rel="stylesheet" href="vr-dashboard-actions.css">');
injectBefore(/<\/body>/i, '<script src="vr-dashboard-actions.js"></script>');

if (changed) {
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Dashboard compacto injetado com sucesso.');
} else {
  console.log('Nada alterado: dashboard compacto já estava injetado.');
}
