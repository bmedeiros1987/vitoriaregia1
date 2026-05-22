const fs = require('fs');

const required = [
  'index.html',
  'app.js',
  'styles.css',
  'render.yaml',
  'backend/package.json',
  'backend/src/server.js',
  'backend/src/db.js'
];

let ok = true;
for (const file of required) {
  if (fs.existsSync(file)) {
    console.log('OK  ', file);
  } else {
    ok = false;
    console.error('ERRO', file, 'não encontrado');
  }
}

try {
  const pkg = JSON.parse(fs.readFileSync('backend/package.json', 'utf8'));
  if (!pkg.dependencies || !pkg.dependencies.mysql2) {
    ok = false;
    console.error('ERRO dependência mysql2 ausente em backend/package.json');
  } else {
    console.log('OK   mysql2 configurado');
  }
} catch (error) {
  ok = false;
  console.error('ERRO ao ler backend/package.json:', error.message);
}

process.exit(ok ? 0 : 1);
