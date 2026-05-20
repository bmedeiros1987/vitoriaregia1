# Teste do Aiven e fluxo do sistema

Data: 20/05/2026.

## Banco Aiven informado

Foram configuradas as variáveis do MySQL/Aiven com host, porta, database, usuário, SSL obrigatório e `MYSQL_SSL_REJECT_UNAUTHORIZED=false`, conforme exigido por hospedagens sem certificado CA local.

A tentativa de conexão externa a partir do ambiente de teste retornou:

```text
getaddrinfo EAI_AGAIN mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
```

Isso indica falha temporária/externa de resolução DNS no ambiente de execução, antes de autenticar no MySQL. Portanto, a conexão real com o Aiven deve ser validada no Render ou em uma máquina com DNS/rede liberados usando:

```bash
cd backend
npm run db:test
```

## Testes locais executados com backend

Como a resolução DNS do Aiven falhou no ambiente de teste, também foi executado teste funcional local do backend com persistência em arquivo (`REQUIRE_DATABASE=false`) para validar a lógica do sistema.

Passaram os seguintes testes:

- `/api/health` respondeu com sucesso.
- `/api/me` retornou usuário nulo antes do login.
- Cadastro de morador pendente via `/auth/signup`.
- Persistência do cadastro pendente em `/api/state`.
- Login de síndico/admin temporário.
- Aprovação do morador.
- Ativação da conta do morador aprovado.
- Cadastro de encomenda via `/api/packages`.
- Cadastro de reserva via `/api/reservations`.
- Persistência da encomenda em `/api/state`.
- Persistência da reserva em `/api/state`.
- Login do morador aprovado com a senha cadastrada.
- Sessão do morador retornada por `/api/me`.

## Observação

A aplicação está preparada para operar com MySQL/Aiven em produção. Para garantir persistência real no Aiven, confirme no Render que `/api/db/status` mostra `ready: true` depois do deploy.
