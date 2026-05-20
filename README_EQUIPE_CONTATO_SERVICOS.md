# Atualização — Equipe, contato protegido e serviços

Esta versão adiciona os módulos solicitados para tornar a operação do condomínio mais completa:

## 1. Equipe interna

Menu: **Equipe**

Apenas o perfil **Síndico/Administração** pode acessar e alterar:

- Síndico;
- Subsíndico;
- Porteiros;
- e-mail interno;
- WhatsApp interno;
- status ativo/inativo;
- observações internas/escala.

Os contatos cadastrados não são exibidos para moradores.

## 2. Contato protegido

Menu: **Contato**

O morador pode enviar mensagem para:

- Síndico/Subsíndico;
- Portaria.

O sistema tenta enviar por e-mail automático ou WhatsApp automático usando as integrações configuradas, sem revelar o número ou e-mail dos destinatários internos ao morador.

Se o backend/integracao não estiver configurado, a mensagem fica registrada no sistema.

## 3. Serviços e compras

Menu: **Serviços**

O síndico pode cadastrar serviços/produtos, por exemplo:

- controle-remoto de portão;
- tag/cartão de acesso;
- segunda via de documento;
- outros serviços internos do condomínio.

O morador pode solicitar a compra/serviço pelo sistema. O síndico pode aprovar ou cancelar a solicitação.

## 4. Observação sobre envio automático

Para que o contato protegido envie automaticamente, configure no Render:

- MailerSend API ou SMTP/Gmail;
- WhatsApp Business Cloud API, se quiser envio automático por WhatsApp.

As credenciais devem ficar somente em **Render → Environment Variables** ou no painel de configurações do sistema, nunca no GitHub.
