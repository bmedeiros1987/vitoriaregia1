import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

const DATABASE_URL=process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const JWT_SECRET=process.env.JWT_SECRET || createHash('sha256').update(`${DATABASE_URL}|vitoria-regia-jwt-v14`).digest('hex');
let pool;
let schemaPromise;
let installed=false;

function dbConfig(){
  let connectionString=DATABASE_URL;
  try{ const url=new URL(DATABASE_URL); ['sslmode','sslcert','sslkey','sslrootcert'].forEach(k=>url.searchParams.delete(k)); connectionString=url.toString(); }catch{}
  let external=false;
  try{ external=!['localhost','127.0.0.1','::1'].includes(new URL(DATABASE_URL).hostname); }catch{ external=/render|neon|supabase|railway|aiven|amazonaws|azure/i.test(DATABASE_URL); }
  return {connectionString,ssl:external?{rejectUnauthorized:false}:false,max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:15000};
}
function db(){ return pool ||= new Pool(dbConfig()); }
async function q(sql,params=[]){ return db().query(sql,params); }
function clean(v=''){ return String(v??'').trim(); }
function authPayload(req){
  const token=clean(req.headers.authorization).replace(/^Bearer\s+/i,'');
  if(!token) return null;
  try{return jwt.verify(token,JWT_SECRET);}catch{return null;}
}
function allowedRole(role=''){ return ['master','admin','sindico','subsindico'].includes(clean(role).toLowerCase()); }
function roleLabel(role=''){ return ({master:'área técnica',admin:'administrador',sindico:'síndico',subsindico:'subsíndico'}[clean(role).toLowerCase()]||role||'usuário'); }
function testRecord(record={}){
  const text=[record.name,record.email,record.recipient,record.resident,record.unit,record.notes,record.label,record.tracking,record.area].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /(^|\W)(teste|test|testing|demo|demonstracao|homolog|homologacao|qa)(\W|$)/i.test(text) || /@(example|teste|test)\./i.test(clean(record.email));
}
async function ensureSchema(){
  if(schemaPromise) return schemaPromise;
  schemaPromise=(async()=>{
    await q(`CREATE TABLE IF NOT EXISTS vr_entity_ownership(
      entity_type TEXT NOT NULL,
      entity_id BIGINT NOT NULL,
      created_by_user_id INTEGER,
      created_by_role TEXT DEFAULT '',
      created_by_email TEXT DEFAULT '',
      is_test_record BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY(entity_type,entity_id)
    )`);
    await q(`CREATE TABLE IF NOT EXISTS vr_deletion_log(
      id BIGSERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id BIGINT NOT NULL,
      deleted_by_user_id INTEGER,
      deleted_by_role TEXT DEFAULT '',
      deleted_by_email TEXT DEFAULT '',
      creator_role TEXT DEFAULT '',
      creator_email TEXT DEFAULT '',
      was_test_record BOOLEAN DEFAULT false,
      snapshot JSONB DEFAULT '{}'::jsonb,
      deleted_at TIMESTAMP DEFAULT now()
    )`);
    await q('CREATE INDEX IF NOT EXISTS vr_ownership_creator_idx ON vr_entity_ownership(created_by_role,created_by_user_id)');
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP').catch(()=>null);
  })().catch(error=>{schemaPromise=null;throw error;});
  return schemaPromise;
}

const entityConfig={
  users:{select:'SELECT * FROM users WHERE id=$1',remove:"UPDATE users SET active=false,deleted_at=now() WHERE id=$1 RETURNING *",label:r=>r.email||r.name||String(r.id)},
  residents:{select:'SELECT * FROM residents WHERE id=$1',remove:'UPDATE residents SET active=false,deleted_at=now() WHERE id=$1 RETURNING *',label:r=>r.name||r.unit||String(r.id)},
  packages:{select:'SELECT * FROM packages WHERE id=$1',remove:"UPDATE packages SET deleted_at=now(),status='removida' WHERE id=$1 RETURNING *",label:r=>r.tracking||r.recipient||String(r.id)},
  reservations:{select:'SELECT * FROM reservations WHERE id=$1',remove:"UPDATE reservations SET deleted_at=now(),status='cancelada',cancel_reason=COALESCE(NULLIF(cancel_reason,''),'Excluída pelo painel de gestão') WHERE id=$1 RETURNING *",label:r=>`${r.area||'Reserva'} ${r.reserved_for||''}`.trim()||String(r.id)}
};

