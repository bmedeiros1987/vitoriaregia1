const fs = require('fs');
const path = require('path');

const indexPath = path.join(process.cwd(), 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('index.html não encontrado na raiz do projeto.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('vr-update-center.css')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="vr-update-center.css">\n</head>');
}
if (!html.includes('vr-update-center.js')) {
  html = html.replace('</body>', '  <script src="vr-update-center.js"></script>\n</body>');
}
fs.writeFileSync(indexPath, html, 'utf8');
console.log('Central de Atualizações injetada com sucesso.');
