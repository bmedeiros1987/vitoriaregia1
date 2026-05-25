# Vitória Régia Pro v9.4 — correção de migração preflight

Esta versão corrige o erro:

```text
column "permissions" of relation "users" does not exist
```

O erro acontece quando o banco PostgreSQL já possui uma tabela `users` antiga. O sistema antigo tenta criar o usuário Master usando a coluna `permissions`, mas essa coluna ainda não existe.

## Correção definitiva

A v9.4 roda uma migração antes da inicialização do servidor:

```text
node src/preflight-migration.js && node src/index.js
```

Assim, antes de criar Master, Síndico e permissões, ela garante que as colunas legadas existam.

## Como publicar no GitHub pelo Mac

```bash
cd ~/Downloads
unzip -o vitoriaregia_pro_v9_4_preflight_migracao.zip
cd vitoriaregia_pro_v9_4_preflight_migracao
chmod +x publicar_github_mac_linux.sh
bash publicar_github_mac_linux.sh
```

Depois, no Render:

```text
Manual Deploy → Clear build cache & deploy
```

## Correção emergencial no banco

Se precisar destravar antes de publicar a v9.4, execute no Query Editor da Aiven/PostgreSQL o arquivo:

```text
MIGRACAO_EMERGENCIAL_BANCO_V9_4.sql
```

Ele não apaga dados. Ele apenas adiciona colunas ausentes em tabelas antigas.
