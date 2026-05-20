require('dotenv').config();
const { testConnection } = require('./db');

testConnection()
  .then((info) => {
    console.log('Banco conectado com sucesso:', info);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Falha na conexão com o banco:', error.message);
    process.exit(1);
  });
