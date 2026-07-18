import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';

export const JWT_SECRET=process.env.JWT_SECRET||'troque-este-segredo-em-producao';
export const DATABASE_URL=process.env.DATABASE_URL||'postgres://localhost/vitoriaregia';
export const TRIAL_DAYS=Math.max(1,Number(process.env.PLATFORM_TRIAL_DAYS||60));
export const CONTRACT_VERSION=process.env.PLATFORM_CONTRACT_VERSION||'VR-ONE-2026.07-v1';
export const TENANT_KEY=process.env.PLATFORM_TENANT_KEY||'condominio-vitoria-regia';
let pool,schemaPromise;

function dbConfig(){let connectionString=DATABASE_URL;try{const u=new URL(DATABASE_URL);['sslmode','sslcert','sslkey','sslrootcert'].forEach(k=>u.searchParams.delete(k));connectionString=u.toString();}catch{}const external=/render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com|aivencloud\.com/i.test(DATABASE_URL);return{connectionString,ssl:external?{rejectUnauthorized:false}:false,max:5,connectionTimeoutMillis:15000};}
export function db(){return pool||=(new Pool(dbConfig()));}
export async function q(sql,params=[]){return db().query(sql,params);}
export const clean=(v='')=>String(v??'').trim();
export const onlyDigits=(v='')=>clean(v).replace(/\D/g,'');
export const sha256=(v='')=>createHash('sha256').update(String(v)).digest('hex');
export const bool=(v,f=false)=>v===undefined||v===null||v===''?f:v===true||['1','true','sim','yes','on'].includes(clean(v).toLowerCase());
export const addDays=(date,days)=>{const d=new Date(date);d.setUTCDate(d.getUTCDate()+Number(days||0));return d;};
export const dateISO=date=>new Date(date).toISOString().slice(0,10);
export function send(res,status,body){res.status(status).type('application/json; charset=utf-8').send(JSON.stringify(body));}
export function authPayload(req){const token=clean(req.headers.authorization).replace(/^Bearer\s+/i,'');if(!token)throw Object.assign(new Error('Faça login para continuar.'),{status:401});try{return jwt.verify(token,JWT_SECRET);}catch{throw Object.assign(new Error('Sessão expirada. Entre novamente.'),{status:401});}}
export async function currentUser(req){const p=authPayload(req);const r=p.id?await q('SELECT * FROM users WHERE id=$1 LIMIT 1',[p.id]):await q('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1',[clean(p.email)]);const user=r.rows[0];if(!user||user.active===false)throw Object.assign(new Error('Usuário inativo ou não localizado.'),{status:401});return user;}
export const managerRole=user=>['master','admin','sindico','subsindico'].includes(clean(user?.role).toLowerCase());
export const condoSigner=user=>['sindico','subsindico'].includes(clean(user?.role).toLowerCase());
export const ipOf=req=>clean(req.headers['x-forwarded-for']).split(',')[0]||req.socket?.remoteAddress||'';
export const publicBase=req=>clean(process.env.PUBLIC_APP_URL)||clean(process.env.RENDER_EXTERNAL_URL)||`${req.protocol}://${req.get('host')}`;

