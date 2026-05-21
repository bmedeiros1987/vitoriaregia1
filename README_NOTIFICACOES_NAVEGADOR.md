# Vitória Régia — Notificações pelo navegador

Este pacote adiciona uma Central de Notificações ao sistema, com visual limpo e suporte a notificações nativas do navegador.

## O que foi incluído

1. Notificações gerais para todos os moradores.
2. Notificações específicas por unidade habitacional.
3. Comunicados do síndico/administrador.
4. Alertas úteis para encomendas, visitantes e avisos administrativos.
5. Central visual com sino flutuante, contador de não lidas e opção de marcar como lida.
6. Modo imediato no frontend, sem serviço pago.
7. Modo completo com backend e banco, para distribuir comunicados entre dispositivos.

## Arquivos principais

Copie para a raiz do repositório:

- `vr-browser-notifications.css`
- `vr-browser-notifications.js`
- `injetar_notificacoes.js`

Copie para o backend:

- `backend/src/notifications.routes.js`
- `injetar_backend_notificacoes.js`

Arquivos auxiliares:

- `sql/notificacoes_postgres.sql`
- `sql/notificacoes_mysql.sql`
- `index_notificacoes.patch`
- `backend_server_notificacoes.patch`

## Instalação rápida do frontend

Na raiz do repositório, rode:

```bash
node injetar_notificacoes.js
```

Ou faça manualmente no `index.html`.

Antes de `</head>`:

```html
<link rel="stylesheet" href="vr-browser-notifications.css">
```

Antes de `</body>`:

```html
<script src="vr-browser-notifications.js"></script>
```

## Instalação do backend completo

1. Copie `backend/src/notifications.routes.js` para `backend/src/notifications.routes.js`.
2. Rode na raiz do repositório:

```bash
node injetar_backend_notificacoes.js
```

Ou faça manualmente no `backend/src/server.js`.

Junto aos `require`:

```js
const notificationRoutes = require('./notifications.routes');
```

Depois de configurar o `app` e o `express.json()`:

```js
app.use('/api/notifications', notificationRoutes);
```

O backend cria as tabelas automaticamente quando a rota é acessada. Se preferir criar manualmente, use um dos SQLs incluídos na pasta `sql`.

## Segurança recomendada

A rota permite publicar comunicados para usuários com perfil:

- `admin`
- `sindico`
- `subsindico`
- `portaria`

O frontend envia os dados do usuário logado com base no que o sistema já guarda no navegador. Se o backend do sistema tiver autenticação própria, o ideal é montar a rota de notificações depois do middleware de autenticação.

Não ative esta variável em produção, salvo para teste controlado:

```env
NOTIFICATIONS_ALLOW_INSECURE_CREATE=true
```

## Como funciona

A cada 45 segundos, o frontend verifica:

- `/api/notifications`, se o backend completo estiver instalado;
- `/api/notices` ou `/api/announcements`, se existirem;
- `/api/packages`, para encomendas;
- `/api/visitors`, para visitantes.

Quando uma nova notificação chega, o sistema mostra aviso nativo do navegador, desde que o usuário tenha permitido as notificações.

## Observação importante

As notificações nativas do navegador funcionam melhor quando o site está aberto ou em segundo plano. Para push notifications mesmo com o navegador fechado, seria necessário implementar Service Worker + Web Push, com chaves VAPID e cadastro de inscrição por dispositivo. Este pacote entrega a solução mais segura e simples para começar, sem serviço externo pago.
