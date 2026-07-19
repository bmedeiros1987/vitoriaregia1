import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';

export const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
export const JWT_SECRET = process.env.JWT_SECRET || createHash('sha256').update(`${DATABASE_URL}|vitoria-regia-jwt-v14`).digest('hex');
const TOKEN_SECRET = process.env.RESERVATION_RSVP_SECRET || JWT_SECRET;
export const TZ = process.env.TZ || 'America/Sao_Paulo';
const rateBuckets = new Map();
let schemaPromise = null;

function databaseConfig() {
  let connectionString = DATABASE_URL;
  try {
    const url = new URL(DATABASE_URL);
    ['sslmode','sslcert','sslkey','sslrootcert'].forEach(key => url.searchParams.delete(key));
    connectionString = url.toString();
  } catch {}
  let external = false;
  try { external = !['localhost','127.0.0.1','::1'].includes(new URL(DATABASE_URL).hostname); }
  catch { external = /render|neon|supabase|railway|aiven|amazonaws|azure/i.test(DATABASE_URL); }
  return { connectionString, ssl:external ? { rejectUnauthorized:false } : false, max:4, idleTimeoutMillis:30000, connectionTimeoutMillis:15000 };
}

const pool = new Pool(databaseConfig());
export async function q(sql, params=[]) { return pool.query(sql, params); }
export function clean(value='', max=500) { return String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max); }
export function onlyDigits(value='') { return String(value || '').replace(/\D/g,''); }
export function normalizeEmail(value='') { return clean(value,240).toLowerCase(); }
export function normalizeUnit(value='') { return clean(value,40).replace(/\s+/g,'').toUpperCase(); }
export function bool(value, fallback=false) { if(value===undefined || value===null || value==='') return fallback; return value===true || ['1','true','sim','yes','on','ativo'].includes(String(value).toLowerCase()); }
export function list(value=[]) { if(Array.isArray(value)) return value; try { return JSON.parse(value || '[]'); } catch { return []; } }
export function randomNonce(bytes=20) { return randomBytes(bytes).toString('hex'); }
export function randomCode(length=6) { return String(Math.floor(Math.random() * (10 ** length))).padStart(length,'0'); }
export function hashCode(code) { return createHash('sha256').update(`${TOKEN_SECRET}|${code}`).digest('hex'); }

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function hmac(value) { return createHmac('sha256',TOKEN_SECRET).update(value).digest('base64url'); }
export function tokenFor(type,id,nonce) {
  const payload=base64url(JSON.stringify({v:1,t:type,id:Number(id),n:String(nonce)}));
  return `${payload}.${hmac(payload)}`;
}
export function parseToken(raw='') {
  let token=clean(raw,3000);
  try { const url=new URL(token); token=url.searchParams.get('rsvp') || token; } catch {}
  const [payload,signature]=token.split('.');
  if(!payload || !signature) throw Object.assign(new Error('Link de confirmação inválido.'),{status:400});
  const expected=Buffer.from(hmac(payload));
  const received=Buffer.from(signature);
  if(expected.length!==received.length || !timingSafeEqual(expected,received)) throw Object.assign(new Error('A assinatura do convite não é válida.'),{status:403});
  let data;
  try { data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); }
  catch { throw Object.assign(new Error('Convite inválido.'),{status:400}); }
  if(!['campaign','invite'].includes(data?.t) || !data?.id || !data?.n) throw Object.assign(new Error('Convite incompleto.'),{status:400});
  return { token, data };
}

