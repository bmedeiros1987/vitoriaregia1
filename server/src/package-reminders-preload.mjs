import express from 'express';
import {
  q, clean, bool, authenticate, isAdmin, sendEmail, sendTelegram, sendWhatsApp
} from './reservation-rsvp-lib.mjs';

let routesInstalled=false;
let schemaPromise=null;
let processing=false;

function parseJson(value,fallback={}) { if(!value) return fallback; if(typeof value==='object') return value; try { return JSON.parse(value); } catch { return fallback; } }

async function ensureSchema() {
  if(schemaPromise) return schemaPromise;
  schemaPromise=(async()=>{
    for(const column of [
      "reminder_enabled BOOLEAN DEFAULT true",
      "reminder_interval_minutes INTEGER DEFAULT 180",
      "next_reminder_at TIMESTAMP",
      "reminder_count INTEGER DEFAULT 0",
      "max_reminders INTEGER DEFAULT 4",
      "last_reminder_at TIMESTAMP",
      "reminder_channels JSONB DEFAULT '{\"app\":true,\"email\":true,\"telegram\":true,\"whatsapp\":true}'::jsonb",
      "response_email_notified_at TIMESTAMP",
      "last_response_notification_status JSONB DEFAULT '{}'::jsonb"
    ]) await q(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS ${column}`);
    await q('UPDATE packages SET reminder_enabled=true WHERE reminder_enabled IS NULL');
    await q('UPDATE packages SET reminder_interval_minutes=COALESCE(reminder_interval_minutes,180),max_reminders=COALESCE(max_reminders,4),reminder_count=COALESCE(reminder_count,0)');
    await q("UPDATE packages SET next_reminder_at=COALESCE(next_reminder_at,now() + interval '120 minutes') WHERE deleted_at IS NULL AND COALESCE(status,'')<>'entregue' AND reminder_enabled=true");
  })().catch(error=>{ schemaPromise=null; throw error; });
  return schemaPromise;
}

async function residentForPackage(pack) {
  if(pack.resident_id){
    const found=(await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[pack.resident_id])).rows[0];
    if(found) return found;
  }
  const unit=clean(pack.unit,40).replace(/\s+/g,'').toUpperCase();
  return (await q("SELECT * FROM residents WHERE upper(replace(coalesce(unit,''),' ',''))=$1 AND COALESCE(active,true)=true ORDER BY id DESC LIMIT 1",[unit])).rows[0] || null;
}

function preferenceLabel(value='') {
  return ({
    receber_elevador:'envio pelo elevador autorizado', retirar_portaria:'retirada na portaria', retirar_mais_tarde:'retirada mais tarde',
    retirar_agora:'retirada imediata', chamar_interfone:'contato por interfone solicitado', nao_reconhece:'encomenda não reconhecida', nao_informado:'sem resposta'
  }[String(value || '').toLowerCase()] || 'sem resposta');
}

function reminderMessage(pack) {
  const preference=String(pack.delivery_preference || 'nao_informado').toLowerCase();
  const code=pack.pickup_code ? ` Código de retirada: ${pack.pickup_code}.` : '';
  if(preference==='retirar_agora') return `Lembrete: a encomenda ${pack.tracking || pack.id} continua aguardando retirada na portaria.${code}`;
  if(preference==='retirar_mais_tarde') return `Lembrete combinado: a encomenda ${pack.tracking || pack.id} ainda está aguardando na portaria.${code}`;
  if(preference==='chamar_interfone') return `A portaria ainda precisa falar com você sobre a encomenda ${pack.tracking || pack.id}.${code}`;
  return `Sua encomenda ${pack.tracking || pack.id} continua aguardando na portaria.${code} Confirme quando pretende retirar.`;
}

async function createAppNotification(pack,resident,title,body) {
  return q(`INSERT INTO notifications(resident_id,title,body,channel,channels,status,delivery_status,delivery_started_at,delivery_finished_at,action_url,payload)
    VALUES($1,$2,$3,'app',$4,'enviada',$5,now(),now(),'/#/portaria/encomendas',$6) RETURNING id`,[
    resident?.id || pack.resident_id || null,title,body,JSON.stringify({app:true,email:true,telegram:true,whatsapp:true}),JSON.stringify({app:'registrada'}),
    JSON.stringify({package_id:pack.id,event_type:'package_reminder',telegram_call_suppress:true})
  ]).catch(()=>({rows:[]}));
}

async function deliverReminder(pack,{manual=false}={}) {
  const resident=await residentForPackage(pack);
  if(!resident){ await q("UPDATE packages SET next_reminder_at=now()+interval '12 hours' WHERE id=$1",[pack.id]).catch(()=>null); return {ok:false,skipped:true,reason:'Morador não localizado.'}; }
  const body=reminderMessage(pack);
  const title=manual ? 'Lembrete de encomenda reenviado' : 'Lembrete: encomenda aguardando retirada';
  const channels={app:true,email:true,telegram:true,whatsapp:true,...parseJson(pack.reminder_channels,{})};
  const results={};
  if(channels.app) results.app=await createAppNotification(pack,resident,title,body).then(()=>({ok:true}));
  if(channels.email) results.email=await sendEmail({to:resident.email,subject:`${title} - Vitória Régia`,text:body,html:`<h2>${title}</h2><p>${body}</p><p><a href="${String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/,'')}/#/portaria/encomendas">Abrir encomendas</a></p>`});
  if(channels.telegram) results.telegram=await sendTelegram(resident.telegram_chat_id,body);
  if(channels.whatsapp) results.whatsapp=await sendWhatsApp(resident.whatsapp_phone || resident.phone,body);
  const interval=Math.max(30,Number(pack.reminder_interval_minutes || 180));
  await q("UPDATE packages SET reminder_count=COALESCE(reminder_count,0)+1,last_reminder_at=now(),next_reminder_at=now()+($1||' minutes')::interval,notification_status='lembrete_enviado' WHERE id=$2",[String(interval),pack.id]);
  return {ok:Object.values(results).some(result=>result?.ok),results};
}

async function notifyResponseByEmail(pack) {
  const resident=await residentForPackage(pack);
  const label=preferenceLabel(pack.delivery_preference);
  const residentText=`Sua resposta sobre a encomenda ${pack.tracking || pack.id} foi registrada: ${label}. A portaria foi avisada.`;
  const results={};
  if(resident?.email) results.resident=await sendEmail({to:resident.email,subject:'Resposta sobre encomenda registrada',text:residentText});
  const staff=(await q("SELECT DISTINCT email FROM users WHERE role IN ('master','admin','sindico','subsindico','portaria') AND COALESCE(active,true)=true AND COALESCE(email,'')<>''")).rows;
  const staffText=`Unidade ${pack.unit || '-'} respondeu sobre a encomenda ${pack.tracking || pack.id}: ${label}.`;
  results.staff=[];
  for(const row of staff.slice(0,30)) results.staff.push(await sendEmail({to:row.email,subject:'Resposta de morador sobre encomenda',text:staffText}));
  let reminderEnabled=true;
  let nextMinutes=180;
  if(['receber_elevador','nao_reconhece'].includes(pack.delivery_preference)) reminderEnabled=false;
  else if(pack.delivery_preference==='retirar_agora') nextMinutes=60;
  else if(pack.delivery_preference==='chamar_interfone') nextMinutes=90;
  await q("UPDATE packages SET response_email_notified_at=now(),last_response_notification_status=$1,reminder_enabled=$2,next_reminder_at=CASE WHEN $2 THEN now()+($3||' minutes')::interval ELSE NULL END WHERE id=$4",[JSON.stringify(results),reminderEnabled,String(nextMinutes),pack.id]);
  return results;
}

async function processDue() {
  if(processing) return;
  processing=true;
  try {
    await ensureSchema();
    const responses=(await q("SELECT * FROM packages WHERE deleted_at IS NULL AND COALESCE(status,'')<>'entregue' AND resident_response_at IS NOT NULL AND response_email_notified_at IS NULL AND resident_response_at>now()-interval '24 hours' ORDER BY resident_response_at ASC LIMIT 20")).rows;
    for(const pack of responses) await notifyResponseByEmail(pack).catch(error=>console.warn('[package-reminders] resposta:',error.message));
    const due=(await q("SELECT * FROM packages WHERE deleted_at IS NULL AND reminder_enabled=true AND COALESCE(status,'')<>'entregue' AND COALESCE(reminder_count,0)<COALESCE(max_reminders,4) AND COALESCE(next_reminder_at,created_at+interval '120 minutes')<=now() ORDER BY COALESCE(next_reminder_at,created_at) ASC LIMIT 25")).rows;
    for(const pack of due) await deliverReminder(pack).catch(error=>console.warn('[package-reminders] lembrete:',error.message));
    await q("UPDATE packages SET reminder_enabled=false,next_reminder_at=NULL WHERE deleted_at IS NOT NULL OR COALESCE(status,'')='entregue' OR COALESCE(reminder_count,0)>=COALESCE(max_reminders,4)").catch(()=>null);
  } finally { processing=false; }
}

async function packageForUser(id,user) {
  const pack=(await q('SELECT * FROM packages WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
  if(!pack) throw Object.assign(new Error('Encomenda não encontrada.'),{status:404});
  if(!isAdmin(user) && Number(pack.resident_id || 0)!==Number(user.resident_id || 0)) throw Object.assign(new Error('Esta encomenda não pertence ao seu usuário.'),{status:403});
  return pack;
}
function view(pack) {
  return {id:pack.id,tracking:pack.tracking,unit:pack.unit,recipient:pack.recipient,status:pack.status,delivery_preference:pack.delivery_preference,
    reminder_enabled:pack.reminder_enabled,reminder_interval_minutes:Number(pack.reminder_interval_minutes || 180),next_reminder_at:pack.next_reminder_at,
    reminder_count:Number(pack.reminder_count || 0),max_reminders:Number(pack.max_reminders || 4),last_reminder_at:pack.last_reminder_at,created_at:pack.created_at};
}

function installRoutes(app) {
  if(routesInstalled) return;
  routesInstalled=true;
  const router=express.Router();
  router.use(express.json({limit:'512kb'}));
  router.get('/package-reminders',authenticate,async(req,res)=>{
    try {
      await ensureSchema();
      const rows=isAdmin(req.vrUser)
        ? (await q("SELECT * FROM packages WHERE deleted_at IS NULL AND COALESCE(status,'')<>'entregue' ORDER BY created_at DESC LIMIT 200")).rows
        : (await q("SELECT * FROM packages WHERE resident_id=$1 AND deleted_at IS NULL AND COALESCE(status,'')<>'entregue' ORDER BY created_at DESC",[req.vrUser.resident_id || 0])).rows;
      res.json({ok:true,packages:rows.map(view),defaults:{first_delay_minutes:120,interval_minutes:180,max_reminders:4,email_always:true}});
    } catch(error) { res.status(400).json({error:error.message}); }
  });
  router.post('/packages/:id/reminder-now',authenticate,async(req,res)=>{
    try { await ensureSchema(); res.json({ok:true,result:await deliverReminder(await packageForUser(req.params.id,req.vrUser),{manual:true})}); }
    catch(error) { res.status(error.status || 400).json({error:error.message}); }
  });
  router.put('/packages/:id/reminder-config',authenticate,async(req,res)=>{
    try {
      await ensureSchema();
      const pack=await packageForUser(req.params.id,req.vrUser);
      const enabled=bool(req.body.reminder_enabled,pack.reminder_enabled);
      const interval=Math.max(30,Math.min(1440,Number(req.body.reminder_interval_minutes ?? pack.reminder_interval_minutes ?? 180)));
      const max=Math.max(1,Math.min(12,Number(req.body.max_reminders ?? pack.max_reminders ?? 4)));
      const next=req.body.next_reminder_at || null;
      const channels={app:true,email:true,telegram:true,whatsapp:true,...parseJson(req.body.reminder_channels,{})};
      const updated=(await q("UPDATE packages SET reminder_enabled=$1,reminder_interval_minutes=$2,max_reminders=$3,next_reminder_at=CASE WHEN $1 THEN COALESCE($4::timestamp,now()+($2||' minutes')::interval) ELSE NULL END,reminder_channels=$5 WHERE id=$6 RETURNING *",[enabled,interval,max,next,JSON.stringify({...channels,email:true}),pack.id])).rows[0];
      res.json({ok:true,package:view(updated)});
    } catch(error) { res.status(error.status || 400).json({error:error.message}); }
  });
  router.post('/package-reminders/process',authenticate,async(req,res)=>{
    if(!isAdmin(req.vrUser)) return res.status(403).json({error:'Apenas portaria ou administração pode processar a fila.'});
    await processDue();
    res.json({ok:true});
  });
  const originalUse=installRoutes.originalUse || express.application.use;
  originalUse.call(app,'/api',router);
  setTimeout(()=>void processDue(),12000).unref?.();
  setInterval(()=>void processDue(),60*1000).unref?.();
  console.log('[package-reminders] Lembretes automáticos e e-mail de resposta carregados.');
}

const originalUse=express.application.use;
installRoutes.originalUse=originalUse;
express.application.use=function patchedUse(...args){ if(!routesInstalled) installRoutes(this); return originalUse.apply(this,args); };
