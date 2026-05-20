# WhatsApp Periskope mantido na versão com senha temporária corrigida

Esta versão mantém a correção da geração de senha temporária para síndico/subsíndico e preserva a integração WhatsApp via Periskope.

## Validações realizadas

- `node --check app.js`
- `node --check backend/src/server.js`
- `node --check backend/src/db.js`
- Backend iniciado localmente com `WHATSAPP_PROVIDER=periskope`.
- `/api/integrations/whatsapp/debug` confirmou provedor Periskope, endpoint `/v1/messages`, header `Authorization: Bearer <oculto>` e `x-phone` configurado.
- Teste de envio foi realizado contra um servidor Periskope falso local, confirmando que o backend envia:
  - método `POST`;
  - endpoint `/v1/messages`;
  - header `Authorization: Bearer <API_KEY>`;
  - header `x-phone`;
  - corpo com `chat_id` no formato `55DDDNUMERO@c.us`;
  - `options.hide_url_preview`.

## Variáveis necessárias no Render

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=periskope
WHATSAPP_COUNTRY_CODE=55
WHATSAPP_TEST_TO=55DDDNUMERO_PARA_TESTE

PERISKOPE_BASE_URL=https://api.periskope.app/v1
PERISKOPE_API_KEY=SUA_API_KEY_SEM_BEARER
PERISKOPE_PHONE=55NUMERO_CONECTADO_NO_PERISKOPE
PERISKOPE_COUNTRY_CODE=55
PERISKOPE_TEST_TO=55DDDNUMERO_PARA_TESTE
PERISKOPE_HIDE_URL_PREVIEW=true
```

Também pode ser usado `PERISKOPE_PHONE=phone-xxxxxxxxxxxx` se a Periskope fornecer um `phone_id`.

## Variáveis da sessão no Render

```env
TRUST_PROXY=true
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAME_SITE=lax
SESSION_SECRET=crie_uma_chave_grande_e_aleatoria
```

Após publicar, teste:

- `/api/health`
- `/api/db/status`
- `/api/integrations/whatsapp/debug`
