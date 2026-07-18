import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/vitoriaregia';
const external = (() => { try { return !['localhost','127.0.0.1','::1'].includes(new URL(DATABASE_URL).hostname); } catch { return true; } })();
const pool = new Pool({
  connectionString:DATABASE_URL,
  ssl:external ? { rejectUnauthorized:false } : false,
  max:Number(process.env.VR_CONCIERGE_POOL_MAX || 2),
  idleTimeoutMillis:30000,
  connectionTimeoutMillis:10000,
  options:'-c client_encoding=UTF8'
});
pool.on('connect', client => void client.query("SET client_encoding TO 'UTF8'").catch(()=>null));

const clean=(value='',max=1000)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const normalize=value=>clean(value,2000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const first=value=>clean(value,80).replace(/^(sr\.?|sra\.?|senhor|senhora)\s+/i,'').split(/\s+/)[0]||'Morador';
const unitKey=value=>String(value||'').replace(/\s+/g,'').toUpperCase();
const dateBR=value=>{if(!value)return '';const d=new Date(String(value).length===10?`${value}T12:00:00`:value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('pt-BR',{timeZone:process.env.TZ||'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)};
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const status=value=>clean(value||'pendente',40).replace(/_/g,' ');
const limit=()=>Math.min(8,Math.max(3,Number(process.env.VR_TELEGRAM_CONCIERGE_MAX_ITEMS||5)));

export async function setting(key,fallback=''){
  try{return (await pool.query('SELECT value FROM settings WHERE key=$1 LIMIT 1',[key])).rows[0]?.value ?? fallback}catch{return fallback}
}

export async function ensureConciergeSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS telegram_concierge_logs(
    id BIGSERIAL PRIMARY KEY,
    update_id TEXT UNIQUE,
    chat_id TEXT,
    user_id INTEGER,
    resident_id INTEGER,
    input_kind TEXT DEFAULT 'text',
    input_text TEXT,
    intent TEXT,
    response_text TEXT,
    response_mode TEXT DEFAULT 'text',
    status TEXT DEFAULT 'respondido',
    created_at TIMESTAMP DEFAULT now()
  )`).catch(()=>null);
}

export async function logConcierge(entry={}){
  await ensureConciergeSchema();
  return pool.query(`INSERT INTO telegram_concierge_logs(update_id,chat_id,user_id,resident_id,input_kind,input_text,intent,response_text,response_mode,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(update_id) DO NOTHING`,[
      String(entry.updateId||''),String(entry.chatId||''),entry.person?.user_id||null,entry.person?.resident_id||null,
      entry.inputKind||'text',clean(entry.inputText,3000),entry.intent||'',clean(entry.responseText,4000),entry.responseMode||'text',entry.status||'respondido'
    ]).catch(()=>null);
}

export async function resolveResident(chatId=''){
  const chat=String(chatId||'').trim();
  if(!chat)return null;
  const user=(await pool.query(`SELECT u.id user_id,u.resident_id,COALESCE(NULLIF(u.name,''),r.name) name,
      COALESCE(NULLIF(u.unit,''),r.unit) unit,u.email,u.role,u.telegram_chat_id
    FROM users u LEFT JOIN residents r ON r.id=u.resident_id
    WHERE (u.telegram_chat_id=$1 OR r.telegram_chat_id=$1) AND COALESCE(u.active,true)=true
    ORDER BY CASE WHEN u.telegram_chat_id=$1 THEN 0 ELSE 1 END,u.id DESC LIMIT 1`,[chat]).catch(()=>({rows:[]}))).rows[0];
  if(user)return user;
  return (await pool.query(`SELECT NULL::integer user_id,id resident_id,name,unit,email,'morador' role,telegram_chat_id
    FROM residents WHERE telegram_chat_id=$1 AND COALESCE(active,true)=true ORDER BY id DESC LIMIT 1`,[chat]).catch(()=>({rows:[]}))).rows[0]||null;
}

export function detectIntent(text=''){
  const value=normalize(text).replace(/^\/(menu|start|ajuda|help|pendencias|resumo|encomendas|reservas|financeiro|comunicados|ocorrencias|visitantes)(?:@\w+)?\b\s*/,'$1 ');
  if(/\b(encomenda|encomendas|pacote|pacotes|entrega|entregas)\b/.test(value))return 'packages';
  if(/\b(reserva|reservas|salao|churrasqueira|area comum|agenda)\b/.test(value))return 'reservations';
  if(/\b(boleto|boletos|financeiro|pagamento|pagamentos|cobranca|taxa|vencimento)\b/.test(value))return 'finance';
  if(/\b(comunicado|comunicados|aviso|avisos|noticia|noticias)\b/.test(value))return 'notices';
  if(/\b(ocorrencia|ocorrencias|chamado|chamados|solicitacao|solicitacoes|mensagem|mensagens)\b/.test(value))return 'occurrences';
  if(/\b(visitante|visitantes|convidado|convidados|visita|visitas)\b/.test(value))return 'visitors';
  if(/\b(pendencia|pendencias|resumo|situacao|status|tudo|meu dia|o que tenho|tem algo)\b/.test(value))return 'summary';
  if(/\b(menu|ajuda|help|opcoes|comandos|bom dia|boa tarde|boa noite|ola|oi)\b/.test(value))return 'menu';
  return 'unknown';
}

async function packages(person){
  return (await pool.query(`SELECT id,tracking,recipient,unit,status,carrier,created_at,delivery_preference
    FROM packages WHERE (($1::int IS NOT NULL AND resident_id=$1) OR ($2<>'' AND upper(replace(coalesce(unit,''),' ',''))=$2))
      AND lower(coalesce(status,'pendente')) !~ '(entregue|retirad|finaliz|removid|cancel)'
    ORDER BY created_at DESC LIMIT $3`,[person.resident_id||null,unitKey(person.unit),limit()]).catch(()=>({rows:[]}))).rows;
}
async function reservations(person){
  return (await pool.query(`SELECT id,area,reserved_for,start_time,end_time,status,fee_amount
    FROM reservations WHERE (($1::int IS NOT NULL AND resident_id=$1) OR ($2<>'' AND upper(replace(coalesce(unit,''),' ',''))=$2) OR ($3::int IS NOT NULL AND created_by=$3))
      AND reserved_for>=CURRENT_DATE AND lower(coalesce(status,'')) !~ '(cancel|remov)'
    ORDER BY reserved_for,start_time LIMIT $4`,[person.resident_id||null,unitKey(person.unit),person.user_id||null,limit()]).catch(()=>({rows:[]}))).rows;
}
async function financial(person){
  const boletos=(await pool.query(`SELECT id,title,amount,due_date,status FROM boletos
    WHERE (($1::int IS NOT NULL AND resident_id=$1) OR ($2<>'' AND upper(replace(coalesce(unit,''),' ',''))=$2))
      AND lower(coalesce(status,'pendente')) !~ '(pago|quitad|cancel|remov)'
    ORDER BY due_date NULLS LAST LIMIT $3`,[person.resident_id||null,unitKey(person.unit),limit()]).catch(()=>({rows:[]}))).rows;
  const finance=(await pool.query(`SELECT id,title,amount,due_date,status FROM finance
    WHERE (($1::int IS NOT NULL AND resident_id=$1) OR ($2<>'' AND upper(replace(coalesce(unit,''),' ',''))=$2))
      AND lower(coalesce(status,'pendente')) !~ '(pago|quitad|cancel|remov)'
    ORDER BY due_date NULLS LAST LIMIT $3`,[person.resident_id||null,unitKey(person.unit),limit()]).catch(()=>({rows:[]}))).rows;
  return [...boletos,...finance].sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).slice(0,limit());
}
async function notices(){
  return (await pool.query(`SELECT id,title,body,priority,created_at FROM notices
    WHERE (display_from IS NULL OR display_from<=now()) AND (expires_at IS NULL OR expires_at>=now())
      AND lower(coalesce(target_role,'todos')) IN ('todos','morador','residentes')
    ORDER BY CASE WHEN lower(priority) IN ('critica','alta','urgente') THEN 0 ELSE 1 END,created_at DESC LIMIT $1`,[limit()]).catch(()=>({rows:[]}))).rows;
}
async function occurrences(person){
  const book=(await pool.query(`SELECT id,title,status,priority,created_at FROM occurrence_book
    WHERE (($1::int IS NOT NULL AND created_by=$1) OR ($2<>'' AND upper(replace(coalesce(unit,''),' ',''))=$2))
      AND lower(coalesce(status,'aberta')) !~ '(fech|conclu|resolvid|cancel)'
    ORDER BY created_at DESC LIMIT $3`,[person.user_id||null,unitKey(person.unit),limit()]).catch(()=>({rows:[]}))).rows;
  const messages=(await pool.query(`SELECT id,subject title,status,created_at,'normal' priority FROM messages
    WHERE (($1::int IS NOT NULL AND user_id=$1) OR ($2::int IS NOT NULL AND resident_id=$2) OR ($3<>'' AND upper(replace(coalesce(unit,''),' ',''))=$3))
      AND lower(coalesce(status,'nova')) !~ '(respond|fech|conclu|resolvid|cancel)'
    ORDER BY created_at DESC LIMIT $4`,[person.user_id||null,person.resident_id||null,unitKey(person.unit),limit()]).catch(()=>({rows:[]}))).rows;
  return [...book,...messages].slice(0,limit());
}
async function visitors(person){
  return (await pool.query(`SELECT id,name,status,plate,valid_from,valid_until,notes FROM visitors
    WHERE $1<>'' AND upper(replace(coalesce(unit,''),' ',''))=$1
      AND COALESCE(valid_until,valid_from,CURRENT_DATE)>=CURRENT_DATE
      AND lower(coalesce(status,'')) !~ '(negad|cancel|remov)'
    ORDER BY COALESCE(valid_from,created_at::date),id DESC LIMIT $2`,[unitKey(person.unit),limit()]).catch(()=>({rows:[]}))).rows;
}

const keyboard={inline_keyboard:[
  [{text:'📋 Minhas pendências',callback_data:'concierge:summary'},{text:'📦 Encomendas',callback_data:'concierge:packages'}],
  [{text:'📅 Reservas',callback_data:'concierge:reservations'},{text:'💳 Financeiro',callback_data:'concierge:finance'}],
  [{text:'📣 Comunicados',callback_data:'concierge:notices'},{text:'📘 Ocorrências',callback_data:'concierge:occurrences'}]
]};
const empty=(title,note)=>`${title}\n\n${note}`;

export async function conciergeReply(person,intent='menu'){
  const name=first(person?.name);
  if(intent==='menu'||intent==='unknown'){
    const text=`Olá, ${name}. Eu sou o concierge do Condomínio Vitória Régia.\n\nPosso consultar suas pendências, encomendas, reservas, boletos, comunicados, ocorrências e visitantes autorizados. Escolha uma opção ou escreva sua pergunta normalmente.`;
    const spoken=`Olá, ${name}. Sou o concierge do Condomínio Vitória Régia. Posso informar suas pendências, encomendas, reservas, financeiro, comunicados e ocorrências.`;
    return {intent:'menu',text,spoken,keyboard};
  }
  if(intent==='packages'){
    const rows=await packages(person);
    if(!rows.length)return {intent,text:empty('📦 Encomendas','Você não possui encomendas pendentes no momento.'),spoken:`${name}, você não possui encomendas pendentes.`,keyboard};
    const lines=rows.map((r,i)=>`${i+1}. ${r.carrier||r.recipient||'Encomenda'}${r.tracking?` · ${r.tracking}`:''}\n   Recebida em ${dateBR(r.created_at)} · ${status(r.status)}${r.delivery_preference&&r.delivery_preference!=='nao_informado'?` · ${status(r.delivery_preference)}`:''}`);
    return {intent,text:`📦 Suas encomendas pendentes: ${rows.length}\n\n${lines.join('\n\n')}`,spoken:`${name}, você possui ${rows.length} encomenda${rows.length===1?'':'s'} pendente${rows.length===1?'':'s'}. ${rows.slice(0,3).map(r=>r.carrier||r.recipient||'Encomenda').join(', ')}.`,keyboard};
  }
  if(intent==='reservations'){
    const rows=await reservations(person);
    if(!rows.length)return {intent,text:empty('📅 Reservas','Você não possui reservas futuras registradas.'),spoken:`${name}, você não possui reservas futuras registradas.`,keyboard};
    const lines=rows.map((r,i)=>`${i+1}. ${r.area||'Área comum'} · ${dateBR(r.reserved_for)}\n   ${r.start_time||''}${r.end_time?` às ${r.end_time}`:''} · ${status(r.status)}${Number(r.fee_amount)>0?` · ${money(r.fee_amount)}`:''}`);
    return {intent,text:`📅 Suas próximas reservas: ${rows.length}\n\n${lines.join('\n\n')}`,spoken:`${name}, você possui ${rows.length} reserva${rows.length===1?'':'s'} futura${rows.length===1?'':'s'}. A próxima é ${rows[0].area||'em área comum'}, no dia ${dateBR(rows[0].reserved_for)}.`,keyboard};
  }
  if(intent==='finance'){
    const rows=await financial(person);
    if(!rows.length)return {intent,text:empty('💳 Financeiro','Não há pagamentos pendentes localizados para sua unidade.'),spoken:`${name}, não há pagamentos pendentes localizados para sua unidade.`,keyboard};
    const total=rows.reduce((sum,r)=>sum+Number(r.amount||0),0);
    const lines=rows.map((r,i)=>`${i+1}. ${r.title||'Cobrança'} · ${money(r.amount)}\n   Vencimento: ${dateBR(r.due_date)||'não informado'} · ${status(r.status)}`);
    return {intent,text:`💳 Pendências financeiras: ${rows.length}\nTotal localizado: ${money(total)}\n\n${lines.join('\n\n')}`,spoken:`${name}, existem ${rows.length} pendência${rows.length===1?'':'s'} financeira${rows.length===1?'':'s'}, totalizando ${money(total)}.`,keyboard};
  }
  if(intent==='notices'){
    const rows=await notices();
    if(!rows.length)return {intent,text:empty('📣 Comunicados','Não há comunicados ativos no momento.'),spoken:'Não há comunicados ativos no momento.',keyboard};
    const lines=rows.map((r,i)=>`${i+1}. ${r.title||'Comunicado'}${r.priority?` · prioridade ${status(r.priority)}`:''}\n   ${clean(r.body,240)}`);
    return {intent,text:`📣 Comunicados ativos\n\n${lines.join('\n\n')}`,spoken:`${name}, há ${rows.length} comunicado${rows.length===1?'':'s'} ativo${rows.length===1?'':'s'}. ${rows.slice(0,2).map(r=>r.title).join('. ')}.`,keyboard};
  }
  if(intent==='occurrences'){
    const rows=await occurrences(person);
    if(!rows.length)return {intent,text:empty('📘 Ocorrências e solicitações','Você não possui ocorrências ou mensagens pendentes.'),spoken:`${name}, você não possui ocorrências ou solicitações pendentes.`,keyboard};
    const lines=rows.map((r,i)=>`${i+1}. ${r.title||'Solicitação'}\n   ${status(r.status)} · ${dateBR(r.created_at)}`);
    return {intent,text:`📘 Suas ocorrências e solicitações pendentes: ${rows.length}\n\n${lines.join('\n\n')}`,spoken:`${name}, você possui ${rows.length} ocorrência${rows.length===1?'':'s'} ou solicitação${rows.length===1?'':'s'} pendente${rows.length===1?'':'s'}.`,keyboard};
  }
  if(intent==='visitors'){
    const rows=await visitors(person);
    if(!rows.length)return {intent,text:empty('👤 Visitantes','Não há visitantes válidos ou futuros cadastrados para sua unidade.'),spoken:`${name}, não há visitantes válidos ou futuros cadastrados.`,keyboard};
    const lines=rows.map((r,i)=>`${i+1}. ${r.name||'Visitante'}${r.plate?` · placa ${r.plate}`:''}\n   Validade: ${dateBR(r.valid_from)||'hoje'} até ${dateBR(r.valid_until)||dateBR(r.valid_from)||'hoje'} · ${status(r.status)}`);
    return {intent,text:`👤 Visitantes vinculados à sua unidade: ${rows.length}\n\n${lines.join('\n\n')}`,spoken:`${name}, existem ${rows.length} visitante${rows.length===1?'':'s'} válido${rows.length===1?'':'s'} ou futuro${rows.length===1?'':'s'} para sua unidade.`,keyboard};
  }
  const [p,r,f,o,n,v]=await Promise.all([packages(person),reservations(person),financial(person),occurrences(person),notices(),visitors(person)]);
  const total=p.length+f.length+o.length;
  const text=`📋 Resumo de ${name}${person.unit?` · unidade ${person.unit}`:''}\n\n• Encomendas pendentes: ${p.length}\n• Reservas futuras: ${r.length}\n• Pendências financeiras: ${f.length}\n• Ocorrências ou solicitações abertas: ${o.length}\n• Comunicados ativos: ${n.length}\n• Visitantes válidos ou futuros: ${v.length}\n\n${total?'Há itens que merecem sua atenção. Use os botões abaixo para ver os detalhes.':'Nenhuma pendência crítica foi localizada agora.'}`;
  const spoken=`${name}, seu resumo tem ${p.length} encomenda${p.length===1?'':'s'} pendente${p.length===1?'':'s'}, ${r.length} reserva${r.length===1?'':'s'} futura${r.length===1?'':'s'}, ${f.length} pendência${f.length===1?'':'s'} financeira${f.length===1?'':'s'} e ${o.length} ocorrência${o.length===1?'':'s'} aberta${o.length===1?'':'s'}.`;
  return {intent:'summary',text,spoken,keyboard};
}
