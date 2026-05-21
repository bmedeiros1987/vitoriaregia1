const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(process.cwd(), 'backend', 'src', 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('Arquivo backend/src/server.js não encontrado. Execute este script na raiz do repositório.');
  process.exit(1);
}

let code = fs.readFileSync(serverPath, 'utf8');
let changed = false;

if (!code.includes("notifications.routes")) {
  const requireLine = "const notificationRoutes = require('./notifications.routes');\n";
  const lastRequire = [...code.matchAll(/^const\s+.+?=\s+require\(.+?\);\s*$/gm)].pop();
  if (lastRequire) {
    const pos = lastRequire.index + lastRequire[0].length;
    code = code.slice(0, pos) + '\n' + requireLine + code.slice(pos);
  } else {
    code = requireLine + code;
  }
  changed = true;
}

if (!code.includes("/api/notifications")) {
  const routeLine = "\napp.use('/api/notifications', notificationRoutes);\n";
  const expressJson = code.match(/app\.use\(express\.json\([^)]*\)\);?/);
  if (expressJson && expressJson.index !== undefined) {
    const pos = expressJson.index + expressJson[0].length;
    code = code.slice(0, pos) + routeLine + code.slice(pos);
  } else {
    const appCreate = code.match(/const\s+app\s*=\s*express\(\);?/);
    if (appCreate && appCreate.index !== undefined) {
      const pos = appCreate.index + appCreate[0].length;
      code = code.slice(0, pos) + routeLine + code.slice(pos);
    } else {
      console.error('Não consegui localizar app.use(express.json()) nem const app = express(). Faça a inclusão manual descrita no README.');
      process.exit(1);
    }
  }
  changed = true;
}

if (changed) {
  fs.writeFileSync(serverPath, code);
  console.log('Rota /api/notifications adicionada ao backend/src/server.js com sucesso.');
} else {
  console.log('A rota de notificações já parece estar instalada. Nada foi alterado.');
}
