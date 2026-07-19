import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import {
  q, clean, onlyDigits, normalizeEmail, bool, randomNonce, hashCode, authenticate, rateLimit,
  ensureSchema, sendEmail, localDate, tokenFor
} from './reservation-rsvp-lib.mjs';
import {
  eventView, publicCampaignUrl, publicInviteUrl, reservationForUser, campaignForReservation, campaignByToken, invitationByToken,
  invitationView, ensureInvitationQrs, saveCompanions, sendOtp, sendInvitationDelivery, createInvitation, parseImportFile, parseRsvpToken
} from './reservation-rsvp-service.mjs';

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:Number(process.env.RSVP_IMPORT_LIMIT_MB || 15)*1024*1024}});
let routesInstalled=false;

async function handleResidentReservation(req,res,next) {
  try {
    const user=req.vrUser;
    if(String(user.role || '').toLowerCase()!=='morador') return next();
    const dbUser=(await q('SELECT * FROM users WHERE id=$1 AND COALESCE(active,true)=true',[user.id])).rows[0];
    if(!dbUser) return res.status(401).json({error:'Usuário não localizado. Entre novamente.'});
    const residentId=dbUser.resident_id || user.resident_id;
    const resident=residentId ? (await q('SELECT * FROM residents WHERE id=$1 AND COALESCE(active,true)=true',[residentId])).rows[0] : null;
    if(!resident) return res.status(400).json({error:'Seu usuário ainda não está vinculado a um morador/unidade. Solicite a vinculação à administração.'});
    const area=(await q('SELECT * FROM common_areas WHERE lower(name)=lower($1) AND COALESCE(active,true)=true LIMIT 1',[req.body.area || ''])).rows[0];
    if(!area) return res.status(400).json({error:'Selecione uma área comum ativa cadastrada pelo condomínio.'});
    const reservedFor=String(req.body.reserved_for || '').slice(0,10);
    const mode=String(req.body.reservation_mode || req.body.shift || 'horario').toLowerCase();
    const allDay=req.body.all_day===true || /dia_todo|dia todo|dia inteiro|24h/.test(mode);
    const start=allDay ? '00:00' : String(req.body.start_time || '19:00').slice(0,5);
    const end=allDay ? '23:59' : String(req.body.end_time || '23:00').slice(0,5);
    if(!reservedFor) return res.status(400).json({error:'Informe a data da reserva.'});
    const conflict=(await q(`SELECT id FROM reservations WHERE deleted_at IS NULL AND COALESCE(status,'') NOT IN ('cancelada','cancelado')
      AND lower(area)=lower($1) AND reserved_for=$2::date
      AND ($3::time<COALESCE(NULLIF(end_time,''),'23:59')::time AND $4::time>COALESCE(NULLIF(start_time,''),'00:00')::time) LIMIT 1`,[area.name,reservedFor,start,end])).rows[0];
    if(conflict) return res.status(409).json({error:'Essa data e horário já estão bloqueados para o espaço selecionado.'});
    const terms=req.body.terms_accepted===true;
    const fee=Number(area.fee_amount || 0);
    const status=!terms ? 'pendente_aceite_regras' : fee>0 ? 'pendente_pagamento' : 'pre_agendada';
    let reservation=(await q(`INSERT INTO reservations(area,area_id,unit,resident,resident_id,reserved_for,start_time,end_time,shift,reservation_mode,period_label,all_day,status,fee_amount,document_text,terms_accepted,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[
      area.name,area.id,resident.unit,resident.name,resident.id,reservedFor,start,end,mode,req.body.period_label || '',allDay,status,fee,
      req.body.document_text || area.rules_document || '',terms,user.id
    ])).rows[0];
    if(fee>0){
      const code=randomNonce(22).toUpperCase();
      const boleto=(await q(`INSERT INTO boletos(unit,resident_id,title,amount,due_date,status,bank_name,barcode,digitable_line,payment_link,provider,external_id,source_type,source_id)
        VALUES($1,$2,$3,$4,$5,'pendente','',$6,$6,'','manual',$7,'reservation',$8) RETURNING *`,[resident.unit,resident.id,`Taxa de reserva - ${area.name}`,fee,reservedFor,code,`RSV-${reservation.id}`,reservation.id])).rows[0];
      await q('UPDATE reservations SET boleto_id=$1 WHERE id=$2',[boleto.id,reservation.id]);
      await q("INSERT INTO finance(title,amount,type,status,due_date,unit,resident_id,category,boleto_id) VALUES($1,$2,'receita','pendente',$3,$4,$5,'reserva',$6)",[`Taxa de reserva - ${area.name}`,fee,reservedFor,resident.unit,resident.id,boleto.id]);
      reservation={...reservation,boleto_id:boleto.id,digitable_line:boleto.digitable_line,payment_link:boleto.payment_link};
    }
    await q('INSERT INTO audit(actor,action,entity) VALUES($1,$2,$3)',[dbUser.email || dbUser.name,'criou reserva',area.name]).catch(()=>null);
    if(resident.email) await sendEmail({to:resident.email,subject:'Reserva recebida - Vitória Régia',text:`Sua solicitação para ${area.name} em ${localDate(`${reservedFor}T12:00:00`)} foi registrada com status ${status}.`});
    return res.status(201).json({...reservation,google_calendar_url:''});
  } catch(error) {
    return res.status(error.status || 500).json({error:error.message || 'Não foi possível criar a reserva.'});
  }
}

async function updateInvitationContact(invitation,body={}) {
  const suppliedEmail=normalizeEmail(body.email || '');
  const suppliedWhatsapp=onlyDigits(body.whatsapp_phone || body.phone || '');
  if(invitation.email && suppliedEmail && suppliedEmail!==normalizeEmail(invitation.email)) throw Object.assign(new Error('O e-mail deste convite individual não pode ser alterado.'),{status:403});
  if((invitation.whatsapp_phone || invitation.phone) && suppliedWhatsapp && suppliedWhatsapp!==onlyDigits(invitation.whatsapp_phone || invitation.phone)) throw Object.assign(new Error('O WhatsApp deste convite individual não pode ser alterado.'),{status:403});
  const email=normalizeEmail(invitation.email || suppliedEmail);
  const whatsapp=onlyDigits(invitation.whatsapp_phone || invitation.phone || suppliedWhatsapp);
  const telegram=clean(body.telegram_username || invitation.telegram_username,80);
  const document=clean(body.document || invitation.document,80);
  return (await q('UPDATE reservation_rsvp_invitations SET email=$1,phone=$2,whatsapp_phone=$2,telegram_username=$3,document=$4,updated_at=now() WHERE id=$5 RETURNING *',[email,whatsapp,telegram,document,invitation.id])).rows[0];
}

function installRoutes(app) {
  if(routesInstalled) return;
  routesInstalled=true;
  const router=express.Router();
  router.use(express.json({limit:'3mb'}));

  // Rota antecipada: corrige tokens antigos de morador que chegavam à permissão genérica sem reservations.manage.
  router.post('/reservations',authenticate,handleResidentReservation);

  router.get('/public/rsvp/:token',rateLimit,async(req,res)=>{
    try {
      await ensureSchema();
      const parsed=parseRsvpToken(req.params.token);
      if(parsed.data.t==='campaign'){
        const campaign=await campaignByToken(parsed);
        return res.json({ok:true,type:'campaign',campaign:{mode:campaign.mode,require_verification:campaign.require_verification,auto_approve_verified:campaign.auto_approve_verified,allow_companions:campaign.allow_companions,max_companions:Number(campaign.max_companions || 0)},event:eventView(campaign)});
      }
      const invitation=await invitationByToken(parsed);
      return res.json({ok:true,type:'invite',invitation:await invitationView(req,invitation,{includeQr:invitation.status==='confirmado'}),verification_required:invitation.status==='aguardando_verificacao'});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/public/rsvp/:token/register',rateLimit,async(req,res)=>{
    try {
      await ensureSchema();
      const parsed=parseRsvpToken(req.params.token);
      if(parsed.data.t!=='campaign') throw Object.assign(new Error('Use o link individual deste convite.'),{status:400});
      const campaign=await campaignByToken(parsed);
      if(campaign.mode==='invite_only') throw Object.assign(new Error('Este evento aceita somente links individuais enviados pelo responsável.'),{status:403});
      const total=Number((await q("SELECT COUNT(*) total FROM reservation_rsvp_invitations WHERE campaign_id=$1 AND status NOT IN ('revogado','rejeitado')",[campaign.id])).rows[0]?.total || 0);
      if(total>=Number(campaign.max_submissions || 200)) throw Object.assign(new Error('O limite de confirmações deste evento foi atingido.'),{status:409});
      const reservation={id:campaign.reservation_id,area:campaign.area,unit:campaign.unit,resident:campaign.resident,reserved_for:campaign.reserved_for,start_time:campaign.start_time,end_time:campaign.end_time,status:campaign.reservation_status};
      const invitation=await createInvitation(req,campaign,reservation,null,req.body || {},'public');
      const invite_token=tokenFor('invite',invitation.id,invitation.invite_nonce);
      const invite_url=publicInviteUrl(req,invitation);
      if(['confirmado','aguardando_aprovacao'].includes(invitation.status)) return res.status(201).json({ok:true,status:invitation.status,invite_token,invite_url,invitation:await invitationView(req,invitation)});
      const otp=await sendOtp(req,invitation,req.body?.verification_channel || '');
      return res.status(201).json({ok:true,status:'aguardando_verificacao',invitation_id:invitation.id,invite_token,invite_url,...otp});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/public/rsvp/:token/respond',rateLimit,async(req,res)=>{
    try {
      await ensureSchema();
      const parsed=parseRsvpToken(req.params.token);
      if(parsed.data.t!=='invite') throw Object.assign(new Error('Este link não é um convite individual.'),{status:400});
      let invitation=await invitationByToken(parsed);
      const response=String(req.body?.response || 'confirmar').toLowerCase();
      if(['recusar','declinar'].includes(response)){
        await q("UPDATE reservation_rsvp_invitations SET status='recusado',updated_at=now() WHERE id=$1",[invitation.id]);
        return res.json({ok:true,status:'recusado'});
      }
      invitation=await updateInvitationContact(invitation,req.body || {});
      const campaign=(await q('SELECT * FROM reservation_rsvp_campaigns WHERE id=$1',[invitation.campaign_id])).rows[0];
      if(campaign.allow_companions) await saveCompanions(invitation,campaign,req.body?.companions || []);
      if(!campaign.require_verification){
        await q("UPDATE reservation_rsvp_invitations SET status='confirmado',verified_at=now(),approved_at=now(),updated_at=now() WHERE id=$1",[invitation.id]);
        invitation=await invitationByToken(parsed);
        await ensureInvitationQrs(req,invitation);
        await sendInvitationDelivery(req,invitation,{withQr:true});
        return res.json({ok:true,status:'confirmado',invitation:await invitationView(req,invitation,{includeQr:true})});
      }
      return res.json({ok:true,status:'aguardando_verificacao',...(await sendOtp(req,invitation,req.body?.verification_channel || ''))});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/public/rsvp/:token/verify',rateLimit,async(req,res)=>{
    try {
      await ensureSchema();
      const parsed=parseRsvpToken(req.params.token);
      if(parsed.data.t!=='invite') throw Object.assign(new Error('Confirmação disponível apenas para convite individual.'),{status:400});
      let invitation=await invitationByToken(parsed);
      const code=onlyDigits(req.body?.code);
      if(!code) throw Object.assign(new Error('Informe o código recebido.'),{status:400});
      if(Number(invitation.verification_attempts || 0)>=5) throw Object.assign(new Error('Muitas tentativas inválidas. Solicite um novo código.'),{status:429});
      if(!invitation.verification_expires_at || new Date(invitation.verification_expires_at).getTime()<Date.now()) throw Object.assign(new Error('O código expirou. Solicite um novo.'),{status:410});
      if(hashCode(code)!==invitation.verification_code_hash){
        await q('UPDATE reservation_rsvp_invitations SET verification_attempts=verification_attempts+1 WHERE id=$1',[invitation.id]);
        throw Object.assign(new Error('Código incorreto.'),{status:400});
      }
      const status=invitation.source_type==='organizer' || invitation.auto_approve_verified===true ? 'confirmado' : 'aguardando_aprovacao';
      await q("UPDATE reservation_rsvp_invitations SET status=$1,verified_at=now(),approved_at=CASE WHEN $1='confirmado' THEN now() ELSE approved_at END,verification_code_hash='',updated_at=now() WHERE id=$2",[status,invitation.id]);
      invitation=await invitationByToken(parsed);
      if(status==='confirmado'){
        await ensureInvitationQrs(req,invitation);
        await sendInvitationDelivery(req,invitation,{withQr:true});
      }
      return res.json({ok:true,status,invitation:await invitationView(req,invitation,{includeQr:status==='confirmado'})});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/public/rsvp/:token/resend-code',rateLimit,async(req,res)=>{
    try {
      const parsed=parseRsvpToken(req.params.token);
      if(parsed.data.t!=='invite') throw Object.assign(new Error('Link inválido.'),{status:400});
      return res.json(await sendOtp(req,await invitationByToken(parsed),req.body?.verification_channel || ''));
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.use(authenticate);
  router.get('/reservations/:id/rsvp',async(req,res)=>{
    try {
      await ensureSchema();
      const reservation=await reservationForUser(req.params.id,req.vrUser);
      const campaign=await campaignForReservation(reservation.id,true,req.vrUser);
      const invitations=(await q(`SELECT i.*,r.area,r.unit,r.resident,r.reserved_for,r.start_time,r.end_time,r.status reservation_status FROM reservation_rsvp_invitations i JOIN reservations r ON r.id=i.reservation_id WHERE i.reservation_id=$1 ORDER BY i.created_at DESC`,[reservation.id])).rows;
      const guests=[];
      for(const invitation of invitations) guests.push(await invitationView(req,invitation,{includePrivate:true,includeQr:false}));
      return res.json({ok:true,reservation,event:eventView(reservation),campaign:{...campaign,public_url:publicCampaignUrl(req,campaign)},guests});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/reservations/:id/rsvp/campaign',async(req,res)=>{
    try {
      await ensureSchema();
      const reservation=await reservationForUser(req.params.id,req.vrUser);
      let campaign=await campaignForReservation(reservation.id,true,req.vrUser);
      const patch={
        mode:['open','invite_only'].includes(req.body.mode) ? req.body.mode : campaign.mode,
        require_verification:bool(req.body.require_verification,campaign.require_verification),
        auto_approve_verified:bool(req.body.auto_approve_verified,campaign.auto_approve_verified),
        allow_companions:bool(req.body.allow_companions,campaign.allow_companions),
        max_companions:Math.max(0,Math.min(10,Number(req.body.max_companions ?? campaign.max_companions))),
        companions_count_as_guests:bool(req.body.companions_count_as_guests,campaign.companions_count_as_guests),
        max_submissions:Math.max(1,Math.min(1000,Number(req.body.max_submissions ?? campaign.max_submissions))),
        enabled:bool(req.body.enabled,campaign.enabled)
      };
      campaign=(await q(`UPDATE reservation_rsvp_campaigns SET mode=$1,require_verification=$2,auto_approve_verified=$3,allow_companions=$4,max_companions=$5,companions_count_as_guests=$6,max_submissions=$7,enabled=$8,updated_at=now() WHERE id=$9 RETURNING *`,[patch.mode,patch.require_verification,patch.auto_approve_verified,patch.allow_companions,patch.max_companions,patch.companions_count_as_guests,patch.max_submissions,patch.enabled,campaign.id])).rows[0];
      if(req.body.regenerate_link) campaign=(await q('UPDATE reservation_rsvp_campaigns SET public_nonce=$1,updated_at=now() WHERE id=$2 RETURNING *',[randomNonce(),campaign.id])).rows[0];
      return res.json({ok:true,campaign:{...campaign,public_url:publicCampaignUrl(req,campaign)}});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/reservations/:id/rsvp/invitations',async(req,res)=>{
    try {
      await ensureSchema();
      const reservation=await reservationForUser(req.params.id,req.vrUser);
      const campaign=await campaignForReservation(reservation.id,true,req.vrUser);
      const items=Array.isArray(req.body.guests) ? req.body.guests : [req.body];
      const created=[];
      for(const item of items.slice(0,300)){
        const invitation=await createInvitation(req,campaign,reservation,req.vrUser,item,'organizer');
        if(req.body.send!==false) await sendInvitationDelivery(req,invitation);
        created.push(await invitationView(req,invitation,{includePrivate:true}));
      }
      return res.status(201).json({ok:true,created});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/reservations/:id/rsvp/import',upload.single('file'),async(req,res)=>{
    try {
      await ensureSchema();
      const reservation=await reservationForUser(req.params.id,req.vrUser);
      const campaign=await campaignForReservation(reservation.id,true,req.vrUser);
      if(!req.file) throw Object.assign(new Error('Selecione um arquivo CSV, Excel, PDF ou TXT.'),{status:400});
      const rows=(await parseImportFile(req.file)).slice(0,500);
      if(bool(req.body.preview,true)) return res.json({ok:true,preview:true,rows,count:rows.length});
      const created=[];
      for(const row of rows){
        const invitation=await createInvitation(req,campaign,reservation,req.vrUser,row,'organizer');
        if(bool(req.body.send,true)) await sendInvitationDelivery(req,invitation);
        created.push(await invitationView(req,invitation,{includePrivate:true}));
      }
      return res.status(201).json({ok:true,preview:false,created,count:created.length});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  router.post('/reservations/:id/rsvp/guests/:guestId/:action',async(req,res)=>{
    try {
      await ensureSchema();
      const reservation=await reservationForUser(req.params.id,req.vrUser);
      let invitation=(await q(`SELECT i.*,r.area,r.unit,r.resident,r.reserved_for,r.start_time,r.end_time,r.status reservation_status,c.auto_approve_verified FROM reservation_rsvp_invitations i JOIN reservations r ON r.id=i.reservation_id JOIN reservation_rsvp_campaigns c ON c.id=i.campaign_id WHERE i.id=$1 AND i.reservation_id=$2`,[req.params.guestId,reservation.id])).rows[0];
      if(!invitation) throw Object.assign(new Error('Convidado não encontrado.'),{status:404});
      const action=String(req.params.action || '');
      if(action==='approve'){
        await q("UPDATE reservation_rsvp_invitations SET status='confirmado',approved_at=now(),approved_by=$1,updated_at=now() WHERE id=$2",[req.vrUser.id,invitation.id]);
        invitation={...invitation,status:'confirmado'};
        await ensureInvitationQrs(req,invitation);
        await sendInvitationDelivery(req,invitation,{withQr:true});
      } else if(action==='reject'){
        await q("UPDATE reservation_rsvp_invitations SET status='rejeitado',approved_by=$1,updated_at=now() WHERE id=$2",[req.vrUser.id,invitation.id]);
      } else if(action==='revoke'){
        await q("UPDATE reservation_rsvp_invitations SET status='revogado',updated_at=now() WHERE id=$1",[invitation.id]);
        if(invitation.qr_visitor_id) await q("UPDATE visitors SET qr_enabled=false,qr_revoked_at=now(),status='revogado' WHERE id=$1",[invitation.qr_visitor_id]);
        await q("UPDATE visitors SET qr_enabled=false,qr_revoked_at=now(),status='revogado' WHERE id IN (SELECT qr_visitor_id FROM reservation_rsvp_companions WHERE invitation_id=$1 AND qr_visitor_id IS NOT NULL)",[invitation.id]);
      } else if(action==='regenerate'){
        invitation=(await q('UPDATE reservation_rsvp_invitations SET invite_nonce=$1,updated_at=now() WHERE id=$2 RETURNING *',[randomNonce(),invitation.id])).rows[0];
        if(invitation.qr_visitor_id) await q('UPDATE visitors SET qr_nonce=$1,qr_enabled=true,qr_revoked_at=NULL,qr_created_at=now() WHERE id=$2',[randomNonce(18),invitation.qr_visitor_id]);
        await sendInvitationDelivery(req,{...invitation,area:reservation.area,unit:reservation.unit,resident:reservation.resident,reserved_for:reservation.reserved_for,start_time:reservation.start_time,end_time:reservation.end_time});
      } else if(action==='resend'){
        await sendInvitationDelivery(req,invitation,{withQr:invitation.status==='confirmado'});
      } else throw Object.assign(new Error('Ação inválida.'),{status:400});
      const refreshed=(await q(`SELECT i.*,r.area,r.unit,r.resident,r.reserved_for,r.start_time,r.end_time,r.status reservation_status FROM reservation_rsvp_invitations i JOIN reservations r ON r.id=i.reservation_id WHERE i.id=$1`,[invitation.id])).rows[0];
      return res.json({ok:true,guest:await invitationView(req,refreshed,{includePrivate:true,includeQr:false})});
    } catch(error) { return res.status(error.status || 400).json({error:error.message}); }
  });

  const originalUse=installRoutes.originalUse || express.application.use;
  originalUse.call(app,'/api',router);
  setTimeout(()=>void ensureSchema(),3500).unref?.();
  console.log('[reservation-rsvp] Formulários públicos, convidados e QR seguros carregados.');
}

const originalUse=express.application.use;
installRoutes.originalUse=originalUse;
express.application.use=function patchedUse(...args){ if(!routesInstalled) installRoutes(this); return originalUse.apply(this,args); };
