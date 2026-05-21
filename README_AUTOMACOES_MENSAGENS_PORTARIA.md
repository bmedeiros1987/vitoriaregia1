# Automações de mensagens da portaria

Esta versão adiciona a aba **Automações** para síndico, portaria e moradores.

## Fluxos incluídos

- Aviso de encomenda ou delivery na portaria.
- Solicitação para autorizar envio da encomenda pelo elevador.
- Solicitação para autorizar visitante.
- Solicitação de código iFood/delivery.
- Notificação geral da portaria.
- Notificação do síndico.

## Como funciona

1. A portaria ou o síndico abre a aba **Automações**.
2. Seleciona a unidade, o tipo de solicitação e o canal de envio.
3. O sistema cria uma solicitação e envia aviso automático por WhatsApp/e-mail, se as integrações estiverem ativas.
4. O morador visualiza apenas as solicitações da própria unidade.
5. O morador pode autorizar, negar ou informar o código do delivery.
6. A resposta é registrada e enviada para os contatos da portaria/síndico configurados na aba Usuários.

## Variáveis recomendadas no Render para WhatsApp/Periskope

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=periskope
PERISKOPE_BASE_URL=https://api.periskope.app/v1
PERISKOPE_API_KEY=SUA_API_KEY_SEM_BEARER
PERISKOPE_PHONE=55NUMERO_CONECTADO_NO_PERISKOPE
PERISKOPE_COUNTRY_CODE=55
PERISKOPE_HIDE_URL_PREVIEW=true
```

## Observações

- O sistema não expõe telefone ou e-mail dos moradores para outros moradores.
- As solicitações ficam persistidas no estado do sistema e sincronizadas com o MySQL.
- Para respostas automáticas chegarem na portaria, cadastre e-mail/WhatsApp dos porteiros e síndicos na aba **Usuários**.
- A regra **Enviar automaticamente as solicitações da portaria para moradores** pode ser ligada/desligada em Configurações > Regras de notificação.
