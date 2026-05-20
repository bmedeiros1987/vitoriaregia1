# Banco de dados Aiven — Vitória Régia

Este pacote já está preparado para vincular o site ao PostgreSQL/Aiven informado.

## 1. Criar o arquivo .env

Na pasta `backend/`, copie o modelo Aiven:

```bash
cp .env.aiven.example .env
```

Depois edite o `.env` e preencha:

- `PGPASSWORD` com a senha real do usuário do banco;
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, se for usar login pelo Google;
- `ADMIN_EMAILS` com o Gmail do síndico;
- `PORTARIA_EMAILS` com o Gmail da portaria, se houver.

## 2. Certificados SSL

Coloque os certificados da Aiven nesta pasta:

```text
backend/certs/ca.pem
backend/certs/client-cert.pem
backend/certs/client-key.pem
```

Não suba `.env`, certificados ou chaves privadas para GitHub.

## 3. Instalar e testar conexão

```bash
cd backend
npm install
npm run db:test
```

## 4. Criar o banco, se necessário

Se o banco `vitoriaregia1` ainda não existir:

```bash
npm run db:create
```

Se a Aiven negar permissão para criar banco via comando, crie pelo painel da Aiven e depois execute o próximo passo.

## 5. Criar as tabelas

```bash
npm run db:init
```

Isso cria as tabelas de usuários, moradores, reservas, visitantes, encomendas, comunicados e a tabela `client_state`, usada para sincronizar todas as funcionalidades do layout premium com o PostgreSQL.

## 6. Rodar o site vinculado ao banco

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

Quando o backend estiver ativo, o site sincroniza os dados no banco. Se o backend não estiver ativo, o site continua funcionando em modo local/demonstração.

## Observação importante

A chave privada e os certificados compartilhados anteriormente devem ser considerados expostos. Antes de colocar em produção, gere novas credenciais/certificados na Aiven e substitua os arquivos no servidor.

## Notificações automáticas

A versão atual cria também a tabela `notification_logs` e permite configurar SMTP/Gmail e WhatsApp Business Cloud API pela tela **Configurações** do síndico.

Após atualizar os arquivos, rode novamente:

```bash
npm install
npm run db:init
```

As credenciais ficam salvas em `app_settings`, chave `notification_config`. Não publique `.env`, certificados, tokens, senha SMTP ou chave privada em GitHub.
