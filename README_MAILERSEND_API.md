# Integração MailerSend API — E-mail automático

Esta versão permite enviar e-mails automáticos por **MailerSend API**, além do SMTP/Gmail já existente.

## Variáveis no Render

Em **Render → Web Service → Environment**, adicione:

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=mailersend
MAILERSEND_API_KEY=COLOQUE_O_TOKEN_MAILERSEND_AQUI
MAILERSEND_FROM_NAME=Condomínio Vitória Régia
MAILERSEND_FROM_EMAIL=contato@seudominio.com.br
MAILERSEND_TEST_TO=bmedeiros1987@gmail.com
```

O `MAILERSEND_FROM_EMAIL` precisa ser um remetente/domínio validado no MailerSend. Não coloque o token no GitHub.

## Teste no sistema

1. Faça deploy no Render.
2. Entre como **Síndico/Administração**.
3. Abra **Configurações → Integrações → E-mail automático**.
4. Selecione **MailerSend API**.
5. Informe e-mail de teste.
6. Clique em **Enviar e-mail de teste**.

## Diagnóstico

Acesse:

```text
https://SEU-SITE.onrender.com/api/integrations/email/debug
```

A resposta deve indicar:

```json
{
  "ok": true,
  "email": {
    "config": {
      "provider": "mailersend",
      "mailersendApiKeySaved": true
    }
  }
}
```

## Segurança

Se o token foi compartilhado fora do Render, gere um novo token no MailerSend e substitua a variável `MAILERSEND_API_KEY` no Render.
