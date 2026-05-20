require('dotenv').config();
const { initDatabase } = require('./schema');
const { getPool, testConnection } = require('./db');

async function main() {
  const info = await testConnection();
  console.log('Conexão OK:', info);
  await initDatabase();
  console.log('Banco inicializado com sucesso.');
}

main()
  .catch((error) => {
    console.error('Erro ao inicializar banco:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool()?.end().catch(() => {});
  });
