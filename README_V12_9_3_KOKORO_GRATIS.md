# Vitória Régia Pro v12.9.3 — Voz gratuita Kokoro

## Objetivo

Ativar respostas de voz do concierge do Telegram sem utilizar uma API paga, sem cron e sem compartilhar infraestrutura com outros sistemas.

## Arquitetura

```text
Morador envia áudio ao Telegram
        ↓
Vitória Régia confirma o webhook imediatamente
        ↓
Transcrição identifica a pergunta
        ↓
Concierge consulta os dados do morador
        ↓
Vitória Régia Voice gera OGG/Opus com Kokoro-82M
        ↓
Telegram entrega a resposta como nota de voz
```

A geração ocorre em segundo plano. Isso evita timeout quando o serviço gratuito estiver acordando.

## Serviço de voz

O diretório `voice-service/` contém um Docker Space completo:

- FastAPI;
- Kokoro-82M;
- português brasileiro;
- `pf_dora` como voz feminina padrão;
- `pm_alex` e `pm_santa` como alternativas masculinas;
- MP3, WAV e OGG/Opus;
- FFmpeg;
- cache temporário;
- uma geração simultânea para preservar CPU e memória;
- endpoint compatível com `/v1/audio/speech`.

## Publicação gratuita

### 1. Criar token

No Hugging Face, crie um token com permissão para gravar Spaces.

### 2. Configurar o GitHub

No repositório `vitoriaregia1`:

**Settings → Secrets and variables → Actions**

Crie o secret:

```text
HF_TOKEN
```

Crie a variável:

```text
HF_SPACE_ID=bmedeiros1987/vitoria-regia-voice
```

O nome antes da barra deve ser o usuário real do Hugging Face.

### 3. Publicar

Abra:

```text
Actions → Publicar voz gratuita → Run workflow
```

O workflow cria o Space público Docker caso ele ainda não exista e envia somente o conteúdo de `voice-service/`.

Não existe agendamento ou cron. O workflow roda apenas quando acionado manualmente.

## Proteção do endpoint

No Space, abra **Settings → Variables and secrets** e crie:

```env
VOICE_API_KEY=UM_SEGREDO_LONGO_E_ALEATORIO
```

No Render do Vitória Régia, configure o mesmo valor:

```env
VR_TTS_API_KEY=UM_SEGREDO_LONGO_E_ALEATORIO
```

## Variáveis no Render do Vitória Régia

```env
VR_TTS_BASE_URL=https://SEU-USUARIO-VITORIA-REGIA-VOICE.hf.space
VR_TTS_API_KEY=O_MESMO_SEGREDO_DO_SPACE
VR_TTS_PROVIDER=kokoro
VR_TTS_MODEL=kokoro-82m
VR_TTS_VOICE=pf_dora
VR_TTS_RESPONSE_FORMAT=opus
VR_TTS_SPEED=0.96
VR_TTS_MAX_ATTEMPTS=2
VR_TTS_REQUEST_TIMEOUT_SECONDS=180
VR_TTS_RETRY_DELAY_SECONDS=5
VR_TELEGRAM_CONCIERGE_AUDIO_ENABLED=true
```

A integração aceita temporariamente o valor antigo de voz presente no Render e o converte para `pf_dora`, evitando falha durante a transição.

## Teste do serviço

### Saúde

```bash
curl https://SEU-SPACE.hf.space/health
```

### Aquecimento manual

```bash
curl -X POST https://SEU-SPACE.hf.space/warmup \
  -H "Authorization: Bearer SEU_SEGREDO"
```

### Gerar MP3

```bash
curl -X POST https://SEU-SPACE.hf.space/v1/audio/speech \
  -H "Authorization: Bearer SEU_SEGREDO" \
  -H "Content-Type: application/json" \
  -d '{"input":"Olá. O concierge do Vitória Régia está funcionando.","voice":"pf_dora","response_format":"mp3","speed":0.96}' \
  --output teste.mp3
```

### Gerar nota de voz

```bash
curl -X POST https://SEU-SPACE.hf.space/v1/audio/speech \
  -H "Authorization: Bearer SEU_SEGREDO" \
  -H "Content-Type: application/json" \
  -d '{"input":"Você possui uma encomenda pendente na portaria.","voice":"pf_dora","response_format":"opus","speed":0.96}' \
  --output teste.ogg
```

## Teste no Telegram

1. confirme que o morador está vinculado;
2. envie `/menu`;
3. envie uma pergunta em texto;
4. envie um áudio dizendo “Quais encomendas eu tenho?”;
5. confirme que a resposta por áudio chega como nota de voz;
6. repita a pergunta para validar o cache;
7. confirme que a resposta não dispara uma ligação do CallMeBot.

## Limitação transparente

A geração de voz é gratuita no hardware CPU básico, mas o Space pode dormir quando ficar sem uso. O primeiro áudio após um período de inatividade pode demorar mais. O webhook é confirmado antes do processamento e o Vitória Régia tenta novamente automaticamente; se ainda assim a voz não ficar disponível, o sistema entrega a resposta em texto.

A transcrição do áudio recebido continua sendo um componente separado. Esta versão elimina o custo do TTS, mas não altera o provedor de transcrição já configurado.
