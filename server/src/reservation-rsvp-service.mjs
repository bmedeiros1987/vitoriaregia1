import QRCode from 'qrcode';
import XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import {
  q, clean, onlyDigits, normalizeEmail, normalizeUnit, list, randomNonce, randomCode, hashCode,
  tokenFor, parseToken, publicBase, isAdmin, requestIpHash,
  sendEmail, sendWhatsApp, sendTelegram, resolveTelegramChat
} from './reservation-rsvp-lib.mjs';

export function eventView(row={}) {
  return {
    reservation_id:Number(row.reservation_id || row.id), area:row.area || 'Área comum', unit:row.unit || '', host:row.resident || '',
    date:String(row.reserved_for || '').slice(0,10), start_time:row.start_time || '', end_time:row.end_time || '',
    status:row.reservation_status || row.status || ''
  };
}
export function publicCampaignUrl(req,campaign) { return `${publicBase(req)}/?rsvp=${encodeURIComponent(tokenFor('campaign',campaign.id,campaign.public_nonce))}`; }
export function publicInviteUrl(req,invitation) { return `${publicBase(req)}/?rsvp=${encodeURIComponent(tokenFor('invite',invitation.id,invitation.invite_nonce))}`; }

export async function reservationForUser(id,user) {
  const reservation=(await q('SELECT * FROM reservations WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
  if(!reservation) throw Object.assign(new Error('Reserva não encontrada.'),{status:404});
  const own=Number(reservation.created_by || 0)===Number(user?.id || 0)
    || (user?.resident_id && Number(reservation.resident_id || 0)===Number(user.resident_id))
    || (user?.unit && normalizeUnit(reservation.unit)===normalizeUnit(user.unit));
  if(!isAdmin(user) && !own) throw Object.assign(new Error('Esta reserva não pertence ao seu usuário.'),{status:403});
  return reservation;
}

export async function campaignForReservation(reservationId,create=false,user=null) {
  let campaign=(await q('SELECT * FROM reservation_rsvp_campaigns WHERE reservation_id=$1',[reservationId])).rows[0];
  if(!campaign && create){
    const reservation=(await q('SELECT reserved_for FROM reservations WHERE id=$1',[reservationId])).rows[0];
    const expires=reservation?.reserved_for ? `${String(reservation.reserved_for).slice(0,10)}T23:59:59` : null;
    campaign=(await q(`INSERT INTO reservation_rsvp_campaigns(reservation_id,public_nonce,expires_at,created_by) VALUES($1,$2,$3,$4) RETURNING *`,[reservationId,randomNonce(),expires,user?.id || null])).rows[0];
  }
  return campaign;
}

export async function campaignByToken(parsed) {
  const campaign=(await q(`SELECT c.*,r.area,r.unit,r.resident,r.reserved_for,r.start_time,r.end_time,r.status reservation_status,ca.max_guests
    FROM reservation_rsvp_campaigns c JOIN reservations r ON r.id=c.reservation_id LEFT JOIN common_areas ca ON ca.id=r.area_id WHERE c.id=$1`,[parsed.data.id])).rows[0];
  if(!campaign || campaign.public_nonce!==parsed.data.n) throw Object.assign(new Error('Este formulário foi substituído ou revogado.'),{status:404});
  if(campaign.enabled===false) throw Object.assign(new Error('As confirmações deste evento foram encerradas.'),{status:410});
  if(campaign.expires_at && new Date(campaign.expires_at).getTime()<Date.now()) throw Object.assign(new Error('O prazo deste formulário terminou.'),{status:410});
  return campaign;
}

export async function invitationByToken(parsed) {
  const invitation=(await q(`SELECT i.*,c.enabled,c.mode,c.require_verification,c.auto_approve_verified,c.allow_companions,c.max_companions,c.companions_count_as_guests,c.expires_at,
    r.area,r.unit,r.resident,r.reserved_for,r.start_time,r.end_time,r.status reservation_status
    FROM reservation_rsvp_invitations i JOIN reservation_rsvp_campaigns c ON c.id=i.campaign_id JOIN reservations r ON r.id=i.reservation_id WHERE i.id=$1`,[parsed.data.id])).rows[0];
  if(!invitation || invitation.invite_nonce!==parsed.data.n) throw Object.assign(new Error('Este convite foi substituído ou não existe.'),{status:404});
  if(invitation.enabled===false || ['revogado','rejeitado'].includes(invitation.status)) throw Object.assign(new Error('Este convite foi revogado.'),{status:410});
  if(invitation.expires_at && new Date(invitation.expires_at).getTime()<Date.now()) throw Object.assign(new Error('Este convite expirou.'),{status:410});
  return invitation;
}

async function visitorPass(req,visitor) {
  const { createHmac } = await import('node:crypto');
  const secret=process.env.JWT_SECRET || process.env.RESERVATION_RSVP_SECRET || '';
  const payload=Buffer.from(JSON.stringify({v:1,id:Number(visitor.id),n:visitor.qr_nonce})).toString('base64url');
  const signature=createHmac('sha256',secret).update(payload).digest('base64url');
  const token=`${payload}.${signature}`;
  const url=`${publicBase(req)}/?visitor_invite=${encodeURIComponent(token)}#/portaria/visitantes`;
  const qr_svg=await QRCode.toString(url,{type:'svg',width:340,margin:2,errorCorrectionLevel:'M',color:{dark:'#073b34',light:'#ffffff'}});
  return {name:visitor.name,url,qr_svg,visitor_id:visitor.id};
}

export async function ensureInvitationQrs(req,invitation) {
  const date=String(invitation.reserved_for || '').slice(0,10);
  const start=invitation.start_time || '00:00';
  const end=invitation.end_time || '23:59';
  let visitor=invitation.qr_visitor_id ? (await q('SELECT * FROM visitors WHERE id=$1',[invitation.qr_visitor_id])).rows[0] : null;
  if(!visitor){
    visitor=(await q(`INSERT INTO visitors(name,document,unit,authorized_by,status,plate,phone,recurring,weekdays,valid_from,valid_until,announce_required,announcement_channel,notification_channels,reservation_id,notes,access_dates,access_start_time,access_end_time,qr_nonce,qr_enabled,qr_created_at,max_entries)
      VALUES($1,$2,$3,$4,'autorizado','',$5,false,'[]'::jsonb,$6,$6,true,'app',$7,$8,$9,$10,$11,$12,$13,true,now(),1) RETURNING *`,[
      invitation.name,invitation.document || '',invitation.unit,invitation.resident,invitation.whatsapp_phone || invitation.phone || '',date,
      JSON.stringify({email:true,telegram:true,whatsapp:true}),invitation.reservation_id,`RSVP seguro #${invitation.id}`,JSON.stringify([date]),start,end,randomNonce(18)
    ])).rows[0];
    await q('UPDATE reservation_rsvp_invitations SET qr_visitor_id=$1,updated_at=now() WHERE id=$2',[visitor.id,invitation.id]);
  }
  const passes=[await visitorPass(req,visitor)];
  const companions=(await q("SELECT * FROM reservation_rsvp_companions WHERE invitation_id=$1 AND status<>'removido' ORDER BY id",[invitation.id])).rows;
  for(const companion of companions){
    let companionVisitor=companion.qr_visitor_id ? (await q('SELECT * FROM visitors WHERE id=$1',[companion.qr_visitor_id])).rows[0] : null;
    if(!companionVisitor){
      companionVisitor=(await q(`INSERT INTO visitors(name,document,unit,authorized_by,status,plate,phone,recurring,weekdays,valid_from,valid_until,announce_required,announcement_channel,notification_channels,reservation_id,notes,access_dates,access_start_time,access_end_time,qr_nonce,qr_enabled,qr_created_at,max_entries)
        VALUES($1,'',$2,$3,'autorizado','',$4,false,'[]'::jsonb,$5,$5,true,'app',$6,$7,$8,$9,$10,$11,$12,true,now(),1) RETURNING *`,[
        companion.name,invitation.unit,invitation.resident,companion.phone || '',date,JSON.stringify({email:true,telegram:true,whatsapp:true}),invitation.reservation_id,
        `Agregado do RSVP #${invitation.id}`,JSON.stringify([date]),start,end,randomNonce(18)
      ])).rows[0];
      await q('UPDATE reservation_rsvp_companions SET qr_visitor_id=$1,updated_at=now() WHERE id=$2',[companionVisitor.id,companion.id]);
    }
    passes.push(await visitorPass(req,companionVisitor));
  }
  return passes;
}

export async function invitationView(req,invitation,{includePrivate=false,includeQr=false}={}) {
  const companions=(await q('SELECT id,name,email,phone,age_group,counts_as_guest,status,qr_visitor_id FROM reservation_rsvp_companions WHERE invitation_id=$1 ORDER BY id',[invitation.id])).rows;
  const base={id:Number(invitation.id),name:invitation.name,status:invitation.status,source_type:invitation.source_type,verified_at:invitation.verified_at,approved_at:invitation.approved_at,counts_as_guest:invitation.counts_as_guest,companions,event:eventView(invitation)};
  if(includePrivate) Object.assign(base,{email:invitation.email,phone:invitation.phone,whatsapp_phone:invitation.whatsapp_phone,telegram_username:invitation.telegram_username,document:invitation.document,url:publicInviteUrl(req,invitation),notification_attempts:Number(invitation.notification_attempts || 0),last_notified_at:invitation.last_notified_at});
  if(includeQr && invitation.status==='confirmado') base.passes=await ensureInvitationQrs(req,invitation);
  return base;
}

export async function saveCompanions(invitation,campaign,companions=[]) {
  const max=Math.max(0,Math.min(10,Number(campaign.max_companions || 0)));
  const normalized=list(companions).slice(0,max).map(item=>({
    name:clean(item?.name || item,180), email:normalizeEmail(item?.email || ''), phone:onlyDigits(item?.phone || item?.whatsapp_phone || ''),
    age_group:['adulto','crianca','bebe'].includes(String(item?.age_group || '')) ? item.age_group : 'adulto',
    counts_as_guest:item?.counts_as_guest!==false && campaign.companions_count_as_guests!==false
  })).filter(item=>item.name);
  await q('DELETE FROM reservation_rsvp_companions WHERE invitation_id=$1',[invitation.id]);
  for(const item of normalized) await q("INSERT INTO reservation_rsvp_companions(invitation_id,name,email,phone,age_group,counts_as_guest,status) VALUES($1,$2,$3,$4,$5,$6,'confirmado')",[invitation.id,item.name,item.email,item.phone,item.age_group,item.counts_as_guest]);
  return normalized;
}

export async function sendOtp(req,invitation,channel='') {
  const code=randomCode(6);
  const expires=new Date(Date.now()+15*60*1000);
  const selected=channel || (invitation.email ? 'email' : (invitation.whatsapp_phone || invitation.phone) ? 'whatsapp' : '');
  if(!selected) throw Object.assign(new Error('Informe um e-mail ou WhatsApp para confirmar sua identidade.'),{status:400});
  const message=`Código de confirmação Vitória Régia: ${code}. Ele expira em 15 minutos. Não encaminhe este código.`;
  const result=selected==='email'
    ? await sendEmail({to:invitation.email,subject:'Código de confirmação do convite',text:message})
    : await sendWhatsApp(invitation.whatsapp_phone || invitation.phone,message);
  if(!result.ok && !result.skipped) throw Object.assign(new Error('Não foi possível enviar o código de confirmação.'),{status:502});
  if(result.skipped) throw Object.assign(new Error(result.reason || 'Canal de confirmação não configurado.'),{status:503});
  await q("UPDATE reservation_rsvp_invitations SET verification_channel=$1,verification_code_hash=$2,verification_expires_at=$3,verification_attempts=0,status='aguardando_verificacao',updated_at=now() WHERE id=$4",[selected,hashCode(code),expires,invitation.id]);
  const masked=selected==='email' ? invitation.email.replace(/(^.).*(@.*$)/,'$1***$2') : `***${onlyDigits(invitation.whatsapp_phone || invitation.phone).slice(-4)}`;
  return {ok:true,verification_required:true,channel:selected,masked};
}

export async function sendInvitationDelivery(req,invitation,{withQr=false}={}) {
  const url=publicInviteUrl(req,invitation);
  const event=eventView(invitation);
  const confirmed=invitation.status==='confirmado';
  const title=confirmed ? 'Seu QR Code de acesso está pronto' : 'Confirme sua presença no evento';
  const text=`${title}\nEvento: ${event.area}\nData: ${event.date} · ${event.start_time} às ${event.end_time}\nResponsável: ${event.host}\nAbra o link seguro: ${url}`;
  const deliveries={};
  if(invitation.email) deliveries.email=await sendEmail({to:invitation.email,subject:`${title} - Vitória Régia`,text,html:`<h2>${title}</h2><p><b>${event.area}</b><br>${event.date} · ${event.start_time} às ${event.end_time}</p><p><a href="${url}">Abrir confirmação e QR Code</a></p><p>Este link é individual. Não encaminhe.</p>`});
  if(invitation.whatsapp_phone || invitation.phone) deliveries.whatsapp=await sendWhatsApp(invitation.whatsapp_phone || invitation.phone,text);
  const chat=await resolveTelegramChat(invitation.telegram_username);
  if(chat) deliveries.telegram=await sendTelegram(chat,text);
  await q('UPDATE reservation_rsvp_invitations SET notification_attempts=notification_attempts+1,last_notified_at=now(),updated_at=now() WHERE id=$1',[invitation.id]);
  return deliveries;
}

async function seatUsage(reservationId) {
  const result=await q(`SELECT
    COALESCE(SUM(CASE WHEN i.counts_as_guest=true THEN 1 ELSE 0 END),0)::int invited,
    COALESCE((SELECT SUM(CASE WHEN c.counts_as_guest=true THEN 1 ELSE 0 END) FROM reservation_rsvp_companions c JOIN reservation_rsvp_invitations ix ON ix.id=c.invitation_id WHERE ix.reservation_id=$1 AND ix.status NOT IN ('recusado','rejeitado','revogado') AND c.status<>'removido'),0)::int companions
    FROM reservation_rsvp_invitations i WHERE i.reservation_id=$1 AND i.status NOT IN ('recusado','rejeitado','revogado')`,[reservationId]);
  return Number(result.rows[0]?.invited || 0)+Number(result.rows[0]?.companions || 0);
}
async function assertCapacity(reservation,campaign,raw={}) {
  const area=(await q('SELECT COALESCE(ca.max_guests,30) max_guests FROM reservations r LEFT JOIN common_areas ca ON ca.id=r.area_id WHERE r.id=$1',[reservation.id])).rows[0];
  const max=Math.max(1,Number(area?.max_guests || campaign?.max_submissions || 200));
  const companions=campaign?.allow_companions===false ? [] : list(raw.companions).slice(0,Math.max(0,Number(campaign?.max_companions || 0)));
  const requested=(raw.counts_as_guest===false ? 0 : 1)+companions.filter(item=>item?.counts_as_guest!==false && campaign?.companions_count_as_guests!==false).length;
  const used=await seatUsage(reservation.id);
  if(used+requested>max) throw Object.assign(new Error(`O limite de ${max} pessoas deste evento seria ultrapassado. Restam ${Math.max(0,max-used)} vaga(s).`),{status:409});
}

export async function createInvitation(req,campaign,reservation,user,raw={},source='organizer') {
  const name=clean(raw.name,180);
  if(!name) throw Object.assign(new Error('Informe o nome do convidado.'),{status:400});
  const email=normalizeEmail(raw.email);
  const whatsapp=onlyDigits(raw.whatsapp_phone || raw.phone);
  const document=clean(raw.document,80);
  const telegram=clean(raw.telegram_username,80);
  const submittedIp=source==='public' ? requestIpHash(req) : '';
  const duplicate=(await q(`SELECT * FROM reservation_rsvp_invitations WHERE reservation_id=$1 AND status NOT IN ('revogado','rejeitado') AND (
    (NULLIF($2,'') IS NOT NULL AND lower(email)=lower($2)) OR
    (NULLIF($3,'') IS NOT NULL AND regexp_replace(coalesce(whatsapp_phone,phone,''),'\\D','','g')=$3) OR
    (NULLIF($4,'') IS NOT NULL AND document=$4) OR
    (lower(name)=lower($5) AND source_type=$6 AND submitted_ip_hash=$7)) LIMIT 1`,[reservation.id,email,whatsapp,document,name,source,submittedIp])).rows[0];
  if(duplicate) return duplicate;
  await assertCapacity(reservation,campaign,raw);
  const status=source==='organizer' ? 'convidado' : (email || whatsapp) ? 'aguardando_verificacao' : 'aguardando_aprovacao';
  const invitation=(await q(`INSERT INTO reservation_rsvp_invitations(campaign_id,reservation_id,invite_nonce,name,email,phone,whatsapp_phone,telegram_username,document,status,source_type,counts_as_guest,submitted_ip_hash,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[
    campaign.id,reservation.id,randomNonce(),name,email,whatsapp,telegram,document,status,source,raw.counts_as_guest!==false,submittedIp,user?.id || null
  ])).rows[0];
  if(campaign.allow_companions && raw.companions) await saveCompanions(invitation,campaign,raw.companions);
  return {...invitation,area:reservation.area,unit:reservation.unit,resident:reservation.resident,reserved_for:reservation.reserved_for,start_time:reservation.start_time,end_time:reservation.end_time,reservation_status:reservation.status};
}

function parseDelimited(text='') {
  const lines=String(text || '').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(!lines.length) return [];
  const delimiter=lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const rows=lines.map(line=>line.split(delimiter).map(cell=>cell.trim()));
  const header=rows[0].map(value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  const hasHeader=header.some(value=>/nome|email|mail|telefone|whatsapp|telegram|documento|cpf|acompanh/.test(value));
  const body=hasHeader ? rows.slice(1) : rows;
  const index=(patterns,fallback)=>{ const found=header.findIndex(value=>patterns.some(pattern=>pattern.test(value))); return found>=0 ? found : fallback; };
  const nameIndex=index([/nome/,/convid/],0), emailIndex=index([/e-?mail/,/email/],1), phoneIndex=index([/whats/,/telefone/,/celular/],2), telegramIndex=index([/telegram/],3), documentIndex=index([/document/,/cpf/,/rg/],4), companionIndex=index([/acompanh/,/agregad/],5);
  return body.map(cells=>({
    name:clean(cells[nameIndex] || '',180), email:normalizeEmail(cells[emailIndex] || ''), whatsapp_phone:onlyDigits(cells[phoneIndex] || ''),
    telegram_username:clean(cells[telegramIndex] || '',80), document:clean(cells[documentIndex] || '',80),
    companions:clean(cells[companionIndex] || '',500).split(/[|+]/).map(name=>({name:clean(name,180)})).filter(item=>item.name)
  })).filter(row=>row.name);
}

export async function parseImportFile(file) {
  const name=String(file?.originalname || '').toLowerCase();
  const mime=String(file?.mimetype || '');
  if(/\.xlsx?$/.test(name) || /spreadsheet|excel/.test(mime)){
    const workbook=XLSX.read(file.buffer,{type:'buffer'});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:''});
    return rows.map(row=>{
      const normalized=Object.fromEntries(Object.entries(row).map(([key,value])=>[key.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),value]));
      const pick=pattern=>Object.entries(normalized).find(([key])=>pattern.test(key))?.[1] || '';
      return {name:clean(pick(/nome|convid/),180),email:normalizeEmail(pick(/e-?mail|email/)),whatsapp_phone:onlyDigits(pick(/whats|telefone|celular/)),telegram_username:clean(pick(/telegram/),80),document:clean(pick(/document|cpf|rg/),80),companions:clean(pick(/acompanh|agregad/),500).split(/[|+]/).map(value=>({name:clean(value,180)})).filter(item=>item.name)};
    }).filter(row=>row.name);
  }
  if(/\.pdf$/.test(name) || mime==='application/pdf'){
    const parsed=await pdfParse(file.buffer);
    return parseDelimited(parsed.text.replace(/\s{3,}/g,';'));
  }
  return parseDelimited(file.buffer.toString('utf8'));
}

export function parseRsvpToken(value) { return parseToken(value); }
