# Correção do erro Page Not Found no Render

Esta versão troca o `yarn start` de `vite preview` para um servidor Node próprio (`server.mjs`).

O servidor faz fallback para `dist/index.html` em qualquer rota do React, evitando erro em URLs como:

- `/`
- `/results`
- `/statistics`
- `/privacy`
- `/terms`

## Render

Use:

```bash
Build Command: yarn install && yarn build
Start Command: node server.mjs
```

ou:

```bash
Build Command: yarn build
Start Command: yarn start
```

## Observação

Depois de enviar para o GitHub, faça Manual Deploy > Clear build cache & deploy no Render.
