# Correção Periskope — Authorization header is missing

Esta versão corrige o envio de WhatsApp pela Periskope API.

## O que foi ajustado

- limpeza automática da API Key caso ela tenha sido salva com `Bearer` no início;
- envio dos headers exigidos pela Periskope no backend:
  - `authorization: Bearer <apiKey>`;
  - `x-phone: <telefone conectado ou phone_id>`;
- validação do telefone conectado no formato `55DDDNUMERO` ou `phone-...`;
- diagnóstico com endpoint, origem da chave e tamanho da chave, sem revelar o token;
- erro mais claro quando a Base URL estiver causando redirecionamento.

## Variáveis recomendadas no Render

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=periskope
WHATSAPP_COUNTRY_CODE=55
WHATSAPP_TEST_TO=55SEUNUMERO

PERISKOPE_BASE_URL=https://api.periskope.app/v1
PERISKOPE_API_KEY=SUA_API_KEY_PERISKOPE_SEM_BEARER
PERISKOPE_PHONE=55NUMERO_CONECTADO_NO_PERISKOPE
PERISKOPE_COUNTRY_CODE=55
PERISKOPE_TEST_TO=55SEUNUMERO
PERISKOPE_HIDE_URL_PREVIEW=true
```

Não coloque aspas, espaços ou quebras de linha na `PERISKOPE_API_KEY`.

Depois de alterar variáveis no Render, rode **Manual Deploy → Deploy latest commit**.

## Diagnóstico

Acesse:

```text
https://vitoriaregia1.onrender.com/api/integrations/whatsapp/debug
```

O ideal é aparecer:

```json
"provider": "periskope",
"periskopeApiKeySaved": true,
"periskopeApiKeyLength": maior que 20,
"periskopePhone": "55...",
"periskopeEndpoint": "https://api.periskope.app/v1/messages"
```
