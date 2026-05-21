/**
 * Injeta as rotas do botão de pânico no backend Express.
 * Uso: node injetar_backend_panico.js
 */
const fs = require('fs');
const path = require('path');

const serverCandidates = [
  path.join(process.cwd(), 'backend', 'src', 'server.js'),
  path.join(process.cwd(), 'backend', 'server.js'),
  path.join(process.cwd(), 'server.js')
];

const serverPath = serverCandidates.find(p => fs.existsSync(p));

if (!serverPath) {
  console.error('Não encontrei server.js. Faça a inclusão manual:');
  console.error("const panicRoutes = require('./routes/panic');");
  console.error("app.use('/api/panic', panicRoutes);");
  process.exit(1);
}

let code = fs.readFileSync(serverPath, 'utf8');
const isBackendSrc = serverPath.replace(/\\/g, '/').includes('/backend/src/');
const requirePath = isBackendSrc ? './routes/panic' : './backend/src/routes/panic';

if (!code.includes("panicRoutes") && !code.includes('/api/panic')) {
  // Insere require depois das linhas de require existentes.
  const requireLine = `const panicRoutes = require('${requirePath}');`;
  const lines = code.split(/\r?\n/);
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(const|let|var)\s+.+require\(/.test(lines[i]) || /^\s*import\s+/.test(lines[i])) {
      insertAt = i + 1;
    }
  }
  lines.splice(insertAt, 0, requireLine);
  code = lines.join('\n');
}

if (!code.includes("app.use('/api/panic'") && !code.includes('app.use("/api/panic"')) {
  const useLine = "app.use('/api/panic', panicRoutes);";

  const expressJsonIndex = code.search(/app\.use\(\s*express\.json\(/);
  if (expressJsonIndex !== -1) {
    const after = code.indexOf('\n', expressJsonIndex);
    code = code.slice(0, after + 1) + useLine + '\n' + code.slice(after + 1);
  } else {
    const listenIndex = code.search(/app\.listen\(/);
    if (listenIndex !== -1) {
      code = code.slice(0, listenIndex) + useLine + '\n\n' + code.slice(listenIndex);
    } else {
      code += '\n\n' + useLine + '\n';
    }
  }
}

fs.writeFileSync(serverPath, code, 'utf8');
console.log('Rotas /api/panic adicionadas ao backend com sucesso:', serverPath);