export async function ensureSchema(){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await q(`CREATE TABLE IF NOT EXISTS platform_subscriptions(id SERIAL PRIMARY KEY,tenant_key TEXT UNIQUE NOT NULL,condo_name TEXT,plan_code TEXT DEFAULT 'one',status TEXT DEFAULT 'trial',trial_started_at TIMESTAMP NOT NULL,trial_ends_at TIMESTAMP NOT NULL,contract_version TEXT,contract_hash TEXT,contract_accepted_by_user_id INTEGER,contract_accepted_name TEXT,contract_accepted_document TEXT,contract_accepted_at TIMESTAMP,asaas_checkout_id TEXT,asaas_checkout_url TEXT,asaas_customer_id TEXT,asaas_subscription_id TEXT,billing_type TEXT,amount NUMERIC(12,2) DEFAULT 0,cycle TEXT DEFAULT 'MONTHLY',next_due_date DATE,last_payment_status TEXT,last_payment_at TIMESTAMP,last_event TEXT,last_event_at TIMESTAMP,created_at TIMESTAMP DEFAULT now(),updated_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS platform_contract_acceptances(id SERIAL PRIMARY KEY,tenant_key TEXT NOT NULL,user_id INTEGER,user_role TEXT,full_name TEXT NOT NULL,document TEXT NOT NULL,contract_version TEXT NOT NULL,contract_hash TEXT NOT NULL,accepted_ip TEXT,user_agent TEXT,evidence JSONB DEFAULT '{}'::jsonb,accepted_at TIMESTAMP DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS platform_webhook_events(id SERIAL PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,event_name TEXT,external_reference TEXT,payload_hash TEXT,processed_status TEXT,received_at TIMESTAMP DEFAULT now())`);
    for(const col of ['platform_owner BOOLEAN DEFAULT false','system_data_access BOOLEAN DEFAULT true','managed_admin BOOLEAN DEFAULT false','deactivated_reason TEXT','deactivated_at TIMESTAMP'])await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`);
    await q(`CREATE OR REPLACE FUNCTION vr_one_enforce_admin_policy() RETURNS trigger AS $$ BEGIN IF NEW.role IN ('sindico','subsindico') AND COALESCE(NEW.active,true)=true THEN UPDATE users SET active=false,deactivated_reason='Administrador local substituído pela gestão condominial',deactivated_at=now() WHERE role='admin' AND COALESCE(active,true)=true AND COALESCE(platform_owner,false)=false AND id<>NEW.id; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q('DROP TRIGGER IF EXISTS trg_vr_one_admin_policy ON users');
    await q(`CREATE TRIGGER trg_vr_one_admin_policy AFTER INSERT OR UPDATE OF role,active ON users FOR EACH ROW EXECUTE FUNCTION vr_one_enforce_admin_policy()`);
    const ownerEmail=clean(process.env.PLATFORM_OWNER_EMAIL).toLowerCase();
    if(ownerEmail)await q("UPDATE users SET platform_owner=true,role='master',managed_admin=true,system_data_access=$2,active=true WHERE lower(email)=lower($1)",[ownerEmail,bool(process.env.PLATFORM_OWNER_DATA_ACCESS,false)]);
    const ownerCount=Number((await q('SELECT count(*)::int count FROM users WHERE COALESCE(platform_owner,false)=true')).rows[0]?.count||0);
    if(!ownerCount){const masters=(await q("SELECT id FROM users WHERE role='master' AND COALESCE(active,true)=true ORDER BY id LIMIT 2")).rows;if(masters.length===1)await q('UPDATE users SET platform_owner=true,managed_admin=true,system_data_access=false WHERE id=$1',[masters[0].id]);}
    const hasManager=Number((await q("SELECT count(*)::int count FROM users WHERE role IN ('sindico','subsindico') AND COALESCE(active,true)=true")).rows[0]?.count||0)>0;
    if(hasManager)await q("UPDATE users SET active=false,deactivated_reason='Administrador local substituído pela gestão condominial',deactivated_at=COALESCE(deactivated_at,now()) WHERE role='admin' AND COALESCE(active,true)=true AND COALESCE(platform_owner,false)=false");
    const now=new Date();await q(`INSERT INTO platform_subscriptions(tenant_key,condo_name,status,trial_started_at,trial_ends_at,contract_version) VALUES($1,$2,'trial',$3,$4,$5) ON CONFLICT(tenant_key) DO NOTHING`,[TENANT_KEY,process.env.CONDO_NAME||'Condomínio Vitória Régia',now,addDays(now,TRIAL_DAYS),CONTRACT_VERSION]);
  })();
  return schemaPromise;
}
export async function subscription(){await ensureSchema();return(await q('SELECT * FROM platform_subscriptions WHERE tenant_key=$1',[TENANT_KEY])).rows[0];}
export function subscriptionView(row){const now=Date.now(),end=new Date(row.trial_ends_at).getTime(),paid=['active','paid'].includes(clean(row.status).toLowerCase());return{id:row.id,plan_code:row.plan_code,status:row.status,trial_days:TRIAL_DAYS,trial_started_at:row.trial_started_at,trial_ends_at:row.trial_ends_at,trial_days_remaining:Math.max(0,Math.ceil((end-now)/86400000)),trial_active:!paid&&end>=now,contract_signed:Boolean(row.contract_accepted_at),contract_version:row.contract_version,contract_hash:row.contract_accepted_at?row.contract_hash:'',contract_accepted_name:row.contract_accepted_at?row.contract_accepted_name:'',contract_accepted_at:row.contract_accepted_at,checkout_ready:Boolean(clean(process.env.ASAAS_API_KEY)&&Number(process.env.ASAAS_MONTHLY_VALUE||0)>0),checkout_url:row.asaas_checkout_url||'',billing_type:row.billing_type||'',amount:Number(row.amount||process.env.ASAAS_MONTHLY_VALUE||0),cycle:row.cycle||'MONTHLY',next_due_date:row.next_due_date,last_payment_status:row.last_payment_status||'',last_payment_at:row.last_payment_at,asaas_environment:clean(process.env.ASAAS_ENVIRONMENT).toLowerCase()==='production'?'produção':'sandbox'};}

const sensitive=/^\/api\/(residents|packages|visitors|visitor-invites|reservations|finance|boletos|invoices|messages|occurrence-book|incidents|emergency|documents|audit)(\/|$)/i;
export async function privacyGuard(req,res,next){if(!sensitive.test(req.path))return next();try{const user=await currentUser(req);if(user.platform_owner===true&&user.system_data_access===false)return send(res,403,{error:'Administrador geral com escopo técnico. O acesso a dados sensíveis do condomínio está bloqueado pela política de privacidade.'});}catch{}return next();}

