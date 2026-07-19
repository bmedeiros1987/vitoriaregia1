import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const TZ = process.env.TZ || 'America/Sao_Paulo';
let pool;
let schemaPromise;

function dbConfig() {
  let connectionString = DATABASE_URL;
  try {
    const url = new URL(DATABASE_URL);
    ['sslmode','sslcert','sslkey','sslrootcert'].forEach(key => url.searchParams.delete(key));
    connectionString = url.toString();
  } catch {}
  const external = /render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|aivencloud\.com/i.test(DATABASE_URL);
  return { connectionString, ssl: external ? { rejectUnauthorized:false } : false, max:4, connectionTimeoutMillis:15000 };
}
function db(){ return pool ||= new Pool(dbConfig()); }
async function q(sql,params=[]){ return db().query(sql,params); }
function send(res,status,body){ res.status(status).type('application/json; charset=utf-8').send(JSON.stringify(body)); }
function clean(value=''){ return String(value ?? '').trim(); }
function normalizeUnit(value=''){ return clean(value).replace(/\s+/g,'').toUpperCase(); }
function bool(value,fallback=false){ if(value===undefined||value===null||value==='') return fallback; return value===true || ['1','true','sim','yes','on'].includes(clean(value).toLowerCase()); }
function list(value=[]){ if(Array.isArray(value)) return value; try{return JSON.parse(value||'[]');}catch{return [];} }
function base64url(value){ return Buffer.from(value).toString('base64url'); }
function sign(payload){ return createHmac('sha256',JWT_SECRET).update(payload).digest('base64url'); }
function makeToken(visitor){ const payload=base64url(JSON.stringify({v:1,id:Number(visitor.id),n:visitor.qr_nonce})); return `${payload}.${sign(payload)}`; }
function parseToken(raw=''){
  let token=clean(raw);
  try { const url=new URL(token); token=url.searchParams.get('visitor_invite')||token; } catch {}
  const match=token.match(/[?&]visitor_invite=([^&#]+)/); if(match) token=decodeURIComponent(match[1]);
  const [payload,signature]=token.split('.');
  if(!payload||!signature) throw new Error('QR Code inválido.');
  const expected=Buffer.from(sign(payload)); const received=Buffer.from(signature);
  if(expected.length!==received.length || !timingSafeEqual(expected,received)) throw new Error('Assinatura do convite inválida.');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!data?.id||!data?.n) throw new Error('Convite incompleto.');
  return { token,data };
}
function auth(req){
  const token=clean(req.headers.authorization).replace(/^Bearer\s+/i,'');
  if(!token) throw Object.assign(new Error('Faça login para acessar os convites.'),{status:401});
  try{return jwt.verify(token,JWT_SECRET);}catch{throw Object.assign(new Error('Sessão expirada. Entre novamente.'),{status:401});}
}
function canCreate(user){ return ['master','admin','sindico','subsindico','portaria','morador'].includes(clean(user?.role).toLowerCase()); }
function canValidate(user){ return ['master','admin','sindico','subsindico','portaria'].includes(clean(user?.role).toLowerCase()); }
function ownVisitor(user,visitor){ return clean(user?.role).toLowerCase()!=='morador' || normalizeUnit(user?.unit)===normalizeUnit(visitor?.unit); }
async function ensureSchema(){
  if(schemaPromise) return schemaPromise;
  schemaPromise=(async()=>{
    const columns=[
      "access_dates JSONB DEFAULT '[]'::jsonb",
      "access_start_time TEXT DEFAULT '00:00'",
      "access_end_time TEXT DEFAULT '23:59'",
      "qr_nonce TEXT",
      "qr_enabled BOOLEAN DEFAULT true",
      "qr_created_at TIMESTAMP",
      "qr_revoked_at TIMESTAMP",
      "last_access_at TIMESTAMP",
      "access_count INTEGER DEFAULT 0",
      "max_entries INTEGER DEFAULT 0",
      "entry_log JSONB DEFAULT '[]'::jsonb"
    ];
    for(const column of columns) await q(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS ${column}`);
    await q("UPDATE visitors SET qr_enabled=true WHERE qr_enabled IS NULL");
    await q("UPDATE visitors SET access_dates='[]'::jsonb WHERE access_dates IS NULL");
    await q("UPDATE visitors SET entry_log='[]'::jsonb WHERE entry_log IS NULL");
  })();
  return schemaPromise;
}
function localParts(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(date).map(p=>[p.type,p.value]));
  const weekday={Sun:'0',Mon:'1',Tue:'2',Wed:'3',Thu:'4',Fri:'5',Sat:'6'}[parts.weekday];
  return { date:`${parts.year}-${parts.month}-${parts.day}`, time:`${parts.hour}:${parts.minute}`, weekday };
}
function withinTime(now,start='00:00',end='23:59'){
  start=clean(start)||'00:00'; end=clean(end)||'23:59';
  return start<=end ? now>=start&&now<=end : now>=start||now<=end;
}
function validateVisitor(visitor,at=new Date()){
  const now=localParts(at), reasons=[];
  if(!visitor) reasons.push('Convite não encontrado.');
  else {
    if(visitor.deleted_at || visitor.qr_revoked_at || visitor.qr_enabled===false || /remov|revog|cancel/i.test(clean(visitor.status))) reasons.push('Este convite foi revogado.');
    if(visitor.valid_from && now.date<String(visitor.valid_from).slice(0,10)) reasons.push('Este convite ainda não começou.');
    if(visitor.valid_until && now.date>String(visitor.valid_until).slice(0,10)) reasons.push('Este convite expirou.');
    const dates=list(visitor.access_dates).map(String);
    if(dates.length && !dates.includes(now.date)) reasons.push('A entrada não está autorizada para esta data.');
    const weekdays=list(visitor.weekdays).map(String);
    if(visitor.recurring && !dates.length && weekdays.length && !weekdays.includes(now.weekday)) reasons.push('A entrada não está autorizada neste dia da semana.');
    if(!withinTime(now.time,visitor.access_start_time,visitor.access_end_time)) reasons.push(`Horário permitido: ${visitor.access_start_time||'00:00'} às ${visitor.access_end_time||'23:59'}.`);
    if(Number(visitor.max_entries||0)>0 && Number(visitor.access_count||0)>=Number(visitor.max_entries)) reasons.push('O limite de entradas deste convite foi atingido.');
  }
  return { valid:reasons.length===0,reasons,checked_at:new Date().toISOString(),local_date:now.date,local_time:now.time };
}
function publicBase(req){ return clean(process.env.PUBLIC_APP_URL)||`${req.protocol}://${req.get('host')}`; }
async function invitePayload(req,visitor){
  if(!visitor.qr_nonce){
    const nonce=randomBytes(18).toString('hex');
    visitor=(await q('UPDATE visitors SET qr_nonce=$1,qr_enabled=true,qr_created_at=now(),qr_revoked_at=NULL WHERE id=$2 RETURNING *',[nonce,visitor.id])).rows[0];
  }
  const token=makeToken(visitor);
  const url=`${publicBase(req)}/?visitor_invite=${encodeURIComponent(token)}#/portaria/visitantes`;
  const qr_svg=await QRCode.toString(url,{type:'svg',width:360,margin:2,errorCorrectionLevel:'M',color:{dark:'#062b45',light:'#ffffff'}});
  return { token,url,qr_svg };
}
async function getVisitor(id){ return (await q('SELECT * FROM visitors WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0]||null; }
async function audit(actor,action,entity){ await q('INSERT INTO audit(actor,action,entity) VALUES($1,$2,$3)',[actor||'sistema',action,entity||'']).catch(()=>null); }
function visitorView(v){ return { id:v.id,name:v.name,document:v.document,unit:v.unit,authorized_by:v.authorized_by,status:v.status,plate:v.plate,phone:v.phone,recurring:v.recurring,weekdays:list(v.weekdays),access_dates:list(v.access_dates),valid_from:v.valid_from,valid_until:v.valid_until,access_start_time:v.access_start_time,access_end_time:v.access_end_time,max_entries:Number(v.max_entries||0),access_count:Number(v.access_count||0),last_access_at:v.last_access_at,qr_enabled:v.qr_enabled,qr_revoked_at:v.qr_revoked_at,notes:v.notes,created_at:v.created_at }; }
async function handle(req,res,next){
  if(!req.path.startsWith('/api/visitor-invites')) return next();
  try{
    await ensureSchema();
    const user=auth(req);
    if(req.method==='POST' && req.path==='/api/visitor-invites'){
      if(!canCreate(user)) throw Object.assign(new Error('Seu perfil não pode criar convites.'),{status:403});
      const body=req.body||{}; const role=clean(user.role).toLowerCase();
      const name=clean(body.name), unit=role==='morador'?normalizeUnit(user.unit):normalizeUnit(body.unit), authorizedBy=role==='morador'?clean(user.name):clean(body.authorized_by||user.name);
      if(!name||!unit) throw Object.assign(new Error('Informe o nome do visitante e a unidade.'),{status:400});
      const recurring=bool(body.recurring,false), dates=[...new Set(list(body.access_dates).map(x=>clean(x)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
      const weekdays=[...new Set(list(body.weekdays).map(x=>clean(x)).filter(x=>/^[0-6]$/.test(x)))];
      if(recurring && !dates.length && !weekdays.length) throw Object.assign(new Error('Selecione ao menos um dia da semana para o visitante recorrente.'),{status:400});
      let validFrom=clean(body.valid_from), validUntil=clean(body.valid_until);
      if(!recurring){ const date=clean(body.visit_date||validFrom||new Date().toISOString().slice(0,10)); validFrom=date; validUntil=date; }
      if(dates.length){ validFrom=validFrom||dates[0]; validUntil=validUntil||dates.at(-1); }
      if(!validFrom||!validUntil) throw Object.assign(new Error('Defina a data inicial e a data final.'),{status:400});
      if(validUntil<validFrom) throw Object.assign(new Error('A data final não pode ser anterior à inicial.'),{status:400});
      const nonce=randomBytes(18).toString('hex');
      const result=await q(`INSERT INTO visitors(name,document,unit,authorized_by,status,plate,phone,recurring,weekdays,valid_from,valid_until,announce_required,announcement_channel,notification_channels,photo_data,reservation_id,notes,access_dates,access_start_time,access_end_time,qr_nonce,qr_enabled,qr_created_at,max_entries) VALUES($1,$2,$3,$4,'autorizado',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,true,now(),$21) RETURNING *`,[name,clean(body.document),unit,authorizedBy,clean(body.plate),clean(body.phone),recurring,JSON.stringify(weekdays),validFrom,validUntil,body.announce_required!==false,clean(body.announcement_channel)||'interfone',JSON.stringify(body.notification_channels||{}),clean(body.photo_data),body.reservation_id||null,clean(body.notes),JSON.stringify(dates),clean(body.access_start_time)||'00:00',clean(body.access_end_time)||'23:59',nonce,Math.max(0,Number(body.max_entries||0))]);
      const visitor=result.rows[0], invite=await invitePayload(req,visitor);
      await audit(user.email||user.name,'gerou convite QR de visitante',`${name} unidade ${unit}`);
      return send(res,201,{ok:true,visitor:visitorView(visitor),invite});
    }
    const passMatch=req.path.match(/^\/api\/visitor-invites\/(\d+)\/pass$/);
    if(req.method==='GET'&&passMatch){
      const visitor=await getVisitor(passMatch[1]); if(!visitor) throw Object.assign(new Error('Visitante não encontrado.'),{status:404});
      if(!ownVisitor(user,visitor)) throw Object.assign(new Error('Convite não pertence à sua unidade.'),{status:403});
      return send(res,200,{ok:true,visitor:visitorView(visitor),invite:await invitePayload(req,visitor),validation:validateVisitor(visitor)});
    }
    const regenMatch=req.path.match(/^\/api\/visitor-invites\/(\d+)\/regenerate$/);
    if(req.method==='POST'&&regenMatch){
      const visitor=await getVisitor(regenMatch[1]); if(!visitor) throw Object.assign(new Error('Visitante não encontrado.'),{status:404}); if(!ownVisitor(user,visitor)) throw Object.assign(new Error('Convite não pertence à sua unidade.'),{status:403});
      const updated=(await q('UPDATE visitors SET qr_nonce=$1,qr_enabled=true,qr_created_at=now(),qr_revoked_at=NULL,status=$2 WHERE id=$3 RETURNING *',[randomBytes(18).toString('hex'),'autorizado',visitor.id])).rows[0];
      await audit(user.email||user.name,'regenerou convite QR',`${updated.name} unidade ${updated.unit}`);
      return send(res,200,{ok:true,visitor:visitorView(updated),invite:await invitePayload(req,updated)});
    }
    const revokeMatch=req.path.match(/^\/api\/visitor-invites\/(\d+)\/revoke$/);
    if(req.method==='POST'&&revokeMatch){
      const visitor=await getVisitor(revokeMatch[1]); if(!visitor) throw Object.assign(new Error('Visitante não encontrado.'),{status:404}); if(!ownVisitor(user,visitor)) throw Object.assign(new Error('Convite não pertence à sua unidade.'),{status:403});
      const updated=(await q('UPDATE visitors SET qr_enabled=false,qr_revoked_at=now(),status=$1 WHERE id=$2 RETURNING *',['revogado',visitor.id])).rows[0];
      await audit(user.email||user.name,'revogou convite QR',`${updated.name} unidade ${updated.unit}`);
      return send(res,200,{ok:true,visitor:visitorView(updated)});
    }
    if(req.method==='POST'&&req.path==='/api/visitor-invites/verify'){
      if(!canValidate(user)) throw Object.assign(new Error('Somente a portaria e a administração podem validar entradas.'),{status:403});
      const parsed=parseToken(req.body?.token||req.body?.qr_value||'');
      const visitor=await getVisitor(parsed.data.id);
      if(!visitor || visitor.qr_nonce!==parsed.data.n) throw Object.assign(new Error('Este QR Code foi substituído ou não existe.'),{status:404});
      const validation=validateVisitor(visitor);
      let updated=visitor;
      if(validation.valid && bool(req.body?.confirm_entry,false)){
        const entry={at:new Date().toISOString(),by:user.email||user.name||`usuário ${user.id}`,gate:clean(req.body?.gate||'Portaria principal')};
        updated=(await q("UPDATE visitors SET access_count=COALESCE(access_count,0)+1,last_access_at=now(),entry_log=COALESCE(entry_log,'[]'::jsonb)||$1::jsonb WHERE id=$2 RETURNING *",[JSON.stringify([entry]),visitor.id])).rows[0];
        await audit(user.email||user.name,'confirmou entrada por QR',`${visitor.name} unidade ${visitor.unit}`);
      }
      return send(res,200,{ok:true,valid:validation.valid,validation,visitor:visitorView(updated),entry_confirmed:validation.valid&&bool(req.body?.confirm_entry,false)});
    }
    return send(res,404,{error:'Recurso de convite não encontrado.'});
  }catch(error){ return send(res,error.status||500,{error:error.message||'Não foi possível processar o convite.'}); }
}

const originalUse=express.application.use;
express.application.use=function(...args){
  const result=originalUse.apply(this,args);
  this.__vrUseCount=(this.__vrUseCount||0)+1;
  if(!this.__visitorQrInstalled && this.__vrUseCount>=2){ this.__visitorQrInstalled=true; originalUse.call(this,handle); }
  return result;
};
