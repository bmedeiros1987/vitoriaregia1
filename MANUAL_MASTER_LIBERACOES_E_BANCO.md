# Manual rápido — Usuário Master, liberações e banco

## 1. Entrar como Master

Use o usuário definido no Render por `MASTER_EMAIL` e `MASTER_PASSWORD`. Se ainda não configurou, a versão cria o acesso inicial `master@vitoriaregia.local` com senha `123456`. Altere antes de vender ou colocar em produção.

## 2. Liberar canais de comunicação

Acesse **Configurações → Master** e marque os canais que o condomínio contratou:

- E-mail / SendGrid
- WhatsApp
- Telegram
- Notificação do navegador

Quando um canal está bloqueado pelo Master, ele deixa de aparecer no cadastro e deixa de ser usado no envio de notificações.

## 3. Liberar aplicativos

Em **Configurações → Master**, marque quais apps estão liberados:

- Portaria APK
- Síndico APK
- Morador APK

A tela **Apps** passa a exibir apenas os apps liberados para síndicos e usuários comuns.

## 4. Cadastro de usuários conforme canais liberados

Depois que o Master libera e-mail, WhatsApp ou Telegram, a tela de cadastro passa a mostrar apenas os campos correspondentes. Isso vale para:

- cadastro pela tela de login;
- cadastro de moradores;
- cadastro de usuários internos.

## 5. Banco para boletos

Acesse **Configurações → Banco**. Escolha:

- Manual / qualquer banco: permite colar boleto, linha digitável, código de barras, PDF ou link;
- Efí / Gerencianet, Sicoob, Sicredi, Inter, Asaas ou Outro via API: prepara a emissão automática pelo banco/gateway escolhido.

Segredos bancários, certificados e tokens devem ficar somente nas variáveis do Render. Nunca coloque essas informações no GitHub.