async function inferOwnership(type,record={}){
  const direct=(await q('SELECT * FROM vr_entity_ownership WHERE entity_type=$1 AND entity_id=$2',[type,record.id]).catch(()=>({rows:[]}))).rows[0];
  if(direct) return direct;
  if(record.created_by){
    const user=(await q('SELECT id,email,role FROM users WHERE id=$1',[record.created_by]).catch(()=>({rows:[]}))).rows[0];
    if(user) return {created_by_user_id:user.id,created_by_role:user.role,created_by_email:user.email,is_test_record:testRecord(record)};
  }
  const candidates=[record.email,record.name,record.recipient,record.tracking,record.area,String(record.id)].filter(Boolean).map(String);
  if(candidates.length){
    const audit=(await q(`SELECT a.actor,a.action,a.entity,u.id user_id,u.role user_role,u.email user_email
      FROM audit a LEFT JOIN users u ON lower(coalesce(u.email,''))=lower(coalesce(a.actor,''))
      WHERE a.entity=ANY($1::text[]) AND a.action ~* '(criou|cadastrou|registrou|lançou|autorizou)'
      ORDER BY a.id DESC LIMIT 1`,[candidates]).catch(()=>({rows:[]}))).rows[0];
    if(audit) return {created_by_user_id:audit.user_id||null,created_by_role:audit.user_role||'',created_by_email:audit.user_email||audit.actor||'',is_test_record:testRecord(record)};
  }
  return {created_by_user_id:null,created_by_role:'',created_by_email:'',is_test_record:testRecord(record)};
}
async function rememberOwnership(type,id,user,record={}){
  if(!type||!id||!user) return;
  await ensureSchema();
  await q(`INSERT INTO vr_entity_ownership(entity_type,entity_id,created_by_user_id,created_by_role,created_by_email,is_test_record,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(entity_type,entity_id) DO UPDATE SET
    created_by_user_id=COALESCE(vr_entity_ownership.created_by_user_id,EXCLUDED.created_by_user_id),
    created_by_role=COALESCE(NULLIF(vr_entity_ownership.created_by_role,''),EXCLUDED.created_by_role),
    created_by_email=COALESCE(NULLIF(vr_entity_ownership.created_by_email,''),EXCLUDED.created_by_email),
    is_test_record=vr_entity_ownership.is_test_record OR EXCLUDED.is_test_record,updated_at=now()`,[type,id,user.id||null,clean(user.role).toLowerCase(),user.email||'',testRecord(record)]).catch(()=>null);
}
function idFromResponse(type,body){
  if(!body||typeof body!=='object') return null;
  if(type==='users') return body.user?.id || body.id;
  return body.id || body.reservation?.id || body.package?.id;
}
function entityFromPostPath(path=''){
  if(path==='/api/users') return 'users';
  if(path==='/api/residents') return 'residents';
  if(path==='/api/packages') return 'packages';
  if(path==='/api/reservations') return 'reservations';
  return '';
}

async function deletionHandler(type,req,res,next){
  try{
    await ensureSchema();
    const actor=authPayload(req);
    if(!actor) return res.status(401).json({error:'Sessão expirada. Entre novamente para excluir.'});
    const actorRole=clean(actor.role).toLowerCase();
    if(!allowedRole(actorRole)) return res.status(403).json({error:'Somente síndico, subsíndico ou administrador podem excluir este registro.'});
    const cfg=entityConfig[type];
    const record=(await q(cfg.select,[req.params.id])).rows[0];
    if(!record) return res.status(404).json({error:'Registro não encontrado ou já removido.'});
    if(type==='users'){
      if(Number(record.id)===Number(actor.id)) return res.status(409).json({error:'Por segurança, você não pode excluir o próprio acesso.'});
      if(clean(record.role).toLowerCase()==='master' && actorRole!=='master') return res.status(403).json({error:'O acesso técnico principal não pode ser excluído por este perfil.'});
    }
    const owner=await inferOwnership(type,record);
    const isTest=Boolean(owner.is_test_record || testRecord(record));
    if(actorRole==='admin' && clean(owner.created_by_role).toLowerCase()==='sindico' && !isTest){
      return res.status(403).json({error:'Este cadastro foi realizado pelo síndico. O administrador não pode excluí-lo; apenas o próprio síndico, o subsíndico autorizado ou a área técnica. A exceção é exclusiva para cadastros claramente identificados como teste.'});
    }
    const removed=(await q(cfg.remove,[req.params.id])).rows[0];
    await q(`INSERT INTO vr_deletion_log(entity_type,entity_id,deleted_by_user_id,deleted_by_role,deleted_by_email,creator_role,creator_email,was_test_record,snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[type,req.params.id,actor.id||null,actorRole,actor.email||'',owner.created_by_role||'',owner.created_by_email||'',isTest,JSON.stringify(record)]).catch(()=>null);
    await q('INSERT INTO audit(actor,action,entity) VALUES($1,$2,$3)',[actor.email||roleLabel(actorRole),`excluiu ${type} com governança`,cfg.label(record)]).catch(()=>null);
    return res.json({ok:true,removed:{id:removed.id},policy:{actor_role:actorRole,creator_role:owner.created_by_role||'',test_record:isTest}});
  }catch(error){return next(error);}
}

function install(app){
  if(installed) return;
  installed=true;
  const originalUse=install.originalUse || express.application.use;
  originalUse.call(app,async(req,res,next)=>{
    const type=req.method==='POST' ? entityFromPostPath(req.path) : '';
    if(!type) return next();
    const actor=authPayload(req);
    if(!actor) return next();
    const originalJson=res.json.bind(res);
    res.json=(body)=>{
      const id=idFromResponse(type,body);
      if(id) void rememberOwnership(type,id,actor,body?.user||body).catch(()=>null);
      return originalJson(body);
    };
    next();
  });
  for(const type of Object.keys(entityConfig)){
    express.application.delete.call(app,`/api/${type}/:id`,(req,res,next)=>deletionHandler(type,req,res,next));
  }
  express.application.get.call(app,'/api/deletion-governance/status',(req,res)=>{
    const actor=authPayload(req);
    if(!actor) return res.status(401).json({error:'Sessão necessária.'});
    return res.json({ok:true,version:'14.0.3',roles:['admin','sindico','subsindico'],admin_cannot_delete_sindico_records:true,test_exception:true});
  });
  setTimeout(()=>void ensureSchema(),3500).unref?.();
  console.log('[deletion-governance] Exclusões protegidas e rastreáveis carregadas.');
}

const originalUse=express.application.use;
install.originalUse=originalUse;
express.application.use=function patchedUse(...args){ if(!installed) install(this); return originalUse.apply(this,args); };
