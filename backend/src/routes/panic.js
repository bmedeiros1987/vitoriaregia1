'use strict';

/**
 * Rotas do Botão de Pânico / Emergência.
 *
 * Fluxo:
 * POST   /api/panic                 -> morador cria ocorrência pendente para síndico/portaria
 * GET    /api/panic/pending         -> síndico/portaria consultam pendências
 * POST   /api/panic/:id/confirm     -> síndico/portaria confirmam e liberam aviso aos moradores
 * POST   /api/panic/:id/resolve     -> encerra ocorrência
 * GET    /api/panic/public          -> moradores recebem apenas ocorrências confirmadas
 *
 * Observação: este módulo usa armazenamento JSON local por padrão para não derrubar a emergência
 * se o banco principal estiver indisponível. Em produção, você pode adaptar para gravar também no banco.
 */

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'panic-events.json');

const RESPONDER_ROLES = new Set([
  'admin', 'administrador', 'sindico', 'síndico', 'subsindico', 'subsíndico',
  'portaria', 'porteiro', 'zelador', 'gerente'
]);

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getRequestUser(req) {
  const body = req.body || {};
  const authUser = req.user || req.authUser || req.usuario || {};

  return {
    id: String(authUser.id || body.userId || body.createdBy || body.confirmedBy || body.resolvedBy || ''),
    name: String(authUser.name || authUser.nome || req.get('x-user-name') || body.createdByName || body.confirmedByName || body.resolvedByName || 'Usuário do sistema'),
    role: String(authUser.role || authUser.perfil || req.get('x-user-role') || body.createdByRole || body.confirmedByRole || body.resolvedByRole || 'morador'),
    unit: String(authUser.unit || authUser.unidade || req.get('x-user-unit') || body.unit || ''),
    block: String(authUser.block || authUser.bloco || req.get('x-user-block') || body.block || '')
  };
}

