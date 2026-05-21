# Correção PostgreSQL/Aiven para Render

Esta correção foi criada para resolver o erro:

```txt
getaddrinfo ENOTFOUND mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
```

## Diagnóstico

O projeto publicado voltou a exigir `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` e `MYSQL_SSL`.

Como o banco operacional informado anteriormente é PostgreSQL/Aiven, o backend deve usar `DATABASE_URL` com `postgres://...`, e não variáveis `MYSQL_*`.

## Arquivos alterados

- `backend/src/db.js`
  - passa a aceitar PostgreSQL/Aiven via `DATABASE_URL` ou variáveis `PG*`;
  - mantém compatibilidade com MySQL caso algum ambiente antigo ainda use MySQL;
  - dá prioridade a `DATABASE_URL=postgres://...` mesmo que variáveis antigas `MYSQL_*` continuem salvas no Render;
  - traduz automaticamente parte do SQL antigo MySQL para PostgreSQL, incluindo `?`, `on duplicate key update`, crases e `on update current_timestamp`.

- `backend/package.json`
  - adiciona a dependência `pg`;
  - mantém `mysql2` apenas por compatibilidade.

- `render.yaml`
  - troca a configuração principal para PostgreSQL;
  - remove o host MySQL inválido do blueprint.

- `backend/.env.example`
  - exemplo seguro, sem senha real, usando PostgreSQL.

## Como aplicar pelo GitHub

1. Extraia este ZIP.
2. Entre na pasta `substituir-no-repositorio`.
3. Envie o conteúdo dessa pasta para a raiz do repositório `vitoriaregia1`, substituindo os arquivos existentes.
4. Confirme o commit.
5. No Render, vá em Environment Variables.
6. Configure:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://avnadmin:SUA_SENHA_REAL@pg-282c5f4-vitoriaregia1.e.aivencloud.com:22966/defaultdb?sslmode=require
PGSSLMODE=require
PGSSL_REJECT_UNAUTHORIZED=false
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
```

7. Remova ou ignore as variáveis antigas `MYSQL_*`. A correção prioriza `DATABASE_URL=postgres://...`, mas deixar variáveis antigas pode confundir a manutenção futura.
8. Faça um novo deploy no Render. Preferencialmente use **Clear build cache & deploy**.

## Observação importante

Não publique a senha real do banco no GitHub. A senha deve ficar somente nas variáveis de ambiente do Render.
