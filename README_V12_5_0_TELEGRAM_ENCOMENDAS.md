# Vitória Régia Pro v12.5.0

Correções aplicadas:

- Telegram agora é disparado também para notificações internas criadas diretamente pelo sistema, não apenas em teste/configurações, emergência e fluxos específicos.
- Mantido o envio consolidado por `notifyResident` e `notifyStaff` sem duplicar mensagens.
- Corrigida a migração da tabela `packages` para bancos antigos, adicionando as colunas usadas pelos botões de entrega:
  - `staff_delivered_at`
  - `resident_delivered_at`
  - `delivered_by_staff`
  - `delivered_by_resident`
- Mantidas as correções anteriores de Reservas e upload de ZIP de atualização.

Após subir no Render, faça novo deploy e teste:

1. Configurações > Telegram > Testar Telegram.
2. Cadastrar uma ocorrência ou suporte para confirmar envio fora do botão de emergência.
3. Encomendas > confirmar entrega.
