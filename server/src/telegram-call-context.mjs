import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const external = (() => { try { return !['localhost','127.0.0.1','::1'].includes(new URL(DATABASE_URL).hostname); } catch { return true; } })();
const pool = new Pool({ connectionString:DATABASE_URL, ssl:external?{rejectUnauthorized:false}:false, max:2, idleTimeoutMillis:30000, connectionTimeoutMillis:10000, options:'-c client_encoding=UTF8' });
pool.on('connect', client => void client.query("SET client_encoding TO 'UTF8'").catch(()=>null));

const clean=(value='',max=256)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,' ').replace(/https?:\/\/\S+/gi,' ').replace(/[#*_`>|~]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const first=value=>clean(value,80).replace(/^(sr\.?|sra\.?|senhor|senhora)\s+/i,'').split(/\s+/)[0]||'';
const unit=value=>{const text=clean(value,50);return !text?'':/^(unidade|apartamento|apto\.?|bloco|casa)\b/i.test(text)?text:`unidade ${text}`};
const digits=(value,count=4)=>{const text=String(value||'').replace(/\D/g,'');return text?text.slice(-count):''};
const pick=(row,keys)=>{for(const key of keys){const value=row?.[key];if(value!==undefined&&value!==null&&String(value).trim())return value}return ''};
const add=(parts,value)=>{const text=clean(value,180);if(text)parts.push(text)};
const fit=(parts,max)=>{const out=[];let used=0;for(const raw of parts){const sentence=/[.!?]$/.test(raw)?raw:`${raw}.`;if(used+sentence.length+(out.length?1:0)<=max){out.push(sentence);used+=sentence.length+(out.length>1?1:0);continue}const remain=max-used-(out.length?1:0);if(remain>=22){const clipped=sentence.slice(0,remain).replace(/\s+\S*$/,'').replace(/[,:;\s]+$/,'');if(clipped.length>16)out.push(`${clipped}.`)}break}return clean(out.join(' '),max)};
const field=(text,labels)=>{for(const label of labels){const match=String(text||'').match(new RegExp(`${label}\\s*[:\\-]\\s*([^|\\n.;]{2,90})`,'i'));if(match?.[1])return clean(match[1],90)}return ''};
const floor=value=>{const text=clean(value,45);return !text?'':/andar|pavimento|t[eé]rreo|garagem|subsolo|cobertura/i.test(text)?text:`${text}º andar`};
const time=value=>{const date=value?new Date(value):null;if(!date||Number.isNaN(date.getTime()))return '';try{return new Intl.DateTimeFormat('pt-BR',{timeZone:process.env.TZ||'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(date)}catch{return ''}};

function typeOf(text=''){
  const value=clean(text,1200).toLowerCase();
  if(/emerg[eê]ncia|inc[eê]ndio|vazamento|p[aâ]nico|socorro|alarme|risco/.test(value))return 'emergency';
  if(/visitante|convidad[oa]|aguardando.*portaria/.test(value))return 'visitor';
  if(/interfone|portaria.*falar|tentando falar/.test(value))return 'intercom';
  if(/encomenda|pacote|correios|mercado livre|amazon|entrega/.test(value)&&/urgente|medicamento|perec[ií]vel|refrigerad/.test(value))return 'urgent_package';
  if(/encomenda|pacote|correios|mercado livre|amazon|entrega/.test(value))return 'package';
  return 'notice';
}
async function target(username){
  const name=String(username||'').replace(/^@/,'').toLowerCase();if(!name)return {};
  const users=await pool.query(`SELECT u.resident_id,COALESCE(u.name,r.name) name,COALESCE(NULLIF(u.unit,''),r.unit) unit FROM users u LEFT JOIN residents r ON r.id=u.resident_id WHERE lower(replace(COALESCE(NULLIF(u.telegram_username,''),r.telegram_username,''),'@',''))=$1 AND COALESCE(u.active,true)=true ORDER BY u.id DESC LIMIT 1`,[name]);
  if(users.rows[0])return users.rows[0];
  return (await pool.query(`SELECT id resident_id,name,unit FROM residents WHERE lower(replace(coalesce(telegram_username,''),'@',''))=$1 AND COALESCE(active,true)=true ORDER BY id DESC LIMIT 1`,[name])).rows[0]||{};
}
async function latestPackage(person){
  const residentId=Number(person.resident_id||0)||null;const normalized=String(person.unit||'').replace(/\s+/g,'').toUpperCase();if(!residentId&&!normalized)return {};
  try{return (await pool.query(`SELECT to_jsonb(p) data FROM packages p WHERE p.deleted_at IS NULL AND (($1::int IS NOT NULL AND p.resident_id=$1) OR ($2<>'' AND upper(replace(coalesce(p.unit,''),' ',''))=$2)) ORDER BY p.id DESC LIMIT 1`,[residentId,normalized])).rows[0]?.data||{}}catch{return {}}
}
async function latestVisitor(person){
  const normalized=String(person.unit||'').replace(/\s+/g,'').toUpperCase();if(!normalized)return {};
  try{return (await pool.query(`SELECT to_jsonb(v) data FROM visitors v WHERE v.deleted_at IS NULL AND upper(replace(coalesce(v.unit,''),' ',''))=$1 ORDER BY v.id DESC LIMIT 1`,[normalized])).rows[0]?.data||{}}catch{return {}}
}
async function latestEmergency(){
  try{return (await pool.query(`SELECT to_jsonb(e) data FROM emergency_requests e WHERE COALESCE(e.status,'pendente')<>'rejeitada' ORDER BY e.id DESC LIMIT 1`)).rows[0]?.data||{}}catch{return {}}
}
function emergency(person,row,original,max){
  const parts=[];add(parts,`Atenção${first(person.name)?`, ${first(person.name)}`:''}`);
  const type=field(original,['tipo','emergência'])||pick(row,['type_label','type','emergency_type','title','type_code'])||'situação de emergência';add(parts,`Emergência identificada: ${type}`);
  const informedFloor=field(original,['andar','pavimento']);const informedLocation=field(original,['local','local exato']);const informedUnit=field(original,['unidade de referência','unidade']);
  const place=[floor(informedFloor||pick(row,['floor','andar','pavimento'])),informedLocation||pick(row,['occurrence_location','location','local','location_type']),unit(informedUnit||pick(row,['neighbor_unit','unit','unidade']))].filter(Boolean).join(', ');if(place)add(parts,`Local: ${place}`);
  add(parts,field(original,['detalhes','orientações'])||pick(row,['details','description','notes','body','decision_note']));const at=time(pick(row,['created_at','approved_at','decided_at']));if(at)add(parts,`Registro às ${at}`);add(parts,'Afaste-se da área de risco e contate a portaria imediatamente');return fit(parts,max);
}
function packageCall(person,row,original,max,urgent){
  const parts=[];add(parts,`${first(person.name)||'Morador'}, a portaria recebeu ${urgent?'uma encomenda urgente':'uma encomenda'}${person.unit?` para a ${unit(person.unit)}`:''}`);
  const sender=field(original,['remetente','loja'])||pick(row,['sender','remetente','merchant','store','seller','origin']);if(sender)add(parts,`Remetente: ${sender}`);
  const carrier=field(original,['transportadora'])||pick(row,['carrier','transportadora','delivery_company','courier']);if(carrier)add(parts,`Transportadora: ${carrier}`);
  const tracking=field(original,['rastreamento','código'])||pick(row,['tracking','tracking_code','code','barcode']);if(tracking)add(parts,`Rastreamento final ${digits(tracking)}`);
  const receiver=field(original,['recebida por','recebedor'])||pick(row,['received_by','received_by_name','porteiro','created_by_name']);if(receiver)add(parts,`Recebida por ${receiver}`);const at=time(pick(row,['received_at','created_at','updated_at']));if(at)add(parts,`Registro às ${at}`);add(parts,urgent?'Abra o Telegram agora para ver as orientações':'Abra o Telegram para confirmar a retirada');return fit(parts,max);
}
function visitor(person,row,original,max){
  const parts=[];const visitorName=field(original,['visitante','convidado'])||pick(row,['name','visitor_name','visitor','convidado'])||'Um visitante';add(parts,`${first(person.name)||'Morador'}, ${visitorName} está aguardando na portaria${person.unit?` para a ${unit(person.unit)}`:''}`);
  const company=field(original,['empresa'])||pick(row,['company','empresa','service_company']);if(company)add(parts,`Empresa: ${company}`);const purpose=field(original,['motivo'])||pick(row,['purpose','reason','motivo','notes','visitor_type']);if(purpose)add(parts,`Motivo: ${purpose}`);
  const document=field(original,['documento'])||pick(row,['document','document_number','documento']);if(document)add(parts,`Documento final ${digits(document)}`);const plate=field(original,['placa'])||pick(row,['plate','vehicle_plate','placa']);if(plate)add(parts,`Veículo placa ${clean(plate,20).toUpperCase()}`);const at=time(pick(row,['arrived_at','checkin_at','created_at']));if(at)add(parts,`Chegada às ${at}`);add(parts,'Abra o Telegram para autorizar ou recusar a entrada');return fit(parts,max);
}
export async function enrichTelegramCallText(username,original,max=256){
  const person=await target(username).catch(()=>({}));const kind=typeOf(original);
  if(kind==='emergency')return emergency(person,await latestEmergency(),original,max);
  if(kind==='visitor')return visitor(person,await latestVisitor(person),original,max);
  if(kind==='urgent_package')return packageCall(person,await latestPackage(person),original,max,true);
  if(kind==='package')return packageCall(person,await latestPackage(person),original,max,false);
  if(kind==='intercom')return fit([`${first(person.name)||'Morador'}, a portaria está tentando falar com você${person.unit?` sobre a ${unit(person.unit)}`:''}`,field(original,['motivo'])||clean(original,130),'Abra o Telegram ou contate a portaria'],max);
  return fit([`${first(person.name)||'Morador'}, você recebeu um aviso do Condomínio Vitória Régia`,field(original,['título'])||clean(original,150),field(original,['detalhes']),'Abra o Telegram para consultar os detalhes'],max);
}
