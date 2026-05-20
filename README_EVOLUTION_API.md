# Integração WhatsApp — Evolution API

Esta versão permite enviar WhatsApp automático pelo backend usando Evolution API, mantendo também a opção Meta WhatsApp Cloud API.

## Configuração recomendada no Render

No Render, em **Environment Variables**, configure:

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=evolution
WHATSAPP_COUNTRY_CODE=55
WHATSAPP_TEST_TO=5561999999999

EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_INSTANCE=nome-da-instancia
EVOLUTION_API_KEY=sua_api_key_da_evolution
EVOLUTION_COUNTRY_CODE=55
EVOLUTION_TEST_TO=5561999999999
EVOLUTION_LINK_PREVIEW=false
```

Não coloque `EVOLUTION_API_KEY` no GitHub.

## Configuração pelo painel do sistema

No sistema, entre como **Síndico/Administração** e abra:

```text
Configurações → Integrações → WhatsApp automático
```

Escolha **Evolution API** e preencha:

- URL da Evolution API;
- Nome da instância;
- API Key;
- WhatsApp para teste.

Depois clique em **Salvar integrações** e em **Enviar WhatsApp de teste**.

## Diagnóstico

Após publicar, teste:

```text
https://SEU-SITE.onrender.com/api/integrations/whatsapp/debug
```

O retorno deve mostrar `ok: true` e `provider: evolution`.

## Observação

A instância da Evolution API precisa estar conectada ao WhatsApp. Se a instância estiver desconectada ou o nome estiver errado, o sistema salva a configuração, mas a API retornará erro ao enviar.
