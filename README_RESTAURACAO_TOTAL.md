# Sistema Vitória Régia — restauração total

Este ZIP é uma versão completa para corrigir erro de arquivos faltantes no GitHub/Render.

## Arquivos críticos incluídos

- `index.html`
- `app.js`
- `styles.css`
- `render.yaml`
- `backend/package.json`
- `backend/src/server.js`
- `backend/src/db.js`
- `backend/src/notifications.routes.js`
- `backend/src/routes/panic.js`
- `assets/building-bg.svg`

## Como subir pelo PC

1. Baixe o ZIP.
2. Extraia o ZIP no computador.
3. Entre na pasta extraída.
4. Envie **todo o conteúdo interno** para a raiz do repositório `vitoriaregia1` no GitHub.
5. Confirme que no GitHub ficou assim:

```txt
vitoriaregia1/
├── index.html
├── app.js
├── styles.css
├── render.yaml
├── backend/
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── notifications.routes.js
│       └── routes/
│           └── panic.js
├── assets/
│   └── building-bg.svg
```

O arquivo `backend/src/server.js` precisa existir exatamente nesse caminho.

## Depois do upload

No Render, faça:

```txt
Manual Deploy → Deploy latest commit
```

## Validação local opcional

No computador, na raiz do projeto:

```bash
node verificar_arquivos_criticos.js
cd backend
npm install
npm run check
npm start
```

Depois abra:

```txt
http://localhost:10000
```

## Banco de dados

O sistema foi configurado para subir mesmo se o banco estiver temporariamente indisponível.
No Render, recomenda-se deixar:

```env
REQUIRE_DATABASE=false
DATABASE_PROVIDER=postgres
PGSSLMODE=require
PGSSL_REJECT_UNAUTHORIZED=false
```
