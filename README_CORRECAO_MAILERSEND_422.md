# Correção MailerSend HTTP 422

Esta versão corrige a montagem da requisição de e-mail para o MailerSend e melhora as mensagens de diagnóstico quando a API retorna HTTP 422.

## O que foi corrigido

- O sistema não usa mais automaticamente o e-mail SMTP/Gmail como remetente do MailerSend.
- O remetente do MailerSend agora precisa ser informado em `MAILERSEND_FROM_EMAIL` ou no painel, e deve ser um domínio/remetente verificado no MailerSend.
- O token é limpo automaticamente caso seja colado com `Bearer`, espaços ou quebras de linha.
- Destinatário e remetente são validados antes do envio.
- O corpo enviado ao MailerSend sempre inclui `from`, `to`, `subject`, `text` e `html`.
- As mensagens de erro 422 agora mostram os detalhes retornados pela API e orientam o que corrigir.

## Variáveis recomendadas no Render

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=mailersend
MAILERSEND_API_KEY=COLE_O_TOKEN_SEM_BEARER
MAILERSEND_FROM_EMAIL=contato@seudominio.com.br
MAILERSEND_FROM_NAME=Condomínio Vitória Régia
MAILERSEND_TEST_TO=email_para_teste@dominio.com
```

## Importante

O `MAILERSEND_FROM_EMAIL` precisa estar validado no MailerSend. Se usar um e-mail não validado, como Gmail/Outlook comum, a API pode retornar HTTP 422.
