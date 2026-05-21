'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_DIR = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(__dirname, '../../');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'emergency-server', message: 'Backend emergencial ativo. Restaurar server.js original pelo atualizador.' }));
try { app.use(express.static(FRONTEND_DIR)); } catch (_) {}
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.listen(PORT, () => console.log(`Vitória Régia emergencial na porta ${PORT}`));