function isResponder(user) {
  const role = normalizeText(user && user.role);
  if (!role) return false;
  if (RESPONDER_ROLES.has(role)) return true;
  for (const r of RESPONDER_ROLES) {
    if (role.includes(r)) return true;
  }
  return false;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (_) {
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

async function readEvents() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function writeEvents(events) {
  await ensureDataFile();
  const tmpFile = DATA_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(events, null, 2), 'utf8');
  await fs.rename(tmpFile, DATA_FILE);
}

function cleanString(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function publicEvent(event) {
  return {
    id: event.id,
    type: event.type,
    label: event.label,
    status: event.status,
    unit: event.unit,
    block: event.block,
    createdAt: event.createdAt,
    confirmedAt: event.confirmedAt,
    broadcastScope: event.broadcastScope,
    broadcastMessage: event.broadcastMessage
  };
}

router.get('/health', async (_req, res) => {
  try {
    await ensureDataFile();
    res.json({ ok: true, module: 'panic', storage: 'json-file' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const user = getRequestUser(req);

    const type = cleanString(body.type || 'outro', 60);
    const label = cleanString(body.label || type, 120);
    const description = cleanString(body.description, 1000);

    const event = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2),
      type,
      label,
      description,
      unit: cleanString(body.unit || user.unit, 120),
      block: cleanString(body.block || user.block, 120),
      source: cleanString(body.source || 'web', 60),
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: cleanString(body.createdBy || user.id || user.name, 160),
      createdByName: cleanString(body.createdByName || user.name, 160),
      createdByRole: cleanString(body.createdByRole || user.role, 80),
      confirmedAt: null,
      confirmedBy: null,
      confirmedByName: null,
      broadcastScope: null,
      broadcastMessage: null,
      resolvedAt: null,
      resolvedBy: null,
      history: [
        {
          at: new Date().toISOString(),
          action: 'created',
          by: cleanString(user.name, 160),
          role: cleanString(user.role, 80)
        }
      ]
    };

    const events = await readEvents();
    events.push(event);
    await writeEvents(events);

    res.status(201).json({
      ok: true,
      message: 'Emergência enviada para síndico e portaria.',
      item: event
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const user = getRequestUser(req);

    // Se o sistema já tiver autenticação, esta checagem protege a consulta.
    // Caso sua autenticação ainda não injete req.user, o frontend envia X-User-Role.
    if (!isResponder(user)) {
      return res.status(403).json({ ok: false, error: 'Acesso restrito à portaria, síndico e administradores.' });
    }

    const events = await readEvents();
    const items = events
      .filter(e => e.status === 'pending' || e.status === 'confirmed')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const user = getRequestUser(req);

    if (!isResponder(user)) {
      return res.status(403).json({ ok: false, error: 'Somente síndico, portaria ou administradores podem confirmar emergências.' });
    }

    const id = req.params.id;
    const body = req.body || {};
    const events = await readEvents();
    const index = events.findIndex(e => e.id === id);

    if (index === -1) {
      return res.status(404).json({ ok: false, error: 'Ocorrência não encontrada.' });
    }

    const event = events[index];
    if (event.status === 'resolved') {
      return res.status(409).json({ ok: false, error: 'Esta ocorrência já foi encerrada.' });
    }

    event.status = 'confirmed';
    event.confirmedAt = new Date().toISOString();
    event.confirmedBy = cleanString(body.confirmedBy || user.id || user.name, 160);
    event.confirmedByName = cleanString(body.confirmedByName || user.name, 160);
    event.confirmedByRole = cleanString(body.confirmedByRole || user.role, 80);
    event.broadcastScope = cleanString(body.scope || body.broadcastScope || 'all', 60);
    event.broadcastMessage = cleanString(body.message || body.broadcastMessage || defaultBroadcastMessage(event), 1000);
    event.history = Array.isArray(event.history) ? event.history : [];
    event.history.push({
      at: new Date().toISOString(),
      action: 'confirmed_and_broadcast',
      by: cleanString(user.name, 160),
      role: cleanString(user.role, 80),
      scope: event.broadcastScope
    });

    events[index] = event;
    await writeEvents(events);

    res.json({
      ok: true,
      message: 'Emergência confirmada e liberada para notificação aos moradores.',
      item: event
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/:id/resolve', async (req, res) => {
  try {
    const user = getRequestUser(req);

    if (!isResponder(user)) {
      return res.status(403).json({ ok: false, error: 'Somente síndico, portaria ou administradores podem encerrar emergências.' });
    }

    const id = req.params.id;
    const events = await readEvents();
    const index = events.findIndex(e => e.id === id);

    if (index === -1) {
      return res.status(404).json({ ok: false, error: 'Ocorrência não encontrada.' });
    }

    const event = events[index];
    event.status = 'resolved';
    event.resolvedAt = new Date().toISOString();
    event.resolvedBy = cleanString(req.body && (req.body.resolvedByName || req.body.resolvedBy) || user.name, 160);
    event.history = Array.isArray(event.history) ? event.history : [];
    event.history.push({
      at: new Date().toISOString(),
      action: 'resolved',
      by: cleanString(user.name, 160),
      role: cleanString(user.role, 80)
    });

    events[index] = event;
    await writeEvents(events);

    res.json({ ok: true, message: 'Ocorrência encerrada.', item: event });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/public', async (req, res) => {
  try {
    const sinceRaw = req.query.since ? new Date(String(req.query.since)).getTime() : 0;
    const since = Number.isFinite(sinceRaw) ? sinceRaw : 0;

    const events = await readEvents();
    const items = events
      .filter(e => e.status === 'confirmed')
      .filter(e => !since || new Date(e.confirmedAt || e.createdAt).getTime() >= since)
      .sort((a, b) => new Date(b.confirmedAt || b.createdAt) - new Date(a.confirmedAt || a.createdAt))
      .slice(0, 30)
      .map(publicEvent);

    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/log', async (req, res) => {
  try {
    const user = getRequestUser(req);
    if (!isResponder(user)) {
      return res.status(403).json({ ok: false, error: 'Acesso restrito à administração.' });
    }

    const events = await readEvents();
    res.json({ ok: true, items: events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

function defaultBroadcastMessage(event) {
  const unit = event.unit ? ` na região da ${event.unit}` : '';
  if (event.type === 'incendio') {
    return `Atenção: há uma ocorrência de possível incêndio${unit}. Mantenha a calma, evite elevadores e aguarde orientação da portaria/síndico.`;
  }
  if (event.type === 'gas') {
    return `Atenção: há suspeita de vazamento de gás${unit}. Evite acionar interruptores, mantenha ventilação e aguarde orientação da portaria/síndico.`;
  }
  if (event.type === 'seguranca') {
    return `Atenção: ocorrência de segurança comunicada à portaria${unit}. Redobre a atenção e aguarde novas orientações.`;
  }
  if (event.type === 'emergencia_medica') {
    return `Atenção: há uma emergência médica em atendimento${unit}. Evite aglomeração e libere a passagem da equipe de apoio.`;
  }
  return `Atenção: ocorrência urgente confirmada pela administração${unit}. Aguarde orientação da portaria/síndico.`;
}

module.exports = router;