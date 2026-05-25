# Vitória Régia Pro v10.0

Versão de padronização premium com foco em operação real no celular.

## Principais ajustes

- Botões de confirmação padronizados em todo o sistema.
- Dashboard com cards numéricos clicáveis.
- Encomendas e reservas procuram automaticamente moradores pela unidade.
- Se existir usuário com unidade, mas sem morador vinculado, o backend cria/vincula o morador automaticamente no primeiro lançamento operacional.
- Mensagens de forma de retirada agora aparecem em texto formal.
- E-mails com mais espaçamento entre logo e texto.
- Telegram com fallback por URL `sendMessage` quando o POST principal falhar.
- Links de PWA funcionando dentro da Central de Apps.
- Links de APK não quebram: se não houver URL configurada, o botão fica desativado e informa que o APK ainda não foi publicado.
- Manuais padrão disponíveis dentro do sistema mesmo quando nenhum manual foi enviado pelo painel.
- Logo residencial redesenhada com inspiração no prédio Vitória Régia.

## Telegram

Configure no Render, nunca no GitHub:

```text
TELEGRAM_ENABLED=true
ENABLE_TELEGRAM=true
TELEGRAM_START_URL=https://t.me/vitoriaregia_bot
TELEGRAM_BOT_USERNAME=vitoriaregia_bot
TELEGRAM_BOT_TOKEN=novo_token_do_bot
TELEGRAM_CHAT_ID=chat_id_padrao
TELEGRAM_WEBHOOK_SECRET=segredo_forte
```

Depois acesse:

```text
Configurações -> Telegram -> Testar bot
Configurações -> Telegram -> Configurar webhook
Configurações -> Telegram -> Verificar webhook
```

## Render

```text
Build Command: npm install --no-audit --no-fund && npm run build
Start Command: npm start
Root Directory: vazio
NODE_VERSION=20.19.0
APP_VERSION=Vitória Régia Pro v10.0
```
