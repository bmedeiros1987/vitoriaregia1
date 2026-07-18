---
title: Vitória Régia Voice
emoji: 🏡
colorFrom: green
colorTo: teal
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# Vitória Régia Voice

Serviço gratuito de texto para voz em português brasileiro, preparado para o concierge do Telegram do Vitória Régia.

## Motor

- Kokoro-82M em CPU;
- idioma `pt-BR`;
- voz padrão feminina `pf_dora`;
- vozes alternativas `pm_alex` e `pm_santa`;
- saída OGG/Opus para nota de voz no Telegram;
- saída MP3 e WAV para outros usos;
- cache temporário para frases repetidas;
- limite de uma geração por vez para proteger o plano gratuito.

## Rotas

- `GET /health` — estado do serviço;
- `POST /warmup` — carrega o modelo antecipadamente;
- `POST /v1/audio/speech` — gera áudio.

Exemplo de requisição:

```json
{
  "input": "Olá, Bruno. Você possui uma encomenda pendente na portaria.",
  "voice": "pf_dora",
  "response_format": "opus",
  "speed": 0.96
}
```

## Proteção

Crie um segredo no Space chamado `VOICE_API_KEY`. O Vitória Régia deve usar exatamente o mesmo valor em `VR_TTS_API_KEY`.

Quando `VOICE_API_KEY` estiver preenchido, o endpoint exige:

```text
Authorization: Bearer SEU_SEGREDO
```

## Variáveis opcionais

```env
VOICE_DEFAULT=pf_dora
VOICE_MAX_CHARS=1800
VOICE_CACHE_ITEMS=16
VOICE_MAX_CONCURRENCY=1
VOICE_WARMUP_ON_START=true
```

## Integração com o Vitória Régia

No Render do sistema principal, configure:

```env
VR_TTS_BASE_URL=https://SEU-USUARIO-SEU-SPACE.hf.space
VR_TTS_API_KEY=O_MESMO_VALOR_DE_VOICE_API_KEY
VR_TTS_VOICE=pf_dora
VR_TTS_RESPONSE_FORMAT=opus
VR_TELEGRAM_CONCIERGE_AUDIO_ENABLED=true
```

Não é necessário cron. Em hardware gratuito, o Space pode dormir por inatividade. O Vitória Régia responde imediatamente ao webhook do Telegram e conclui o áudio em segundo plano quando o serviço despertar.

## Observação sobre custo

O projeto foi preparado para o hardware CPU gratuito do Hugging Face Spaces. O serviço não utiliza API paga de voz e não compartilha infraestrutura com outros sistemas.
