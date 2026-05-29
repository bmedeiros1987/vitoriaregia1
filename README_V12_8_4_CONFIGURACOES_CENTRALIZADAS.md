# Vitória Régia Pro v12.8.4 — Configurações Centralizadas

Esta versão reorganiza o menu para manter a navegação principal mais limpa e concentra todos os itens administrativos em **Configurações**.

## Ajustes principais

- Remove **Sistema e Apps** e **Atualizações** do menu lateral principal.
- Mantém no menu apenas áreas operacionais: Início, Portaria, Reservas, Financeiro, Cadastros, Comunicação, Ocorrências, Emergência, Suporte e Configurações.
- Move Apps/APKs, Manuais, Documentos, Atualizações, Banco, Auditoria e limites administrativos para abas dentro de **Configurações**.
- Adiciona aba **Limites e Regras**, com controles para:
  - permitir ou bloquear mais de um morador por unidade;
  - limite de moradores por unidade;
  - limite de convidados por reserva;
  - limite de visitantes por dia;
  - limite de upload de documentos/APKs;
  - limite de upload de atualização;
  - retenção de encomendas entregues.
- Ajusta atalhos antigos de `#/central`, `#/apps`, `#/updates`, `#/manuais` e `#/documentos` para abrirem automaticamente a aba correta em **Configurações**.
- Mantém a Central Premium de APKs dentro de **Configurações > Apps/APKs**.

## Validações feitas

- Build do frontend com Vite.
- Checagem sintática do backend com `node --check`.
- Conferência de rotas antigas redirecionadas para Configurações.
- Conferência do menu principal sem entradas duplicadas de sistema/atualização.
