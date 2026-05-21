# Análise do menu Premium e correção do banco

## Conclusão

A implementação do menu Premium/Central premium deve ser preservada. O problema identificado não está no menu Premium em si, mas na configuração atual do backend publicada no Render/GitHub, que voltou a exigir MySQL/Aiven.

O erro observado foi:

```txt
getaddrinfo ENOTFOUND mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
```

Isso significa que o backend tentou conectar em um host MySQL que não resolve via DNS. Como o ambiente funcional informado anteriormente usava PostgreSQL/Aiven, a correção deve ajustar apenas a camada de banco e deploy, sem substituir os arquivos visuais do menu Premium.

## Evidências encontradas

- O menu Premium foi implementado no frontend como `Central premium`.
- A rota administrativa usada pelo menu é `/api/admin/market-readiness`.
- O backend atual está configurado como MySQL, com `DATABASE_PROVIDER=mysql` e `MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com`.
- O pacote atual do backend depende somente de `mysql2`, sem `pg`.
- O erro fatal do backend manda corrigir variáveis `MYSQL_*`, confirmando que o código publicado está exigindo MySQL.

## Como aplicar esta correção

1. Extraia este ZIP.
2. Abra a pasta `substituir-no-repositorio`.
3. Envie o conteúdo dessa pasta para a raiz do repositório `vitoriaregia1`, substituindo apenas os arquivos indicados.
4. Não substitua `app.js`, `index.html` nem `styles.css` por versões antigas, pois esses arquivos mantêm o menu Premium.
5. No Render, configure as variáveis de PostgreSQL, especialmente `DATABASE_URL`.
6. Faça novo deploy.

## Variáveis principais no Render

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://avnadmin:SUA_SENHA_REAL@pg-282c5f4-vitoriaregia1.e.aivencloud.com:22966/defaultdb?sslmode=require
PGSSLMODE=require
PGSSL_REJECT_UNAUTHORIZED=false
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
```

## Arquivos incluídos na correção

```txt
backend/src/db.js
backend/package.json
backend/.env.example
render.yaml
README_CORRECAO_POSTGRES_RENDER.md
README_ANALISE_MENU_PREMIUM_E_CORRECAO.md
```

## Importante

Esta correção é propositalmente limitada para evitar regressão visual. Ela não altera o menu Premium, não remove a Central premium e não sobrescreve o frontend.
