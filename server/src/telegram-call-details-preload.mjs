import { enrichTelegramCallText } from './telegram-call-context.mjs';

const baseFetch=globalThis.fetch.bind(globalThis);
const providerHost=new URL(process.env.VR_CALLMEBOT_BASE_URL||'https://api.callmebot.com/start.php').host;
const maxChars=()=>Math.min(256,Math.max(180,Number(process.env.VR_TELEGRAM_CALL_MAX_TTS_CHARS||256)));

globalThis.fetch=async function contextualUtf8Fetch(input,init){
  try{
    const raw=typeof input==='string'||input instanceof URL?input:input?.url;
    const url=new URL(raw);
    const isProvider=url.host===providerHost&&/\/start\.php$/i.test(url.pathname)&&url.searchParams.has('user');
    if(isProvider&&url.searchParams.has('text')){
      const detailed=await enrichTelegramCallText(url.searchParams.get('user'),url.searchParams.get('text'),maxChars());
      if(detailed)url.searchParams.set('text',detailed);
      input=typeof input==='string'||input instanceof URL?url:new Request(url,input);
    }
  }catch(error){console.warn('[telegram-calls] Contexto detalhado ignorado:',error.message)}
  return baseFetch(input,init);
};

console.log('[telegram-calls] Chamadas contextuais e UTF-8 ativadas.');
