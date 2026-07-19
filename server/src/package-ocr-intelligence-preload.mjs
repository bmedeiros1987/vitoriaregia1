import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const JWT_SECRET = process.env.JWT_SECRET || createHash('sha256').update(`${DATABASE_URL}|vitoria-regia-jwt-v14`).digest('hex');
const MAX_TEXT = 18000;
let routesInstalled = false;
let schemaPromise = null;

function externalDb() {
  try {
    const host = new URL(DATABASE_URL).hostname;
    return !['localhost', '127.0.0.1', '::1'].includes(host);
  } catch {
    return /render|neon|supabase|railway|aiven|amazonaws|azure/i.test(DATABASE_URL);
  }
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: externalDb() ? { rejectUnauthorized: false } : false,
  max: Math.max(1, Math.min(5, Number(process.env.VR_OCR_POOL_MAX || 2))),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 12000,
});

async function q(sql, params = []) { return pool.query(sql, params); }

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9@._/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

function onlyDigits(value = '') { return String(value || '').replace(/\D/g, ''); }
function normalizeUnit(value = '') { return normalize(value).replace(/\s+/g, '').replace(/^0+/, '').slice(0, 12); }
function normalizeName(value = '') {
  return normalize(value)
    .replace(/\b(SR|SRA|SENHOR|SENHORA|DESTINATARIO|DESTINATARIA)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokens(value = '') {
  const stop = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'COM', 'LTDA', 'SA', 'S', 'A']);
  return normalize(value).split(' ').filter(token => token.length >= 2 && !stop.has(token));
}

function templateKey(text = '', carrier = '') {
  const normalized = normalize(text)
    .replace(/\b\d{1,}\b/g, '#')
    .replace(/#+/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 3500);
  const structural = [
    'DESTINATARIO', 'REMETENTE', 'PEDIDO', 'NFE', 'NOTA FISCAL', 'VOLUME',
    'TRACKING', 'RASTREIO', 'CEP', 'ENDERECO', 'UNIDADE', 'APARTAMENTO'
  ].filter(word => normalized.includes(word)).join('|');
  return createHash('sha256').update(`${normalize(carrier)}|${structural}|${normalized}`).digest('hex');
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await q(`CREATE TABLE IF NOT EXISTS package_ocr_learning(
      id BIGSERIAL PRIMARY KEY,
      template_key TEXT NOT NULL,
      resident_name TEXT DEFAULT '',
      unit TEXT DEFAULT '',
      carrier TEXT DEFAULT '',
      tracking_pattern TEXT DEFAULT '',
      sample_text TEXT DEFAULT '',
      hits INTEGER DEFAULT 1,
      confidence NUMERIC DEFAULT 0.72,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE(template_key, resident_name, unit, carrier)
    )`);
    await q('CREATE INDEX IF NOT EXISTS package_ocr_learning_template_idx ON package_ocr_learning(template_key, hits DESC)');
    await q('CREATE INDEX IF NOT EXISTS package_ocr_learning_unit_idx ON package_ocr_learning(unit, updated_at DESC)');
  })().catch(error => {
    schemaPromise = null;
    console.warn('[ocr-intelligence] Falha ao preparar aprendizagem:', error.message);
    throw error;
  });
  return schemaPromise;
}

function authenticate(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Sessão necessária.' });
  try { req.vrToken = jwt.verify(token, JWT_SECRET); return next(); }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
}

function canManagePackages(req, res, next) {
  const role = String(req.vrToken?.role || '').toLowerCase();
  const permissions = req.vrToken?.permissions || {};
  if (['master', 'admin', 'sindico', 'subsindico', 'portaria'].includes(role) || permissions['packages.manage'] === true) return next();
  return res.status(403).json({ error: 'Seu perfil não pode operar o leitor de encomendas.' });
}

