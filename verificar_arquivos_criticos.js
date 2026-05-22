const fs = require('fs');
const required = [
  'index.html',
  'app.js',
  'styles.css',
  'render.yaml',
  'VERSION.json',
  'backend/package.json',
  'backend/src/server.js',
  'backend/src/db.js',
  'backend/src/schema.js',
  'assets/logo-vitoria-regia.svg',
  'assets/condominio-fachada.png'
];
let ok = true;
for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error('FALTANDO:', file);
    ok = false;
  } else {
    console.log('OK:', file);
  }
}
if (!ok) process.exit(1);
console.log('Arquivos críticos conferidos com sucesso.');
