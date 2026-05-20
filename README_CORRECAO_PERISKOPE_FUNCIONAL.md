# Correção da integração WhatsApp Periskope

Esta versão reforça a integração Periskope no backend do Sistema Vitória Régia.

## O que foi corrigido

- Normalização da `PERISKOPE_BASE_URL`:
  - aceita `https://api.periskope.app` e converte para `https://api.periskope.app/v1`;
  - aceita colagem acidental com `/messages` no final e remove duplicidade;
  - rejeita/normaliza link da documentação `docs.periskope.app` para o host correto da API.
- Limpeza da `PERISKOPE_API_KEY`:
  - remove aspas externas;
  - remove `Bearer` duplicado;
  - remove quebras de linha e espaços acidentais.
- Envio com os headers exigidos pela Periskope:
  - `Authorization: Bearer <apiKey>`;
  - `x-phone: <telefone conectado ou phone_id>`;
  - `Content-Type: application/json`.
- Montagem correta do `chat_id` no formato `55DDDNUMERO@c.us`.
- Diagnóstico mais claro em `/api/integrations/whatsapp/debug`.
- Tela de configurações agora mostra corretamente se a API Key da Periskope está salva.
- O teste de WhatsApp informa o `queue_id` quando a Periskope retorna fila de envio.

## Variáveis recomendadas no Render

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=periskope
WHATSAPP_COUNTRY_CODE=55
WHATSAPP_TEST_TO=55DDDNUMERO_PARA_TESTE

PERISKOPE_BASE_URL=https://api.periskope.app/v1
PERISKOPE_API_KEY=SUA_API_KEY_SEM_BEARER
PERISKOPE_PHONE=55NUMERO_CONECTADO_NO_PERISKOPE
# ou, se preferir, use o phone_id informado pela Periskope:
# PERISKOPE_PHONE=phone-xxxxxxxxxxxx
PERISKOPE_COUNTRY_CODE=55
PERISKOPE_TEST_TO=55DDDNUMERO_PARA_TESTE
PERISKOPE_HIDE_URL_PREVIEW=true
```

## Como testar depois do deploy

1. Faça upload/commit deste pacote no GitHub.
2. No Render, faça **Manual Deploy → Deploy latest commit**.
3. Acesse:

```text
https://vitoriaregia1.onrender.com/api/integrations/whatsapp/debug
```

O esperado:

```json
{
  "ok": true,
  "whatsapp": {
    "ok": true,
    "config": {
      "enabled": true,
      "provider": "periskope",
      "periskopeEndpoint": "https://api.periskope.app/v1/messages",
      "periskopeAuthHeader": "Authorization: Bearer <oculto>",
      "periskopeXPhoneHeaderConfigured": true
    }
  }
}
```

4. Entre como síndico → Configurações → Integrações → Enviar WhatsApp de teste.

## Observações importantes

- A Periskope exige conta ativa, número de WhatsApp conectado por QR Code e API Key válida.
- A resposta `status: queued` significa que a Periskope aceitou a mensagem na fila de envio; a entrega final ocorre de forma assíncrona.
- Não coloque a API Key no GitHub. Use somente Environment Variables no Render ou o campo protegido nas configurações do síndico.
