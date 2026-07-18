import { clean,onlyDigits,dateISO,addDays,sha256,q,TENANT_KEY,publicBase,subscription } from './platform-core.mjs';

const apiKey=()=>clean(process.env.ASAAS_API_KEY);
const webhookToken=()=>clean(process.env.ASAAS_WEBHOOK_TOKEN);
const apiBase=()=>clean(process.env.ASAAS_API_URL).replace(/\/$/,'')||(clean(process.env.ASAAS_ENVIRONMENT).toLowerCase()==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3');

async function requestAsaas(path,options={}){
  if(!apiKey())throw Object.assign(new Error('Configure ASAAS_API_KEY da conta que receberá as assinaturas.'),{status:503});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Number(process.env.ASAAS_TIMEOUT_MS||30000));
  try{
    const response=await fetch(`${apiBase()}${path}`,{...options,signal:controller.signal,headers:{accept:'application/json','content-type':'application/json',access_token:apiKey(),...(options.headers||{})}});
    const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{body={raw:text};}
    if(!response.ok){const detail=body?.errors?.map?.(e=>e.description).filter(Boolean).join(' ')||body?.message||`ASAAS respondeu ${response.status}`;throw Object.assign(new Error(detail),{status:502});}
    return body;
  }finally{clearTimeout(timer);}
}

export function asaasConfigView(){return{configured:Boolean(apiKey()),environment:clean(process.env.ASAAS_ENVIRONMENT).toLowerCase()==='production'?'produção':'sandbox',monthly_value:Number(process.env.ASAAS_MONTHLY_VALUE||0),plan_name:process.env.ASAAS_PLAN_NAME||'Vitória Régia One'};}

export async function createCheckout(req,user){
  const row=await subscription();
  if(!row.contract_accepted_at)throw Object.assign(new Error('Aceite o contrato eletrônico antes de iniciar a assinatura.'),{status:409});
  const amount=Number(process.env.ASAAS_MONTHLY_VALUE||0);if(!(amount>0))throw Object.assign(new Error('Configure ASAAS_MONTHLY_VALUE para liberar a contratação.'),{status:503});
  const body=req.body||{},name=clean(body.name||user.name),email=clean(body.email||user.email),cpfCnpj=onlyDigits(body.cpf_cnpj||body.document),phone=onlyDigits(body.phone||user.phone);
  if(!name||!email||cpfCnpj.length<11)throw Object.assign(new Error('Informe nome, e-mail e CPF/CNPJ do contratante.'),{status:400});
  const firstDue=Math.max(new Date(row.trial_ends_at).getTime(),addDays(new Date(),1).getTime()),nextDueDate=dateISO(firstDue),base=publicBase(req),externalReference=`vr-one:${TENANT_KEY}:${row.id}`;
  const payload={billingTypes:['PIX','CREDIT_CARD'],chargeTypes:['RECURRENT'],minutesToExpire:1440,externalReference,callback:{successUrl:`${base}/#/dashboard?assinatura=sucesso`,cancelUrl:`${base}/#/dashboard?assinatura=cancelada`,expiredUrl:`${base}/#/dashboard?assinatura=expirada`},items:[{name:process.env.ASAAS_PLAN_NAME||'Vitória Régia One',description:process.env.ASAAS_PLAN_DESCRIPTION||'Licença mensal do sistema de gestão condominial',quantity:1,value:amount}],customerData:{name,email,cpfCnpj,phone:phone||undefined},subscription:{cycle:'MONTHLY',nextDueDate}};
  const checkout=await requestAsaas('/checkouts',{method:'POST',body:JSON.stringify(payload)}),link=clean(checkout.link||checkout.url||checkout.checkoutUrl);
  if(!link)throw Object.assign(new Error('ASAAS não retornou o link do checkout.'),{status:502});
  await q("UPDATE platform_subscriptions SET status='checkout_created',asaas_checkout_id=$1,asaas_checkout_url=$2,billing_type='PIX,CREDIT_CARD',amount=$3,cycle='MONTHLY',next_due_date=$4,updated_at=now() WHERE tenant_key=$5",[clean(checkout.id),link,amount,nextDueDate,TENANT_KEY]);
  return{ok:true,checkout:{id:checkout.id,url:link,next_due_date:nextDueDate,amount,trial_ends_at:row.trial_ends_at}};
}

function receivedToken(req){return clean(req.headers['asaas-access-token']||req.headers['x-asaas-token']||req.headers.authorization).replace(/^Bearer\s+/i,'');}
export function webhookAuthorized(req){const expected=webhookToken();if(!expected)return true;const received=receivedToken(req);return expected.length===received.length&&expected===received;}

export async function processWebhook(event={}){
  const eventName=clean(event.event||event.type),eventKey=clean(event.id)||sha256(JSON.stringify(event)),reference=clean(event.payment?.externalReference||event.subscription?.externalReference||event.checkout?.externalReference||event.externalReference);
  const inserted=await q('INSERT INTO platform_webhook_events(event_key,event_name,external_reference,payload_hash,processed_status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING RETURNING id',[eventKey,eventName,reference,sha256(JSON.stringify(event)),'received']);
  if(!inserted.rowCount)return{ok:true,duplicate:true};
  let status='';if(/PAYMENT_(RECEIVED|CONFIRMED)|CHECKOUT_PAID|SUBSCRIPTION_CREATED/i.test(eventName))status='active';else if(/OVERDUE|RECEIVABLE_ANTICIPATION_CANCELLED/i.test(eventName))status='past_due';else if(/REFUND|CHARGEBACK/i.test(eventName))status='attention';else if(/SUBSCRIPTION_(DELETED|INACTIVATED)|CHECKOUT_CANCELLED/i.test(eventName))status='cancelled';
  await q("UPDATE platform_subscriptions SET status=COALESCE(NULLIF($1,''),status),asaas_customer_id=COALESCE(NULLIF($2,''),asaas_customer_id),asaas_subscription_id=COALESCE(NULLIF($3,''),asaas_subscription_id),last_payment_status=$4,last_payment_at=CASE WHEN $1='active' THEN now() ELSE last_payment_at END,last_event=$5,last_event_at=now(),updated_at=now() WHERE tenant_key=$6",[status,clean(event.payment?.customer||event.subscription?.customer),clean(event.subscription?.id||event.payment?.subscription),clean(event.payment?.status||event.status||eventName),eventName,TENANT_KEY]);
  await q('UPDATE platform_webhook_events SET processed_status=$1 WHERE event_key=$2',['processed',eventKey]);
  return{ok:true};
}
