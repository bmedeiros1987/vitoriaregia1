# Sistema Vitória Régia — backend com e-mail automático

Este pacote já vem com um backend Node/Express simplificado para publicar no Render como **Web Service** e permitir envio automático de e-mail por Gmail/SMTP.

## 1. Estrutura esperada no GitHub

Envie os arquivos extraídos para a raiz do repositório, ficando assim:

```text
vitoriaregia1/
  backend/
    package.json
    src/server.js
    .env.example
  assets/
  index.html
  styles.css
  app.js
```

Não envie o arquivo `.env` para o GitHub.

## 2. Render

Crie como **Web Service**, não como Static Site.

```bash
Build Command:
cd backend && npm install

Start Command:
cd backend && npm start
```

## 3. Variáveis de ambiente no Render

Em **Render → Environment**, crie as variáveis abaixo. A senha de app do Gmail deve ficar apenas no Render.

```env
NODE_ENV=production
PORT=10000
APP_URL=https://SEU-SITE.onrender.com
SESSION_SECRET=troque_por_uma_chave_grande_e_aleatoria

ADMIN_EMAILS=bmedeiros1987@gmail.com
PORTARIA_EMAILS=

SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=bmedeiros1987@gmail.com
SMTP_APP_PASSWORD=COLOQUE_A_SENHA_DE_APP_DO_GOOGLE_AQUI
SMTP_FROM_NAME=Condomínio Vitória Régia
SMTP_FROM_EMAIL=bmedeiros1987@gmail.com
SMTP_TEST_TO=bmedeiros1987@gmail.com

DATA_FILE=/tmp/vitoria-regia-state.json
```

## 4. Testar se o backend está online

Depois do deploy, abra:

```text
https://SEU-SITE.onrender.com/api/health
```

Deve retornar JSON com `ok: true`.

## 5. Testar o e-mail no sistema

1. Acesse a URL do Render.
2. Entre como **Síndico/Administração**.
3. Vá em **Configurações**.
4. Confira os campos de SMTP.
5. Clique em **Enviar e-mail de teste**.

## Observações importantes

- Este backend usa armazenamento temporário em arquivo (`/tmp`) para teste gratuito no Render. Em produção, o ideal é migrar para PostgreSQL.
- A senha de app do Google nunca deve ser colocada no GitHub.
- Se uma senha de app foi compartilhada fora do ambiente seguro, o mais prudente é revogar e gerar uma nova no Google.
