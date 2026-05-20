require('dotenv').config();
const { createPool } = require('./db');

function quoteIdentifier(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

async function main() {
  const target = process.env.PGDATABASE || 'vitoriaregia1';
  const maintenanceDb = process.env.PGMAINTENANCE_DATABASE || 'defaultdb';
  if (!target) throw new Error('PGDATABASE não informado.');

  const pool = createPool({ database: maintenanceDb });
  try {
    const exists = await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [target]);
    if (exists.rowCount) {
      console.log(`Banco ${target} já existe.`);
      return;
    }
    await pool.query(`CREATE DATABASE ${quoteIdentifier(target)}`);
    console.log(`Banco ${target} criado com sucesso.`);
  } finally {
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error('Erro ao criar banco:', error.message);
  process.exit(1);
});
