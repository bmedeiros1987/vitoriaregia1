# Vitória Régia Pro v12.7.5 — Senha temporária e Mobile/Tablet Premium

Esta versão é cumulativa sobre a v12.7.4.

## Correções

- Recuperação de senha agora mostra retorno claro ao usuário.
- Ao solicitar senha temporária, o sistema confirma a solicitação e retorna automaticamente para a tela de login.
- O e-mail digitado na tela inicial é reaproveitado automaticamente na tela de recuperação.
- Envio de senha temporária por Telegram foi ajustado para usar o Chat ID vinculado ao usuário ou ao morador relacionado.
- Quando não houver Telegram vinculado, o sistema trata o canal como pendente em vez de falhar silenciosamente.

## Layout Premium Mobile/Tablet

- Ajustes para celular e tablet em modo vertical e horizontal.
- Rodapé corrigido para não quebrar em telas estreitas.
- Tabelas viram cards em celular.
- Menus, abas, formulários e ações foram ajustados para toque.
- Adicionado aviso premium recomendando modo horizontal em celular para tabelas, reservas e financeiro.
- Tablet em modo paisagem fica mais próximo da experiência desktop.

## Validação técnica

- `npm run build` executado com sucesso no frontend.
- `node --check server/src/index.js` executado com sucesso no backend.
