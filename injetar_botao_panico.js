/**
 * Injeta o botão de pânico/emergência no index.html.
 * Uso: node injetar_botao_panico.js
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(process.cwd(), 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('index.html não encontrado na raiz do projeto.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const cssTag = '<link rel="stylesheet" href="vr-panic.css">';
const jsTag = '<script src="vr-panic.js"></script>';

if (!html.includes('vr-panic.css')) {
  html = html.replace(/<\/head>/i, `  ${cssTag}\n</head>`);
}

if (!html.includes('vr-panic.js')) {
  html = html.replace(/<\/body>/i, `  ${jsTag}\n</body>`);
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Botão de pânico injetado no index.html com sucesso.');