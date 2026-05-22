const fs = require('fs');
const path = require('path');

const required = [
  'index.html',
  'app.js',
  'styles.css',
  'render.yaml',
  'backend/package.json',
  'backend/src/server.js',
  'assets/building-bg.svg'
];

let ok = true;
for (const file of required) {
  const full = path.join(process.cwd(), file);
  if (fs.existsSync(full)) console.log(`OK   ${file}`);
  else { console.error(`FALTA ${file}`); ok = false; }
}

if (!ok) process.exit(1);
console.log('Todos os arquivos críticos estão presentes.');
