# Integração Asaas — Boletos de reserva

Esta versão adiciona geração de boleto registrado pelo Asaas para as reservas de espaços comuns.

## O que foi implementado

- Configuração Asaas em `Configurações > Integrações > Asaas — boletos bancários`.
- Ambiente Sandbox/Produção.
- API Key protegida no backend.
- Teste de conexão com Asaas.
- Cadastro de CPF/CNPJ do morador responsável.
- Criação automática de cliente Asaas quando necessário.
- Geração de cobrança do tipo `BOLETO` para reserva.
- Links para PDF do boleto (`bankSlipUrl`) e fatura Asaas (`invoiceUrl`).
- Webhook para atualizar reserva como paga quando o Asaas enviar evento de pagamento recebido/confirmado.

## Variáveis de ambiente no Render

Configure no Render, em **Environment Variables**:

```env
ASAAS_ENABLED=true
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_DUE_DAYS_BEFORE=2
ASAAS_FINE_VALUE=2
ASAAS_INTEREST_VALUE=1
ASAAS_WEBHOOK_TOKEN=um_token_aleatorio_grande
```

Para produção, troque:

```env
ASAAS_ENVIRONMENT=production
```

## Como gerar boleto

1. Entre como **Síndico/Administração**.
2. Vá em **Configurações** e configure o Asaas.
3. Clique em **Testar conexão Asaas**.
4. Vá em **Financeiro**.
5. Clique em **Gerar boleto** na reserva desejada.
6. Se o morador não tiver CPF/CNPJ salvo, o sistema vai pedir no momento da geração.

## Webhook Asaas

No painel do Asaas, cadastre a URL do webhook:

```text
https://SEU-SITE.onrender.com/api/asaas/webhook?token=SEU_ASAAS_WEBHOOK_TOKEN
```

Eventos úteis para marcar pagamento:

- `PAYMENT_RECEIVED`
- `PAYMENT_CONFIRMED`

## Segurança

Nunca envie a API Key do Asaas para o GitHub. Use somente as variáveis de ambiente do Render.

## Webhook

Cadastre no Asaas a URL `https://SEU-SITE.onrender.com/api/asaas/webhook` e defina o token de autenticação igual à variável `ASAAS_WEBHOOK_TOKEN`. O backend valida o header `asaas-access-token` enviado pelo Asaas.
