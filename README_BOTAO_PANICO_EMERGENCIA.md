# Vitória Régia — Botão de Pânico / Emergência

Este pacote adiciona uma **Central de Emergência** integrada às notificações do navegador.

## Fluxo implementado

1. O morador clica em **🚨 Emergência**.
2. Escolhe o tipo: incêndio, emergência médica, gás, segurança, pane elétrica ou outro.
3. O alerta vai **somente para síndico, portaria e administradores**.
4. Síndico/portaria analisam a ocorrência no painel **Ocorrências**.
5. Após confirmação, eles escolhem quem será avisado:
   - todos os moradores;
   - somente bloco/torre;
   - unidades próximas;
   - somente equipe interna.
6. Só depois da confirmação o sistema exibe notificação aos moradores.

## Arquivos incluídos

- `vr-panic.css`
- `vr-panic.js`
- `backend/src/routes/panic.js`
- `injetar_botao_panico.js`
- `injetar_backend_panico.js`

## Instalação do frontend

Copie os arquivos da pasta `substituir-no-repositorio` para a raiz do projeto e rode:

```bash
node injetar_botao_panico.js
```

Ou adicione manualmente no `index.html`:

Antes de `</head>`:

```html
<link rel="stylesheet" href="vr-panic.css">
```

Antes de `</body>`:

```html
<script src="vr-panic.js"></script>
```

## Instalação do backend

Depois de copiar a pasta `backend/src/routes/panic.js`, rode:

```bash
node injetar_backend_panico.js
```

Ou adicione manualmente no `backend/src/server.js`:

```js
const panicRoutes = require('./routes/panic');
app.use('/api/panic', panicRoutes);
```

Coloque o `app.use('/api/panic', panicRoutes);` depois de `app.use(express.json())`.

## Armazenamento

Por segurança, a rota usa um arquivo JSON local em:

```txt
backend/data/panic-events.json
```

Isso evita que a emergência dependa exclusivamente do banco principal.

Em produção, se quiser, você pode adaptar a rota para gravar também no PostgreSQL/MySQL. Mesmo assim, recomendo manter o JSON como contingência para emergência.

## Perfis que recebem primeiro

O painel de confirmação aparece para usuários cujo perfil/cargo/role seja um destes:

```txt
admin, administrador, síndico, sindico, subsíndico, subsindico, portaria, porteiro, zelador, gerente
```

O script tenta ler o usuário logado a partir de `localStorage`, `sessionStorage` ou token JWT.

## Observação importante

Este recurso é uma ferramenta de comunicação interna do condomínio. Ele **não substitui** alarme de incêndio, brigada, Corpo de Bombeiros, polícia, SAMU ou outros canais oficiais de emergência.