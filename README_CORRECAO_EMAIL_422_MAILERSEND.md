# Correção do erro 422 no envio de e-mail / MailerSend

Esta versão corrige o erro HTTP 422 retornado pelo MailerSend ao testar ou enviar e-mail pelo sistema.

## O que foi corrigido

- Removido fallback automático de `SMTP_FROM_EMAIL`/`SMTP_USER` como remetente do MailerSend.
- `MAILERSEND_FROM_EMAIL` agora precisa ser informado separadamente e deve ser um remetente/domínio verificado no MailerSend.
- A API Key pode ser colada com ou sem `Bearer`; o backend limpa automaticamente.
- Remetente e destinatário são normalizados antes do envio.
- O backend valida e-mail de origem, destino, assunto e conteúdo antes de chamar o MailerSend.
- O HTML do e-mail agora escapa caracteres especiais para evitar payload inválido.
- A resposta de erro do MailerSend passou a exibir mensagens mais úteis para o síndico.

## Variáveis recomendadas no Render

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=mailersend
MAILERSEND_API_KEY=SUA_API_KEY_SEM_ASPAS
MAILERSEND_FROM_NAME=Condomínio Vitória Régia
MAILERSEND_FROM_EMAIL=contato@seudominio.com.br
MAILERSEND_TEST_TO=bmedeiros1987@gmail.com
```

`MAILERSEND_FROM_EMAIL` deve ser um e-mail de remetente permitido/verificado na conta MailerSend. Não use Gmail, Outlook ou outro domínio não verificado como remetente MailerSend.

## Como testar

1. Faça deploy no Render.
2. Entre como síndico/administrador.
3. Acesse Configurações > Integrações > E-mail.
4. Selecione MailerSend.
5. Informe API Key, remetente verificado e destinatário de teste.
6. Clique em Testar e-mail.

## Observação

Erro 422 geralmente significa que o MailerSend recebeu a chamada, mas rejeitou algum campo do corpo da requisição, como remetente inválido/não verificado, destinatário inválido, assunto vazio ou conteúdo ausente.
