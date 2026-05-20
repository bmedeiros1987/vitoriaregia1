# Correção de persistência no MySQL/Aiven

Esta versão corrige o problema em que os dados cadastrados no sistema desapareciam após atualizar a página ou reiniciar o serviço.

## O que foi corrigido

- O sistema agora salva cada alteração diretamente no backend usando `/api/state/:key`.
- Foi removida a sincronização em lote por debounce que podia sobrescrever o banco com estado local antigo.
- O backend passou a carregar o estado mais recente do banco antes de salvar uma chave específica.
- O endpoint `/api/db/status` agora mostra contagem de registros por tabela e a data da última persistência do estado.
- O aviso visual foi ajustado para MySQL/Aiven.

## Render

Use:

```bash
Build Command:
cd backend && npm install
```

```bash
Start Command:
cd backend && npm start
```

Variáveis essenciais:

```env
DATABASE_PROVIDER=mysql
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
MYSQL_PORT=22966
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=SUA_SENHA_ATUAL_DO_AIVEN
MYSQL_SSL=true
MYSQL_SSL_MODE=REQUIRED
MYSQL_SSL_REJECT_UNAUTHORIZED=false
ALLOW_LEGACY_DEMO_LOGIN=false
```

## Como testar

Depois do deploy, acesse:

```text
https://vitoriaregia1.onrender.com/api/db/status
```

O retorno deve trazer:

```json
"ok": true,
"ready": true,
"mode": "mysql"
```

Cadastre um item, atualize a página e acesse novamente `/api/db/status`. O campo `persistedStateUpdatedAt` deve mudar e as contagens devem refletir os dados salvos.

## Observação importante

Não envie `.env`, senha do banco, tokens de WhatsApp, Asaas, MailerSend ou storage para o GitHub. Configure tudo somente em **Render -> Environment Variables**.
