const fs = require('fs');
const path = require('path');

const indexPath = path.join(process.cwd(), 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('index.html não encontrado na raiz do projeto.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes('vr-ux-plus.css')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="vr-ux-plus.css">\n</head>');
}

if (!html.includes('vr-ux-plus.js')) {
  html = html.replace('</body>', '  <script src="vr-ux-plus.js"></script>\n</body>');
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('UX Plus injetado com sucesso no index.html');
