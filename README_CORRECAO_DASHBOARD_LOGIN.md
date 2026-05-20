# Correção: dashboard bloqueado fora do login

Esta versão reforça o bloqueio do dashboard para que a página inicial mostre apenas login e senha até existir uma sessão válida criada pelo fluxo de autenticação.

## Ajustes aplicados

- O HTML continua iniciando com `html.auth-locked`.
- O app/dashboard permanece com `display: none !important`, `visibility: hidden` e `pointer-events: none` enquanto o usuário não estiver autenticado.
- O JavaScript adiciona `body.vr-authenticated` somente depois de login válido.
- Hashes diretos como `/#dashboard`, `/#encomendas` ou `/#configuracoes` são removidos quando não há sessão.
- A página não restaura o dashboard automaticamente por cookie, localStorage ou refresh antigo.
- O dashboard só é liberado por `startSession()` após resposta válida do backend de login.

## Teste rápido

1. Abra `/` em janela anônima: deve aparecer apenas a tela de login.
2. Abra `/#dashboard`: deve voltar para `/` e continuar apenas no login.
3. Atualize a página sem estar logado: o dashboard não deve aparecer.
4. Faça login válido: o dashboard abre normalmente.
5. Clique em sair: volta ao login e o dashboard fica oculto.
