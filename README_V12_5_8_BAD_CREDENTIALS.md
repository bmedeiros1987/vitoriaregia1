# Vitória Régia Pro v12.5.8

Correção cumulativa para atualização pelo sistema quando o GitHub retorna `Bad credentials`.

## Inclui

- Mensagem de erro clara quando o token GitHub é inválido ou sem permissão.
- Tela de Configurações > Atualizações com campos para modo, repositório, branch, token e deploy hook.
- Botão **Testar GitHub** antes de aplicar uma atualização.
- Remoção automática de prefixo `Bearer` caso ele seja colado junto com o token.
- Mantém as correções anteriores de Reservas, Comunicações, Telegram, Suporte e Encomendas.

## Token necessário

No GitHub, use um token com acesso ao repositório e permissão **Contents: Read and write**.
