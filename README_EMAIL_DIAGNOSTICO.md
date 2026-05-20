# Diagnóstico de e-mail automático — Vitória Régia

Esta versão reforça o envio de e-mail automático por SMTP/Gmail.

## Variáveis obrigatórias no Render

```env
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seuemail@gmail.com
SMTP_APP_PASSWORD=sua_senha_de_app_google
SMTP_FROM_NAME=Condomínio Vitória Régia
SMTP_FROM_EMAIL=seuemail@gmail.com
SMTP_TEST_TO=seuemail@gmail.com
```

Use senha de aplicativo do Google, não a senha normal da conta. Se a senha veio com espaços, o sistema remove os espaços automaticamente.

## Endpoints de teste

Após publicar no Render, abra:

```text
https://SEU-SITE.onrender.com/api/health
https://SEU-SITE.onrender.com/api/integrations/email/debug
```

O campo `passwordSaved` deve aparecer como `true` e `passwordSource` deve aparecer como `env` ou `saved`.

## Teste pelo painel

Entre como Síndico/Administração > Configurações > Integrações.
Preencha SMTP, marque Ativar envio automático por e-mail, salve e clique em Enviar e-mail de teste.

## Render

Build Command:

```bash
cd backend && npm install
```

Start Command:

```bash
cd backend && npm start
```
