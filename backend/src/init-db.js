require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const sqlPath = path.resolve(__dirname, '../sql/schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Banco inicializado com sucesso.');
  await pool.end();
}

main().catch(async (error) => {
  console.error('Erro ao inicializar banco:', error);
  await pool.end();
  process.exit(1);
});
