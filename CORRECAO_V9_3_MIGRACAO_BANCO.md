# Correção v9.4 — migração segura do banco

Esta versão corrige o erro:

```text
column "permissions" of relation "users" does not exist
```

Causa: bancos antigos já tinham a tabela `users`; em PostgreSQL, `CREATE TABLE IF NOT EXISTS users (...)` não adiciona colunas novas em tabelas existentes.

Correção: a inicialização agora executa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para todas as colunas usadas pelas versões Pro recentes, incluindo `users.permissions`, `users.active`, `users.notification_preferences`, `users.resident_id` e demais campos.

## Como publicar pelo Mac

```bash
cd ~/Downloads
unzip -o vitoriaregia_pro_v9_4_migracao_banco_corrigida.zip
cd vitoriaregia_pro_v9_4_migracao_banco_corrigida
chmod +x publicar_github_mac_linux.sh
bash publicar_github_mac_linux.sh
```

Depois, no Render:

```text
Manual Deploy → Clear build cache & deploy
```

## Correção manual opcional

Se quiser destravar imediatamente pelo console SQL do banco, use o arquivo:

```text
CORRECAO_RAPIDA_BANCO_USERS_PERMISSIONS.sql
```

O pacote v9.4 já aplica automaticamente, então normalmente não é necessário executar manualmente.
