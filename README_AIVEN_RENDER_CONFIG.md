# Configuração do banco MySQL/Aiven no Render

Use estas variáveis em **Render → Environment Variables**. Não envie `.env` com senha para o GitHub.

```env
DATABASE_PROVIDER=mysql
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
MYSQL_PORT=22966
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=COLOQUE_A_SENHA_REAL_APENAS_NO_RENDER
MYSQL_SSL=true
MYSQL_SSL_MODE=REQUIRED
MYSQL_SSL_REJECT_UNAUTHORIZED=false
ALLOW_LEGACY_DEMO_LOGIN=false
REQUIRE_APPROVED_RESIDENT=true
```

Também é possível usar `DATABASE_URL` no lugar das variáveis separadas, mas as variáveis separadas facilitam diagnóstico e evitam erro de leitura do parâmetro `ssl-mode`.

## Após publicar

Acesse:

```text
/api/health
/api/db/status
```

O resultado esperado é:

```json
{
  "ok": true,
  "database": {
    "configured": true,
    "ready": true,
    "provider": "mysql"
  }
}
```

Em `/api/db/status`, o esperado é `ok: true`, `ready: true` e contagens das tabelas.

## Segurança

A senha do banco foi compartilhada fora do painel do Aiven/Render. Recomenda-se rotacionar a senha no Aiven depois que o sistema estiver publicado e atualizar o Render com a nova senha.
