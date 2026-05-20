# Integração WhatsApp — Periskope API

Esta versão adiciona o provedor **Periskope API** ao módulo de WhatsApp automático do Sistema Vitória Régia.

## Onde configurar

No sistema:

```text
Síndico / Administração → Configurações → WhatsApp automático → Provedor de WhatsApp → Periskope API
```

Também é possível configurar somente pelo Render, sem salvar o token pelo painel:

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=periskope
WHATSAPP_COUNTRY_CODE=55
WHATSAPP_TEST_TO=5561999999999

PERISKOPE_BASE_URL=https://api.periskope.app/v1
PERISKOPE_API_KEY=COLOQUE_A_API_KEY_NO_RENDER
PERISKOPE_PHONE=5561999999999
PERISKOPE_COUNTRY_CODE=55
PERISKOPE_TEST_TO=5561999999999
PERISKOPE_HIDE_URL_PREVIEW=true
```

## Campos

- `PERISKOPE_API_KEY`: chave da API Periskope. Não enviar para o GitHub.
- `PERISKOPE_PHONE`: número conectado no Periskope que enviará as mensagens, com DDI e DDD, sem espaços.
- `PERISKOPE_TEST_TO`: número para teste.
- `PERISKOPE_BASE_URL`: padrão `https://api.periskope.app/v1`.

## O que o sistema envia

O sistema passa a enviar as notificações automáticas de WhatsApp pelo Periskope, incluindo:

- aviso de encomenda;
- aviso de visitante;
- reserva validada/cancelada;
- mensagens internas para síndico, subsíndico e portaria quando houver regra ativada.

## Segurança

Nunca coloque `PERISKOPE_API_KEY` no GitHub. Use **Render → Environment Variables**.

Se a chave foi colada em chat, gere uma nova no painel do Periskope e substitua no Render.
