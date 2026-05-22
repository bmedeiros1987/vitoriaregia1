const fs = require('fs');
const required = [
  'index.html',
  'app.js',
  'styles.css',
  'render.yaml',
  'backend/package.json',
  'backend/src/server.js',
  'backend/src/db.js',
  'backend/src/notifications.routes.js',
  'backend/src/routes/panic.js',
  'assets/building-bg.svg'
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
console.log('\nTodos os arquivos críticos estão presentes.');