export function authenticate(req,res,next) {
  const token=String(req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
  if(!token) return res.status(401).json({error:'Sessão necessária.'});
  try { req.vrUser=jwt.verify(token,JWT_SECRET); return next(); }
  catch { return res.status(401).json({error:'Sessão expirada. Entre novamente para continuar.'}); }
}
export function isAdmin(user={}) { return ['master','admin','sindico','subsindico','portaria'].includes(String(user.role || '').toLowerCase()); }
export function publicBase(req) { return clean(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`,1000).replace(/\/$/,''); }
export function localDate(value) { if(!value) return ''; try { return new Intl.DateTimeFormat('pt-BR',{timeZone:TZ}).format(new Date(value)); } catch { return String(value); } }

function ipHash(req) { return createHash('sha256').update(`${TOKEN_SECRET}|${req.ip || req.socket?.remoteAddress || ''}`).digest('hex'); }
export function requestIpHash(req) { return ipHash(req); }
export function rateLimit(req,res,next) {
  const key=`${ipHash(req)}:${req.params.token || req.path}`;
  const now=Date.now();
  const bucket=rateBuckets.get(key) || {count:0,expires:now+15*60*1000};
  if(bucket.expires<=now){ bucket.count=0; bucket.expires=now+15*60*1000; }
  bucket.count+=1;
  rateBuckets.set(key,bucket);
  if(bucket.count>35) return res.status(429).json({error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'});
  next();
}
setInterval(()=>{ const now=Date.now(); for(const [key,bucket] of rateBuckets) if(bucket.expires<=now) rateBuckets.delete(key); },10*60*1000).unref?.();

export async function ensureSchema() {
  if(schemaPromise) return schemaPromise;
  schemaPromise=(async()=>{
    await q(`CREATE TABLE IF NOT EXISTS reservation_rsvp_campaigns(
      id BIGSERIAL PRIMARY KEY,
      reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
      public_nonce TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      mode TEXT DEFAULT 'invite_only',
      require_verification BOOLEAN DEFAULT true,
      auto_approve_verified BOOLEAN DEFAULT false,
      allow_companions BOOLEAN DEFAULT true,
      max_companions INTEGER DEFAULT 3,
      companions_count_as_guests BOOLEAN DEFAULT true,
      max_submissions INTEGER DEFAULT 200,
      expires_at TIMESTAMP,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS reservation_rsvp_invitations(
      id BIGSERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES reservation_rsvp_campaigns(id) ON DELETE CASCADE,
      reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      invite_nonce TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT DEFAULT '', phone TEXT DEFAULT '', whatsapp_phone TEXT DEFAULT '', telegram_username TEXT DEFAULT '', document TEXT DEFAULT '',
      status TEXT DEFAULT 'convidado', source_type TEXT DEFAULT 'organizer', counts_as_guest BOOLEAN DEFAULT true,
      verification_channel TEXT DEFAULT '', verification_code_hash TEXT DEFAULT '', verification_expires_at TIMESTAMP, verification_attempts INTEGER DEFAULT 0,
      verified_at TIMESTAMP, approved_at TIMESTAMP, approved_by INTEGER, qr_visitor_id INTEGER,
      submitted_ip_hash TEXT DEFAULT '', notification_attempts INTEGER DEFAULT 0, last_notified_at TIMESTAMP,
      created_by INTEGER, created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS reservation_rsvp_companions(
      id BIGSERIAL PRIMARY KEY,
      invitation_id INTEGER NOT NULL REFERENCES reservation_rsvp_invitations(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT DEFAULT '', phone TEXT DEFAULT '', age_group TEXT DEFAULT 'adulto',
      counts_as_guest BOOLEAN DEFAULT true, status TEXT DEFAULT 'confirmado', qr_visitor_id INTEGER,
      created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now()
    )`);
    await q('CREATE INDEX IF NOT EXISTS rsvp_invitation_reservation_idx ON reservation_rsvp_invitations(reservation_id,status,created_at DESC)');
    await q('CREATE INDEX IF NOT EXISTS rsvp_invitation_contact_idx ON reservation_rsvp_invitations(reservation_id,lower(email),phone)');
    for(const column of ["email TEXT DEFAULT ''","whatsapp_phone TEXT DEFAULT ''","telegram_username TEXT DEFAULT ''","rsvp_status TEXT DEFAULT ''","rsvp_invitation_id INTEGER","qr_delivery_status JSONB DEFAULT '{}'::jsonb"]){
      await q(`ALTER TABLE reservation_visitors ADD COLUMN IF NOT EXISTS ${column}`).catch(()=>null);
    }
  })().catch(error=>{ schemaPromise=null; throw error; });
  return schemaPromise;
}

export async function getSetting(key,fallback='') {
  const result=await q('SELECT value FROM settings WHERE key=$1',[key]).catch(()=>({rows:[]}));
  const value=result.rows[0]?.value;
  return value!==undefined && value!==null && String(value).trim()!=='' ? String(value) : String(process.env[key] || fallback || '');
}

async function emailTransport() {
  const provider=(await getSetting('EMAIL_PROVIDER',process.env.EMAIL_PROVIDER || '')).toLowerCase();
  const sendgridKey=await getSetting('SENDGRID_API_KEY',process.env.SENDGRID_API_KEY || '');
  if(sendgridKey && (provider==='sendgrid' || !provider)){ sgMail.setApiKey(sendgridKey); return {type:'sendgrid'}; }
  const host=await getSetting('SMTP_HOST',process.env.SMTP_HOST || '');
  const user=await getSetting('SMTP_USER',process.env.SMTP_USER || '');
  const pass=await getSetting('SMTP_PASS',process.env.SMTP_PASS || '');
  if(!host || !user || !pass) return null;
  const port=Number(await getSetting('SMTP_PORT',process.env.SMTP_PORT || 587));
  const secure=bool(await getSetting('SMTP_SECURE',process.env.SMTP_SECURE || ''),port===465);
  return {type:'smtp',transport:nodemailer.createTransport({host,port,secure,auth:{user,pass}})};
}

export async function sendEmail({to,subject,text,html=''}) {
  const target=normalizeEmail(to);
  if(!target) return {ok:false,skipped:true,reason:'E-mail não informado.'};
  const transport=await emailTransport();
  if(!transport) return {ok:false,skipped:true,reason:'E-mail não configurado.'};
  const fromEmail=await getSetting('SENDGRID_FROM_EMAIL',process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM || 'nao-responda@vitoriaregia.app');
  const fromName=await getSetting('SENDGRID_FROM_NAME',process.env.SENDGRID_FROM_NAME || 'Vitória Régia');
  try {
    if(transport.type==='sendgrid') await sgMail.send({to:target,from:{email:fromEmail,name:fromName},subject,text,html:html || `<p>${String(text || '').replace(/\n/g,'<br>')}</p>`});
    else await transport.transport.sendMail({to:target,from:`${fromName} <${fromEmail}>`,subject,text,html:html || undefined});
    return {ok:true};
  } catch(error) { return {ok:false,error:error.message}; }
}

export async function sendWhatsApp(phone,text) {
  const to=onlyDigits(phone);
  if(!to) return {ok:false,skipped:true,reason:'WhatsApp não informado.'};
  const accessToken=await getSetting('WHATSAPP_ACCESS_TOKEN',process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '');
  const phoneId=await getSetting('WHATSAPP_PHONE_NUMBER_ID',process.env.WHATSAPP_PHONE_NUMBER_ID || '');
  const version=await getSetting('WHATSAPP_API_VERSION',process.env.WHATSAPP_API_VERSION || 'v19.0');
  if(!accessToken || !phoneId) return {ok:false,skipped:true,reason:'WhatsApp não configurado.'};
  try {
    const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${accessToken}`},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:clean(text,3500)}})});
    return {ok:response.ok,data:await response.json().catch(()=>({}))};
  } catch(error) { return {ok:false,error:error.message}; }
}

