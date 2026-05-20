# Vitória Régia — Sistema Condominial Completo

Versão premium com layout profissional, tela de login por perfil e backend preparado para PostgreSQL/Aiven.

## O que está incluído

- Tela inicial de login por perfil: Morador, Síndico/Administração e Portaria.
- Login com Google preparado no backend Node.js.
- Solicitação de cadastro de morador com nome, e-mail, WhatsApp e apartamento.
- Fluxo de aprovação: o síndico aprova ou recusa cadastros.
- Unidades geradas automaticamente: 101, 102, 103, 201, 202, 203... até 1101, 1102 e 1103.
- Cadastro manual de moradores pelo síndico.
- Cadastro de visitantes pela portaria com upload/captura de foto.
- Registro de encomendas e aviso via WhatsApp/e-mail.
- Solicitação de reserva de espaço por morador.
- Pré-agendamento bloqueia a data/período para evitar duplicidade.
- Apenas o síndico vê a unidade no calendário, modifica, cancela ou valida a reserva.
- Calendário visual com estados: disponível, pré-agendado e ocupado.
- Síndico define valores das taxas por espaço.
- Gerador de boleto/recibo demonstrativo para reservas.
- Upload de documento da reserva pelo síndico.
- Upload de documento/comprovante pelo morador.
- Assinatura digital simples por checkbox: “Assino e dou fé”.
- Comunicados do condomínio.
- Exportação CSV de moradores.
- Sincronização com banco PostgreSQL por meio da tabela `client_state`.

## Como rodar vinculado ao banco Aiven

A configuração do Aiven foi deixada em:

```text
backend/.env.aiven.example
```

Ela já contém:

```text
PGHOST=vitoriaregia1-vitoriaregia1.f.aivencloud.com
PGPORT=22968
PGDATABASE=vitoriaregia1
PGUSER=bmedeiros1987@gmail.com
```

Você precisa completar apenas a senha real do banco, certificados e dados do Google OAuth.

### Passo a passo

```bash
cd backend
npm install
cp .env.aiven.example .env
```

Edite o `.env` e preencha:

- `PGPASSWORD`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAILS`
- `PORTARIA_EMAILS`, se houver

Depois coloque os certificados em:

```text
backend/certs/ca.pem
backend/certs/client-cert.pem
backend/certs/client-key.pem
```

Teste a conexão:

```bash
npm run db:test
```

Crie o banco, se ele ainda não existir:

```bash
npm run db:create
```

Crie as tabelas:

```bash
npm run db:init
```

Inicie o sistema:

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

## Publicação em host

Para o sistema usar banco de dados, o host precisa aceitar Node.js. Suba a pasta completa e configure as variáveis de ambiente do backend.

Em host apenas estático, envie estes arquivos para a pasta pública:

- `index.html`
- `styles.css`
- `app.js`
- `assets/`
- `site.webmanifest`

Nesse caso, o sistema funciona somente no modo local/demonstração, sem banco compartilhado.

## Importante sobre boleto

O boleto gerado nesta versão é demonstrativo/recibo interno, não é boleto bancário registrado. Para pagamento real, será necessário integrar com banco ou gateway, como Asaas, Gerencianet/Efi, Itaú, Sicredi, Sicoob, Banco do Brasil etc.

## Segurança

Nunca publique chaves privadas, certificados, senhas do banco, Client Secret do Google ou arquivos `.env` em repositório público.

Como credenciais foram compartilhadas no chat, recomendo gerar novas credenciais/certificados na Aiven antes de colocar o sistema em produção.

## Correção de layout v1.1

Esta versão corrige o menu lateral para não sobrepor o conteúdo no desktop e ajusta o calendário para exibir a grade mensal completa, com rolagem horizontal em telas menores.

## Atualização de layout v1.2

Esta versão corrige a sobreposição do menu lateral e melhora a exibição do calendário:

- no desktop, o menu lateral agora ocupa uma coluna própria e não cobre o conteúdo;
- em telas menores, o menu abre como gaveta lateral;
- o calendário mensal ocupa toda a largura disponível;
- no celular, o calendário possui rolagem horizontal para preservar a grade completa de 7 dias.

## Atualização v1.3 — Configurações de e-mail e WhatsApp automáticos

Esta versão inclui, dentro do menu **Configurações** do síndico:

- ativação/desativação de envio automático por e-mail;
- configuração SMTP/Gmail com senha de aplicativo;
- teste de envio de e-mail;
- ativação/desativação de envio automático por WhatsApp;
- configuração da WhatsApp Business Cloud API da Meta;
- teste de envio de WhatsApp;
- regras para avisar automaticamente sobre cadastro de morador, reserva, visitante e encomenda;
- logs de notificação no banco de dados na tabela `notification_logs`.

Para o e-mail funcionar com Gmail, use uma **senha de aplicativo** do Google no campo de senha SMTP. Não use a senha normal da conta.

Para o WhatsApp funcionar automaticamente, é necessário configurar a **WhatsApp Business Cloud API** com `Phone Number ID` e `Token` válidos. Em alguns casos, mensagens para números fora da janela de atendimento exigem template aprovado pela Meta.

Depois de atualizar esta versão, execute novamente:

```bash
cd backend
npm install
npm run db:init
npm start
```

As credenciais de e-mail e WhatsApp podem ser preenchidas pela própria tela de Configurações do síndico. Elas são salvas no banco na tabela `app_settings`. Em produção, restrinja o acesso ao perfil de síndico e use HTTPS.


## Banco operacional

Esta versão inclui backend PostgreSQL/Aiven. Veja o arquivo `README_BANCO_OPERACIONAL.md` para configurar o Render, criar tabelas e salvar dados reais do sistema.

Configuração rápida no Render:

```bash
Build Command: cd backend && npm install
Start Command: cd backend && npm start
```

As senhas devem ficar apenas em **Environment Variables** do Render, nunca no GitHub.


## Banco real em produção

Para parar de usar dados de demonstração e operar com PostgreSQL/Aiven, veja `README_BANCO_REAL_AIVEN.md`. Esta versão exige `REQUIRE_DATABASE=true` no Render e só inicia corretamente quando o banco estiver conectado.


## Usuário temporário de implantação

Para iniciar o sistema sem modo demo, configure no Render:

```env
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=seuemail@gmail.com
BOOTSTRAP_ADMIN_PASSWORD=crie_uma_senha_forte_temporaria
BOOTSTRAP_ADMIN_NAME=Usuário temporário de implantação
BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO=true
```

O acesso temporário entra como **Síndico / Administração**. Depois de cadastrar um síndico ou subsíndico ativo em **Equipe**, o acesso temporário é bloqueado automaticamente.

Leia também `README_USUARIO_TEMPORARIO.md`.