export async function auditSnapshot(){
  const checks=[],add=(key,label,ok,detail,severity='normal')=>checks.push({key,label,ok:Boolean(ok),detail,severity:ok?'ok':severity});
  await q('SELECT 1');add('database','Banco de dados',true,'Conexão operacional.');
  const tables=['users','residents','packages','visitors','reservations','finance','audit','platform_subscriptions','platform_contract_acceptances'];const found=(await q('SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',[tables])).rows.map(r=>r.table_name);add('schema','Estrutura essencial',tables.every(t=>found.includes(t)),`${found.length}/${tables.length} tabelas disponíveis.`,'critical');
  const dup=Number((await q("SELECT count(*)::int count FROM (SELECT lower(email) FROM users WHERE email IS NOT NULL GROUP BY lower(email) HAVING count(*)>1)x")).rows[0]?.count||0);add('duplicates','Usuários duplicados',dup===0,dup?`${dup} e-mail(s) duplicado(s).`:'Nenhum e-mail duplicado.','high');
  const orphan=Number((await q("SELECT count(*)::int count FROM users u LEFT JOIN residents r ON r.id=u.resident_id WHERE u.role='morador' AND u.resident_id IS NOT NULL AND r.id IS NULL")).rows[0]?.count||0);add('orphans','Vínculos de moradores',orphan===0,orphan?`${orphan} vínculo(s) órfão(s).`:'Vínculos consistentes.','high');
  const admins=Number((await q("SELECT count(*)::int count FROM users WHERE role='admin' AND COALESCE(active,true)=true AND COALESCE(platform_owner,false)=false")).rows[0]?.count||0),managers=Number((await q("SELECT count(*)::int count FROM users WHERE role IN ('sindico','subsindico') AND COALESCE(active,true)=true")).rows[0]?.count||0);add('admin-policy','Política administrativa',!(managers>0&&admins>0),`${managers} gestor(es); ${admins} admin(s) genérico(s) ativo(s).`,'critical');
  const owners=Number((await q("SELECT count(*)::int count FROM users WHERE COALESCE(platform_owner,false)=true AND COALESCE(active,true)=true")).rows[0]?.count||0);add('owner','Administrador geral',owners===1,owners===1?'Um proprietário técnico protegido.':`${owners} proprietários técnicos ativos.`,'critical');
  const maintenance=Number((await q("SELECT count(*)::int count FROM maintenance WHERE scheduled_for<current_date AND status NOT IN ('concluida','concluído','realizada','cancelada')")).rows[0]?.count||0);add('maintenance','Manutenção vencida',maintenance===0,maintenance?`${maintenance} manutenção(ões) vencida(s).`:'Nenhuma manutenção vencida.');
  const packages=Number((await q("SELECT count(*)::int count FROM packages WHERE created_at<now()-interval '3 days' AND status NOT IN ('entregue','retirada','removido')")).rows[0]?.count||0);add('packages','Encomendas antigas',packages===0,packages?`${packages} encomenda(s) há mais de 3 dias.`:'Fluxo de encomendas em dia.');
  add('telegram','Telegram',Boolean(clean(process.env.TELEGRAM_BOT_TOKEN)),clean(process.env.TELEGRAM_BOT_TOKEN)?'Bot configurado.':'Token não configurado.');add('email','E-mail',Boolean(clean(process.env.SENDGRID_API_KEY)||clean(process.env.SMTP_HOST)),(clean(process.env.SENDGRID_API_KEY)||clean(process.env.SMTP_HOST))?'Canal configurado.':'Canal não configurado.');add('asaas','ASAAS',Boolean(clean(process.env.ASAAS_API_KEY)),clean(process.env.ASAAS_API_KEY)?'Conta da plataforma configurada.':'API Key ainda não configurada.','high');
  const score=Math.max(0,Math.round(checks.reduce((s,c)=>s+(c.ok?100:c.severity==='critical'?0:c.severity==='high'?35:60),0)/checks.length));return{score,checks,generated_at:new Date().toISOString(),summary:{ok:checks.filter(c=>c.ok).length,attention:checks.filter(c=>!c.ok).length,total:checks.length}};
}

export async function adminPolicyStatus(){return(await q("SELECT id,name,email,role,active,platform_owner,system_data_access,deactivated_reason,deactivated_at FROM users WHERE role IN ('master','admin','sindico','subsindico') ORDER BY CASE role WHEN 'master' THEN 1 WHEN 'sindico' THEN 2 WHEN 'subsindico' THEN 3 ELSE 4 END,id")).rows;}
export async function claimOwner(user){await q('UPDATE users SET platform_owner=false,managed_admin=false WHERE platform_owner=true');await q("UPDATE users SET platform_owner=true,managed_admin=true,role='master',system_data_access=false,active=true WHERE id=$1",[user.id]);await q("UPDATE users SET active=false,deactivated_reason='Administrador local substituído pela gestão condominial',deactivated_at=now() WHERE role='admin' AND id<>$1 AND COALESCE(platform_owner,false)=false AND EXISTS(SELECT 1 FROM users WHERE role IN ('sindico','subsindico') AND COALESCE(active,true)=true)",[user.id]);return{ok:true,message:'Administrador geral definido com escopo técnico e privacidade reforçada.'};}
export const evidenceNonce=()=>randomBytes(12).toString('hex');