function codeCandidates(codes = [], text = '') {
  const found = [];
  for (const item of Array.isArray(codes) ? codes : []) {
    const rawValue = String(typeof item === 'string' ? item : item?.rawValue || '').trim();
    if (rawValue) found.push({ value: rawValue.replace(/\s+/g, ''), format: item?.format || 'codigo', source: 'scanner' });
  }
  const normalizedText = cleanText(text);
  for (const match of normalizedText.matchAll(/\b[A-Z]{0,4}\s?\d[\d .-]{7,28}[A-Z]{0,3}\b/gi)) {
    const value = match[0].replace(/\s+/g, '').replace(/[^A-Z0-9-]/gi, '');
    if (value.length >= 8) found.push({ value, format: 'ocr', source: 'ocr' });
  }
  const unique = new Map();
  for (const candidate of found) {
    const key = candidate.value.toUpperCase();
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function scoreTracking(candidate = '') {
  const raw = String(candidate || '').replace(/\s+/g, '');
  const digits = onlyDigits(raw);
  let score = 0;
  if (digits.length >= 12 && digits.length <= 24) score += 35;
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(raw)) score += 45;
  if (/^\d{13,18}$/.test(raw)) score += 38;
  if (/\d{5}-\d{5}-\d{4}/.test(raw)) score += 25;
  if (digits.length === 8) score -= 25;
  if (/^(19|20)\d{6,12}$/.test(digits)) score -= 8;
  return score;
}

function extractTracking(text, codes) {
  const candidates = codeCandidates(codes, text).sort((a, b) => scoreTracking(b.value) - scoreTracking(a.value));
  const top = candidates[0] || null;
  return { tracking: top?.value || '', barcode: top?.value || '', barcode_format: top?.format || '', candidates };
}

const CARRIERS = [
  [/\bJ\s*&\s*T\b|\bJNT\b|J&T\s*EXPRESS/i, 'J&T Express'],
  [/\bCORREIOS\b|SEDEX|PAC\b/i, 'Correios'],
  [/MERCADO\s*LIVRE|MELI\b/i, 'Mercado Livre'],
  [/\bSHOPEE\b|SPX\b/i, 'Shopee Xpress'],
  [/\bAMAZON\b|AMZL\b/i, 'Amazon Logistics'],
  [/TOTAL\s*EXPRESS/i, 'Total Express'],
  [/\bLOGGI\b/i, 'Loggi'],
  [/\bJADLOG\b/i, 'Jadlog'],
  [/AZUL\s*CARGO/i, 'Azul Cargo'],
  [/LATAM\s*CARGO/i, 'LATAM Cargo'],
  [/CAINIAO|ALIEXPRESS/i, 'Cainiao / AliExpress'],
  [/\bSHEIN\b/i, 'Shein'],
  [/BRASPRESS/i, 'Braspress'],
  [/FEDEX/i, 'FedEx'],
  [/DHL/i, 'DHL'],
  [/UPS\b/i, 'UPS'],
];

function extractCarrier(text = '') {
  for (const [pattern, label] of CARRIERS) if (pattern.test(text)) return label;
  const lines = cleanText(text).split('\n').map(line => line.trim()).filter(Boolean);
  const first = lines.slice(0, 4).find(line => /EXPRESS|LOGISTICA|TRANSPORTES|CARGO|ENTREGAS/i.test(line));
  return first ? first.replace(/[^\p{L}\p{N}& .-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

function extractOrder(text = '') {
  const normalized = cleanText(text);
  const order = normalized.match(/\b(?:PEDIDO|ORDER|PED)\s*(?:N[º°O.]*)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{5,32})/i)?.[1] || '';
  const invoice = normalized.match(/\b(?:NFE|NF-E|NOTA\s*FISCAL)\s*(?:N[º°O.]*)?\s*[:#-]?\s*([0-9][0-9./-]{4,24})/i)?.[1] || '';
  return { order_number: order, invoice_number: invoice };
}

function extractUnit(text = '', residents = []) {
  const normalized = normalize(text);
  const patterns = [
    /\b(?:SN|UNIDADE|APTO|APT|APARTAMENTO|AP)\s*[:#-]?\s*([0-9]{1,5}[A-Z]?)\b/g,
    /\b(?:BLOCO\s*[A-Z0-9]+\s*[-/]?\s*)?(?:UN|UND)\s*[:#-]?\s*([0-9]{1,5}[A-Z]?)\b/g,
    /\bEDIFICIO\s+VITORIA\s+REGIA[^\n]{0,80}?\b([0-9]{2,5}[A-Z]?)\b/g,
  ];
  const candidates = [];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = normalizeUnit(match[1]);
      if (value && !['1', '11', '14', '2026'].includes(value)) candidates.push(value);
    }
  }
  for (const resident of residents) {
    const unit = normalizeUnit(resident.unit);
    if (!unit) continue;
    const unitPattern = new RegExp(`(?:SN|UNIDADE|APTO|APT|APARTAMENTO|AP)?\\s*[:#-]?\\s*0*${unit}\\b`, 'i');
    if (unitPattern.test(normalized)) candidates.unshift(unit);
  }
  return candidates[0] || '';
}

function recipientLineCandidate(text = '') {
  const lines = cleanText(text).split('\n').map(line => line.trim()).filter(Boolean);
  const marker = lines.findIndex(line => /DESTINAT[AÁ]RI[OA]/i.test(line));
  const pool = marker >= 0 ? lines.slice(marker + 1, marker + 5) : lines.slice(0, 10);
  return pool.find(line => {
    const n = normalize(line);
    return n.length >= 6 && /[A-Z]{2,}\s+[A-Z]{2,}/.test(n) && !/CEP|BRASILIA|TAGUATINGA|REMETENTE|EXPRESS|PEDIDO|LOTE|EDIFICIO|AV\b|RUA\b|QUADRA|CSA\b/.test(n);
  }) || '';
}

function residentMatch(text = '', residents = []) {
  const normalizedText = normalize(text);
  let best = null;
  for (const resident of residents) {
    const name = normalizeName(resident.name);
    const nameTokens = tokens(name);
    if (!nameTokens.length) continue;
    const hits = nameTokens.filter(token => normalizedText.includes(token)).length;
    const ratio = hits / nameTokens.length;
    const unit = normalizeUnit(resident.unit);
    const unitHit = unit && new RegExp(`\\b0*${unit}\\b`).test(normalizedText);
    const score = ratio * 80 + (unitHit ? 25 : 0) + (hits >= 2 ? 10 : 0);
    if (!best || score > best.score) best = { resident, score, hits, ratio, unitHit };
  }
  return best && best.score >= 52 ? best : null;
}

function learnedMatch(text = '', learned = []) {
  const normalizedText = normalize(text);
  let best = null;
  for (const row of learned) {
    const residentTokens = tokens(row.resident_name || '');
    const nameHits = residentTokens.filter(token => normalizedText.includes(token)).length;
    const unit = normalizeUnit(row.unit);
    const unitHit = unit && new RegExp(`\\b0*${unit}\\b`).test(normalizedText);
    const carrierHit = row.carrier && normalize(row.carrier).split(' ').some(token => token.length > 2 && normalizedText.includes(token));
    const score = nameHits * 14 + (unitHit ? 35 : 0) + (carrierHit ? 12 : 0) + Math.min(20, Number(row.hits || 0) * 2);
    if (!best || score > best.score) best = { row, score, nameHits, unitHit, carrierHit };
  }
  return best && best.score >= 28 ? best : null;
}

async function loadResidents() {
  const result = await q(`SELECT id,name,unit,email,phone,telegram_chat_id
    FROM residents WHERE COALESCE(active,true)=true AND COALESCE(deleted_at, NULL) IS NULL
    ORDER BY id DESC LIMIT 1500`).catch(async () => q(`SELECT id,name,unit,email,phone,telegram_chat_id
    FROM residents WHERE COALESCE(active,true)=true ORDER BY id DESC LIMIT 1500`));
  return result.rows || [];
}

async function parseSmart(text = '', codes = []) {
  const clean = cleanText(text);
  const residents = await loadResidents().catch(() => []);
  const tracking = extractTracking(clean, codes);
  const carrierDetected = extractCarrier(clean);
  const key = templateKey(clean, carrierDetected);
  await ensureSchema().catch(() => null);
  const learnedRows = (await q(`SELECT * FROM package_ocr_learning
    WHERE template_key=$1 OR updated_at > now() - interval '180 days'
    ORDER BY (template_key=$1) DESC, hits DESC, updated_at DESC LIMIT 120`, [key]).catch(() => ({ rows: [] }))).rows;
  const resident = residentMatch(clean, residents);
  const learned = learnedMatch(clean, learnedRows);
  const extractedUnit = extractUnit(clean, residents);
  const lineRecipient = recipientLineCandidate(clean);

  let recipient = resident?.resident?.name || lineRecipient;
  let unit = resident?.resident?.unit || extractedUnit;
  let carrier = carrierDetected;
  let learningApplied = false;

  if (learned) {
    if (!recipient && learned.row.resident_name) recipient = learned.row.resident_name;
    if (!unit && learned.row.unit) unit = learned.row.unit;
    if (!carrier && learned.row.carrier) carrier = learned.row.carrier;
    learningApplied = Boolean(learned.row.resident_name || learned.row.unit || learned.row.carrier);
  }

  const orders = extractOrder(clean);
  let confidence = 18;
  if (tracking.tracking) confidence += 24;
  if (carrier) confidence += 10;
  if (recipient) confidence += 18;
  if (unit) confidence += 18;
  if (resident) confidence += Math.min(14, Math.round(resident.score / 8));
  if (learningApplied) confidence += Math.min(10, Math.round((learned?.score || 0) / 7));
  confidence = Math.max(0, Math.min(99, confidence));

  return {
    tracking: tracking.tracking,
    barcode: tracking.barcode,
    barcode_format: tracking.barcode_format,
    recipient: recipient || '',
    unit: normalizeUnit(unit),
    label: carrier || '',
    carrier: carrier || '',
    order_number: orders.order_number,
    invoice_number: orders.invoice_number,
    notes: learningApplied ? 'Leitura aprimorada pelo histórico de etiquetas conferidas.' : '',
    confidence,
    validation_status: tracking.tracking && recipient && unit && confidence >= 80 ? 'validada' : 'revisao',
    source_type: learningApplied ? 'ocr_aprendizado' : 'ocr_inteligente',
    learning_applied: learningApplied,
    resident_match: resident ? { id: resident.resident.id, name: resident.resident.name, unit: resident.resident.unit, score: Math.round(resident.score) } : null,
    template_key: key,
    code_candidates: tracking.candidates.slice(0, 8),
  };
}

async function learnFromPackage(body = {}) {
  const text = cleanText(body.extracted_text || body.text || '');
  if (!text) return { ok: false, skipped: true, reason: 'Sem texto OCR para aprendizagem.' };
  const carrier = String(body.carrier || body.label || '').trim().slice(0, 120);
  const residentName = String(body.recipient || body.resident_name || '').trim().slice(0, 180);
  const unit = normalizeUnit(body.unit || '');
  const trackingPattern = String(body.tracking || body.barcode || '').trim().slice(0, 100);
  const key = String(body.template_key || templateKey(text, carrier));
  await ensureSchema();
  const result = await q(`INSERT INTO package_ocr_learning(template_key,resident_name,unit,carrier,tracking_pattern,sample_text,hits,confidence)
    VALUES($1,$2,$3,$4,$5,$6,1,$7)
    ON CONFLICT(template_key,resident_name,unit,carrier)
    DO UPDATE SET hits=package_ocr_learning.hits+1,tracking_pattern=COALESCE(NULLIF(EXCLUDED.tracking_pattern,''),package_ocr_learning.tracking_pattern),
      sample_text=EXCLUDED.sample_text,confidence=LEAST(0.98,package_ocr_learning.confidence+0.025),updated_at=now()
    RETURNING id,hits,confidence,template_key`, [key, residentName, unit, carrier, trackingPattern, text.slice(0, 8000), Number(body.ocr_confidence || 0) >= 80 ? 0.82 : 0.72]);
  return { ok: true, learned: result.rows[0] };
}

function installRoutes(app) {
  if (routesInstalled) return;
  routesInstalled = true;
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  router.use(authenticate, canManagePackages);

  router.post('/parse-package', async (req, res) => {
    try { return res.json(await parseSmart(req.body?.text || '', req.body?.codes || req.body?.barcodes || [])); }
    catch (error) {
      console.warn('[ocr-intelligence] leitura:', error.message);
      return res.status(500).json({ error: 'Não foi possível concluir a leitura inteligente.', details: error.message });
    }
  });

  router.post('/learn-package', async (req, res) => {
    try { return res.json(await learnFromPackage(req.body || {})); }
    catch (error) {
      console.warn('[ocr-intelligence] aprendizagem:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar a aprendizagem da etiqueta.', details: error.message });
    }
  });

  router.get('/status', async (_req, res) => {
    await ensureSchema().catch(() => null);
    const totals = await q('SELECT COUNT(*)::int total,COALESCE(SUM(hits),0)::int leituras FROM package_ocr_learning').catch(() => ({ rows: [{ total: 0, leituras: 0 }] }));
    return res.json({ ok: true, engine: 'ocr-intelligence-v14', ...totals.rows[0] });
  });

  const originalUse = installRoutes.originalUse || express.application.use;
  originalUse.call(app, '/api/ocr-intelligence', router);
  const timer = setTimeout(() => void ensureSchema(), 4000);
  timer.unref?.();
  console.log('[ocr-intelligence] Leitura e aprendizagem de etiquetas carregadas.');
}

const originalUse = express.application.use;
installRoutes.originalUse = originalUse;
express.application.use = function patchedUse(...args) {
  if (!routesInstalled) installRoutes(this);
  return originalUse.apply(this, args);
};
