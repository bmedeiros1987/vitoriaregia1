# CrewCheck · Cadastro premium simplificado

Esta versão altera o fluxo de cadastro para pedir somente:

- e-mail;
- senha;
- confirmação de senha.

BP, base e função não são informados manualmente no cadastro. Após o usuário carregar e salvar a primeira escala, o backend atualiza automaticamente o perfil com os dados extraídos do PDF:

- BP/código do tripulante;
- base;
- função/rank;
- nome do tripulante, quando disponível na escala.

## Senha provisória por e-mail

Ao criar o cadastro, o servidor gera uma senha provisória de emergência com validade de 7 dias e envia um e-mail premium de boas-vindas.

O usuário também pode entrar normalmente com a senha escolhida no cadastro. A senha provisória é apenas uma alternativa inicial/de recuperação e é invalidada após uso.

## Variáveis necessárias no Render

```text
DATABASE_URL=mysql://avnadmin:SENHA@HOST:PORTA/defaultdb?ssl-mode=REQUIRED
MYSQL_SSL_MODE=REQUIRED
CREWCHECK_AUTO_MIGRATE=true
CREWCHECK_AUTH_REQUIRED=true
NODE_VERSION=22.13.0
MAILERSEND_API_KEY=...
MAILERSEND_FROM=...
EMAIL_FROM_NAME=CrewCheck
```

Também funciona com SendGrid usando `SENDGRID_API_KEY` e `SENDGRID_FROM`.
