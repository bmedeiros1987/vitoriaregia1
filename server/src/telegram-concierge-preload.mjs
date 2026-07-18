import express from 'express';
import { conciergeReply, detectIntent, ensureConciergeSchema, logConcierge, resolveResident, setting } from './telegram-concierge-data.mjs';
import { sendConciergeReply, sendConciergeText, telegramJson, transcribeTelegramAudio } from './telegram-concierge-audio.mjs';

const PATCH=Symbol.for('vitoria-regia.telegram-concierge-patched');
const recent=new Map();
const enabled=()=>!['0','false','off','no','nao','não','disabled'].includes(String(process.env.VR_TELEGRAM_CONCIERGE_ENABLED||'true').toLowerCase());

function prune(){const now=Date.now();for(const [key,time] of recent.entries())if(now-time>10*60*1000)recent.delete(key)}
function duplicate(updateId){if(!updateId)return false;prune();const key=String(updateId);if(recent.has(key))return true;recent.set(key,Date.now());return false}
function chatIdFrom(update={}){return String(update.message?.chat?.id||update.callback_query?.message?.chat?.id||update.callback_query?.from?.id||'')}
function inputKind(message={}){return message.voice?'voice':message.audio?'audio':message.video_note?'video_note':'text'}
function callbackIntent(value=''){const match=String(value||'').match(/^concierge:(summary|packages|reservations|finance|notices|occurrences|visitors|menu)$/i);return match?.[1]||''}

async function secretAllowed(req){
  const expected=String(await setting('TELEGRAM_WEBHOOK_SECRET',process.env.TELEGRAM_WEBHOOK_SECRET||'')).trim();
  if(!expected)return true;
  const header=String(req.headers['x-telegram-bot-api-secret-token']||'').trim();
  const pathSecret=String(req.params?.secret||'').trim();
  return header===expected||pathSecret===expected;
}

async function unlinked(chatId,preferVoice=false){
  const result={
    text:'Seu Telegram ainda não está vinculado a um cadastro do Vitória Régia. Abra o sistema, entre em Conexões → Telegram e toque em Conectar meu Telegram. Depois volte aqui e escreva “minhas pendências”.',
    spoken:'Seu Telegram ainda não está vinculado ao Vitória Régia. Abra o sistema, entre em Conexões, Telegram, e conclua o vínculo.',
    keyboard:null
  };
  return sendConciergeReply(chatId,result,preferVoice);
}

async function handleCallback(update={}){
  const callback=update.callback_query;
  const intent=callbackIntent(callback?.data);
  if(!intent)return false;
  const chatId=chatIdFrom(update);
  const person=await resolveResident(chatId);
  await telegramJson('answerCallbackQuery',{callback_query_id:callback.id,text:person?'Consultando seus dados…':'Telegram não vinculado.'}).catch(()=>null);
  if(!person){await unlinked(chatId,false);return true}
  const result=await conciergeReply(person,intent);
  const delivery=await sendConciergeReply(chatId,result,false);
  await logConcierge({updateId:update.update_id,chatId,person,inputKind:'callback',inputText:callback.data,intent:result.intent,responseText:result.text,responseMode:delivery.mode,status:delivery.ok?'respondido':'erro'});
  return true;
}

async function handleMessage(update={}){
  const message=update.message;
  if(!message?.chat?.id)return false;
  const rawText=String(message.text||message.caption||'').trim();
  if(/^\/start(?:@\w+)?(?:\s|$)/i.test(rawText))return false;
  const hasAudio=Boolean(message.voice||message.audio||message.video_note);
  if(!rawText&&!hasAudio)return false;
  const chatId=String(message.chat.id);
  const person=await resolveResident(chatId);
  if(!person){await unlinked(chatId,hasAudio);return true}

  let input=rawText;
  if(hasAudio){
    try{input=await transcribeTelegramAudio(message)}
    catch(error){
      const result={text:`Recebi seu áudio, mas não consegui transcrevê-lo agora. ${error.message}`,spoken:`Recebi seu áudio, mas não consegui entender a mensagem agora. Você pode tentar novamente ou escrever sua pergunta.`,keyboard:null};
      const delivery=await sendConciergeReply(chatId,result,true);
      await logConcierge({updateId:update.update_id,chatId,person,inputKind:inputKind(message),inputText:'[áudio não transcrito]',intent:'audio_error',responseText:result.text,responseMode:delivery.mode,status:'erro'});
      return true;
    }
  }

  const intent=detectIntent(input);
  const result=await conciergeReply(person,intent);
  const delivery=await sendConciergeReply(chatId,result,hasAudio);
  await logConcierge({updateId:update.update_id,chatId,person,inputKind:inputKind(message),inputText:input,intent:result.intent,responseText:result.text,responseMode:delivery.mode,status:delivery.ok?'respondido':'erro'});
  return true;
}

async function conciergeMiddleware(req,res,next){
  if(!enabled())return next();
  try{
    if(!(await secretAllowed(req)))return res.status(403).json({ok:false,error:'Webhook Telegram não autorizado.'});
    const update=req.body||{};
    if(duplicate(update.update_id))return res.json({ok:true,deduped:true});
    if(await handleCallback(update))return res.json({ok:true,type:'concierge_callback'});
    if(await handleMessage(update))return res.json({ok:true,type:'concierge_message'});
    return next();
  }catch(error){
    console.error('[telegram-concierge] Falha ao processar atualização:',error);
    return next();
  }
}

if(!express.application[PATCH]){
  express.application[PATCH]=true;
  const originalPost=express.application.post;
  express.application.post=function patchedPost(path,...handlers){
    if(path==='/api/telegram/webhook'||path==='/api/telegram/webhook/:secret'){
      return originalPost.call(this,path,conciergeMiddleware,...handlers);
    }
    return originalPost.call(this,path,...handlers);
  };
}

async function configureCommands(){
  if(!enabled())return;
  await ensureConciergeSchema();
  const commands=[
    {command:'menu',description:'Abrir o menu do concierge'},
    {command:'pendencias',description:'Consultar minhas pendências'},
    {command:'encomendas',description:'Ver encomendas pendentes'},
    {command:'reservas',description:'Ver minhas reservas'},
    {command:'financeiro',description:'Consultar boletos e pagamentos'},
    {command:'comunicados',description:'Ver comunicados ativos'},
    {command:'ocorrencias',description:'Ver ocorrências e solicitações'}
  ];
  await telegramJson('setMyCommands',{commands,language_code:'pt'}).catch(()=>null);
}

const timer=setTimeout(()=>void configureCommands().catch(error=>console.warn('[telegram-concierge] Configuração inicial:',error.message)),7000);
timer.unref?.();
console.log('[telegram-concierge] Concierge de texto e áudio ativado.');
