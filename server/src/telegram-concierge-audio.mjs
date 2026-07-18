import { setting } from './telegram-concierge-data.mjs';

const nativeFetch=globalThis.fetch.bind(globalThis);
const clean=(value='',max=4090)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const bool=(value,fallback=false)=>value===undefined||value===null||value===''?fallback:['1','true','yes','sim','on','enabled','ativo'].includes(String(value).trim().toLowerCase());
const join=(base,path)=>`${String(base||'').replace(/\/$/,'')}/${String(path||'').replace(/^\//,'')}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function token(){return String(await setting('TELEGRAM_BOT_TOKEN',process.env.TELEGRAM_BOT_TOKEN||'')).trim()}
async function apiBase(){return String(await setting('TELEGRAM_API_BASE_URL',process.env.TELEGRAM_API_BASE_URL||'https://api.telegram.org')).replace(/\/$/,'')}

export async function telegramJson(method,body={}){
  const bot=await token();
  if(!bot)return {ok:false,error:'Token do Telegram não configurado.'};
  const response=await nativeFetch(`${await apiBase()}/bot${bot}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok&&data.ok!==false,data,error:data.description||''};
}

async function telegramForm(method,form){
  const bot=await token();
  if(!bot)return {ok:false,error:'Token do Telegram não configurado.'};
  const response=await nativeFetch(`${await apiBase()}/bot${bot}/${method}`,{method:'POST',body:form});
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok&&data.ok!==false,data,error:data.description||''};
}

export async function sendConciergeText(chatId,text,keyboard=null){
  return telegramJson('sendMessage',{
    chat_id:String(chatId),
    text:String(text||'').slice(0,4090),
    disable_web_page_preview:true,
    ...(keyboard?{reply_markup:keyboard}:{})
  });
}

async function telegramFile(fileId){
  const info=await telegramJson('getFile',{file_id:fileId});
  if(!info.ok||!info.data?.result?.file_path)throw new Error(info.error||'Arquivo de áudio não localizado no Telegram.');
  const bot=await token();
  const response=await nativeFetch(`${await apiBase()}/file/bot${bot}/${info.data.result.file_path}`);
  if(!response.ok)throw new Error('Não foi possível baixar o áudio recebido.');
  return {buffer:Buffer.from(await response.arrayBuffer()),path:info.data.result.file_path,contentType:response.headers.get('content-type')||'audio/ogg'};
}

function sttConfig(){
  const key=process.env.VR_STT_API_KEY||process.env.OPENAI_API_KEY||'';
  const direct=process.env.VR_STT_ENDPOINT||'';
  const base=process.env.VR_STT_BASE_URL||process.env.OPENAI_BASE_URL||(key?'https://api.openai.com/v1':'');
  return {
    key,
    endpoint:direct||(base?join(base,'audio/transcriptions'):''),
    model:process.env.VR_STT_MODEL||process.env.OPENAI_TRANSCRIPTION_MODEL||'whisper-1'
  };
}

export async function transcribeTelegramAudio(message={}){
  const media=message.voice||message.audio||message.video_note;
  if(!media?.file_id)throw new Error('Mensagem sem arquivo de áudio.');
  const cfg=sttConfig();
  if(!cfg.endpoint||!cfg.key)throw new Error('Transcrição de áudio ainda não configurada no servidor.');
  const file=await telegramFile(media.file_id);
  const extension=message.audio?.file_name?.split('.').pop()||(/mpeg|mp3/i.test(file.contentType)?'mp3':'ogg');
  const form=new FormData();
  form.append('file',new Blob([file.buffer],{type:file.contentType}),`telegram.${extension}`);
  form.append('model',cfg.model);
  form.append('language','pt');
  form.append('response_format','json');
  const response=await nativeFetch(cfg.endpoint,{method:'POST',headers:{authorization:`Bearer ${cfg.key}`},body:form});
  const raw=await response.text();
  let data={};try{data=raw?JSON.parse(raw):{}}catch{data={text:raw}}
  if(!response.ok)throw new Error(data.error?.message||data.error||data.message||'Falha ao transcrever o áudio.');
  const text=clean(data.text||data.transcript||'',3000);
  if(!text)throw new Error('Não consegui entender o áudio. Tente novamente falando um pouco mais devagar.');
  return text;
}

