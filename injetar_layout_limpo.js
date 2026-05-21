// injetar_layout_limpo.js
// Executar na raiz do projeto: node injetar_layout_limpo.js
// Ele adiciona o CSS/JS do layout limpo no index.html, sem apagar o sistema atual.

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'index.html');
if (!fs.existsSync(file)) {
  console.error('index.html não encontrado. Execute este script na raiz do repositório.');
  process.exit(1);
}

let html = fs.readFileSync(file, 'utf8');
let changed = false;

if (!html.includes('vr-clean-admin.css')) {
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="vr-clean-admin.css">\n</head>');
  } else {
    html = '<link rel="stylesheet" href="vr-clean-admin.css">\n' + html;
  }
  changed = true;
}

if (!html.includes('vr-clean-admin.js')) {
  const appScript = /<script[^>]+src=["']app\.js["'][^>]*><\/script>/i;
  if (appScript.test(html)) {
    html = html.replace(appScript, (match) => `${match}\n  <script src="vr-clean-admin.js"></script>`);
  } else if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, '  <script src="vr-clean-admin.js"></script>\n</body>');
  } else {
    html += '\n<script src="vr-clean-admin.js"></script>\n';
  }
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, html, 'utf8');
  console.log('Layout limpo injetado no index.html com sucesso.');
} else {
  console.log('Nada alterado: o index.html já possui o layout limpo.');
}
