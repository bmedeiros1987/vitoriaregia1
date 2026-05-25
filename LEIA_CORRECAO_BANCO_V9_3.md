# Correção Vitória Régia Pro v9.4 — banco legado

Esta versão corrige o erro de inicialização:

```text
column "permissions" of relation "users" does not exist
```

O erro acontece porque bancos criados por versões antigas já tinham a tabela `users`. Em PostgreSQL, `CREATE TABLE IF NOT EXISTS` não adiciona colunas novas em tabelas que já existem. A v9.4 agora executa uma migração segura antes de criar o usuário Master e antes de consultar permissões.

## O que foi corrigido

- adiciona `permissions` em `users`;
- adiciona `user_type`, `is_outsourced`, `resident_id`, `employee_id`, `whatsapp_phone`, `telegram_chat_id`, `notification_preferences`, `force_password_change` e `last_login` quando faltarem;
- normaliza registros antigos;
- cria índices únicos necessários para `users`, `settings`, `emergency_types`, `common_areas`, `system_updates` e `push_subscriptions`;
- mantém os dados existentes.

## Como aplicar

Suba a v9.4 pelo script `publicar_github_mac_linux.sh` e depois rode no Render:

```text
Manual Deploy → Clear build cache & deploy
```

Se precisar corrigir emergencialmente direto no banco, execute o arquivo:

```text
CORRECAO_RAPIDA_BANCO_USERS_V9_4.sql
```

No fluxo normal, não precisa rodar esse SQL manualmente; a v9.4 faz a migração automaticamente ao iniciar.
