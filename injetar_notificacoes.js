const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(process.cwd(), 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('Arquivo index.html não encontrado na pasta atual. Execute este script na raiz do repositório.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
let changed = false;

if (!html.includes('vr-browser-notifications.css')) {
  html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="vr-browser-notifications.css">\n</head>');
  changed = true;
}

if (!html.includes('vr-browser-notifications.js')) {
  html = html.replace(/<\/body>/i, '  <script src="vr-browser-notifications.js"></script>\n</body>');
  changed = true;
}

if (changed) {
  fs.writeFileSync(indexPath, html);
  console.log('Notificações injetadas no index.html com sucesso.');
} else {
  console.log('O index.html já possui os arquivos de notificações. Nada foi alterado.');
}
