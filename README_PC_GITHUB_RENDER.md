# Vitória Régia Pro v9.4 - pacote vendável

Sistema completo para condomínio com painel web, PWA e projetos Android WebView para Portaria, Síndico e Morador.

## Principais módulos

- Painel inicial com indicadores alinhados e clima obtido pelo servidor.
- Calendário de reservas com bloqueio de data, exportação Google Calendar e ICS.
- Pré-agendamento de reservas, aceite digital de normas e geração de cobrança interna.
- Financeiro por unidade, vínculo de boleto de qualquer banco por linha digitável, link ou PDF.
- Visitantes recorrentes com dias da semana, foto, unidade, placa e regra de anúncio.
- Encomendas com OCR, vínculo automático ao morador, código de retirada e preferência de entrega.
- Notificações por sistema, navegador/PWA, e-mail/SendGrid, Telegram e WhatsApp Cloud API.
- Funcionários e escalas; mensagem do morador é direcionada ao funcionário em serviço.
- Emergência com aprovação por síndico/portaria; alerta geral apenas para fogo ou invasão.
- Cadastro pela tela de login, aprovação pelo síndico, senha temporária e recuperação de senha.
- Controle de acesso por perfil e por permissão.
- Configurações simplificadas por subcategorias.

## Publicar no GitHub pelo Mac

```bash
cd ~/Downloads
unzip -o vitoriaregia_pro_v9_4_migracao_banco_corrigida.zip
cd vitoriaregia_pro_v9_4_migracao_banco_corrigida
chmod +x publicar_github_mac_linux.sh
bash publicar_github_mac_linux.sh
```

Use o repositório:

```text
https://github.com/bmedeiros1987/vitoriaregia1.git
```

Branch:

```text
main
```

O script publica somente a pasta `sistema`, removendo `.env`, `node_modules`, `dist`, `server/public`, certificados, logs, bancos locais e arquivos sensíveis.

## Configurar no Render

Root Directory:

```text
deixe vazio
```

Build Command:

```bash
npm install --no-audit --no-fund && npm run build
```

Start Command:

```bash
npm start
```

Copie as variáveis do arquivo `RENDER_CONFIGURACAO.txt`.

## Gerar APKs Android

Depois que o sistema estiver no GitHub:

```text
GitHub -> Actions -> Gerar APKs Android Vitória Régia Pro -> Run workflow
```

Serão gerados:

- vitoria-regia-portaria-v9.4.apk
- vitoria-regia-sindico-v9.4.apk
- vitoria-regia-morador-v9.4.apk

Antes de gerar APKs para cliente real, ajuste a URL do Render:

```bash
bash scripts/alterar_url_android.sh
```

## Primeiro acesso

Se você não definir `ADMIN_EMAIL` e `ADMIN_PASSWORD` no Render, o acesso padrão é:

```text
admin@vitoriaregia.local
123456
```

Troque antes de vender ou entregar ao cliente.


## Novidades v9.4

- Usuário Master acima do síndico.
- Liberação comercial de e-mail, WhatsApp, Telegram e notificações do navegador.
- Liberação de APKs Portaria, Síndico e Morador.
- Cadastro exibe somente os canais liberados.
- Banco para boleto configurável pelo Master, com modo manual ou conector preparado para API.