export async function sendTelegram(chatId,text) {
  const chat=clean(chatId,80);
  const botToken=await getSetting('TELEGRAM_BOT_TOKEN',process.env.TELEGRAM_BOT_TOKEN || '');
  if(!chat || !botToken) return {ok:false,skipped:true,reason:'Telegram não vinculado.'};
  try {
    const response=await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text:clean(text,3880),disable_web_page_preview:true,disable_notification:true})});
    const body=await response.json().catch(()=>({}));
    return {ok:response.ok && body.ok!==false,data:body};
  } catch(error) { return {ok:false,error:error.message}; }
}

export async function resolveTelegramChat(username='') {
  const normalized=clean(username,80).replace(/^@/,'').toLowerCase();
  if(!normalized) return '';
  const result=await q(`SELECT telegram_chat_id FROM users WHERE lower(regexp_replace(coalesce(telegram_username,''),'^@','','g'))=$1 AND COALESCE(active,true)=true AND COALESCE(telegram_chat_id,'')<>''
    UNION ALL SELECT telegram_chat_id FROM residents WHERE lower(regexp_replace(coalesce(telegram_username,''),'^@','','g'))=$1 AND COALESCE(active,true)=true AND COALESCE(telegram_chat_id,'')<>'' LIMIT 1`,[normalized]).catch(()=>({rows:[]}));
  return result.rows[0]?.telegram_chat_id || '';
}
