# Recuperação do Financeiro — v3.5.0-mysql

Esta versão recupera o módulo **Financeiro** perdido na migração anterior.

Inclui:

- menu Financeiro para síndico, subsíndico, administrador e proprietário;
- visão do morador com cobranças da própria unidade;
- lançamento de receitas;
- lançamento de despesas;
- livro caixa;
- cobranças por unidade;
- marcar cobrança como paga;
- notificação da cobrança para a unidade;
- manutenção da base MySQL via `app_state`.

## Observação

Esta versão reconstrói o módulo financeiro de forma segura. Caso exista uma versão antiga com regras financeiras mais específicas, ela pode ser comparada depois e incorporada sem perder esta base atual.