async function fetchWithTimeout(url,options={},timeoutMs=180000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  timer.unref?.();
  try{return await nativeFetch(url,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
}

async function decodeSpeechResponse(response,format){
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(contentType.includes('application/json')){
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(clean(data.detail||data.error||data.message||`Erro ${response.status}`,400));
    const encoded=String(data.audioBase64||data.audio_base64||'');
    if(!encoded)throw new Error('O serviço de voz não devolveu o áudio.');
    return {buffer:Buffer.from(encoded,'base64'),format,contentType:data.contentType||(format==='opus'?'audio/ogg':'audio/mpeg')};
  }
  if(!response.ok){
    const raw=await response.text().catch(()=>`Erro ${response.status}`);
    throw new Error(clean(raw,400)||`Erro ${response.status}`);
  }
  const buffer=Buffer.from(await response.arrayBuffer());
  if(!buffer.length)throw new Error('O serviço de voz devolveu um arquivo vazio.');
  return {buffer,format,contentType:contentType||((format==='opus'||format==='ogg')?'audio/ogg':format==='wav'?'audio/wav':'audio/mpeg')};
}

async function synthesize(text){
  const base=String(process.env.VR_TTS_BASE_URL||'').replace(/\/$/,'');
  if(!base||!bool(process.env.VR_TELEGRAM_CONCIERGE_AUDIO_ENABLED,true))return null;
  const formats=[process.env.VR_TTS_RESPONSE_FORMAT||'opus','mp3'];
  const attempts=Math.max(1,Math.min(3,Number(process.env.VR_TTS_MAX_ATTEMPTS||2)));
  const timeoutMs=Math.max(30000,Math.min(300000,Number(process.env.VR_TTS_REQUEST_TIMEOUT_SECONDS||180)*1000));
  const retryDelay=Math.max(1000,Math.min(15000,Number(process.env.VR_TTS_RETRY_DELAY_SECONDS||5)*1000));
  let lastError='';

  for(const format of [...new Set(formats)]){
    for(let attempt=1;attempt<=attempts;attempt+=1){
      try{
        const response=await fetchWithTimeout(join(base,'v1/audio/speech'),{
          method:'POST',
          headers:{'content-type':'application/json',...(process.env.VR_TTS_API_KEY?{authorization:`Bearer ${process.env.VR_TTS_API_KEY}`}:{})},
          body:JSON.stringify({
            model:process.env.VR_TTS_MODEL||'kokoro-82m',
            input:String(text||'').slice(0,1800),
            voice:process.env.VR_TTS_VOICE||'pf_dora',
            response_format:format,
            language:'pt-BR',
            speed:Number(process.env.VR_TTS_SPEED||0.96)
          })
        },timeoutMs);
        return await decodeSpeechResponse(response,format);
      }catch(error){
        lastError=error?.name==='AbortError'?'O serviço gratuito demorou para despertar.':clean(error?.message||error,400);
        if(attempt<attempts)await sleep(retryDelay*attempt);
      }
    }
  }
  throw new Error(lastError||'Serviço de voz indisponível.');
}

async function sendVoice(chatId,audio,keyboard=null){
  const form=new FormData();
  form.append('chat_id',String(chatId));
  form.append('voice',new Blob([audio.buffer],{type:audio.contentType}),audio.format==='mp3'?'resposta.mp3':'resposta.ogg');
  form.append('caption','Concierge Vitória Régia');
  if(keyboard)form.append('reply_markup',JSON.stringify(keyboard));
  const voice=await telegramForm('sendVoice',form);
  if(voice.ok)return voice;
  if(audio.format==='mp3'){
    const audioForm=new FormData();
    audioForm.append('chat_id',String(chatId));
    audioForm.append('audio',new Blob([audio.buffer],{type:audio.contentType}),'resposta.mp3');
    audioForm.append('title','Concierge Vitória Régia');
    if(keyboard)audioForm.append('reply_markup',JSON.stringify(keyboard));
    return telegramForm('sendAudio',audioForm);
  }
  return voice;
}

export async function sendConciergeReply(chatId,result={},preferVoice=false){
  if(preferVoice){
    try{
      const audio=await synthesize(result.spoken||result.text||'');
      if(audio){
        const sent=await sendVoice(chatId,audio,result.keyboard||null);
        if(sent.ok)return {ok:true,mode:'voice',delivery:sent};
      }
    }catch(error){
      console.warn('[telegram-concierge] Resposta por áudio indisponível:',error.message);
    }
  }
  const sent=await sendConciergeText(chatId,result.text||result.spoken||'Não encontrei informações para responder.',result.keyboard||null);
  return {ok:sent.ok,mode:'text',delivery:sent};
}
