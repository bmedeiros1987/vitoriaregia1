# Vitória Régia v3.6.0 — Módulos restaurados

Esta versão foi montada a partir do ZIP antigo enviado pelo usuário: `vitoria_regia_automacoes_mensagens_portaria(1).zip`.

## Objetivo

Recuperar os módulos que foram perdidos na migração para a versão nova, mantendo a base MySQL e a estrutura completa do site.

## Módulos restaurados

- Financeiro completo com boletos/reservas, gastos fixos, gastos casuais, reserva financeira, notas e lançamentos públicos.
- Serviços.
- Contato.
- Automações e mensagens da portaria para moradores.
- Visitantes recorrentes.
- Encomendas com leitura automática da etiqueta/nota.
- Atividades/logs da portaria.
- Arquivos/nuvem.
- Comunicados.
- Escala.
- Calendário.
- Central premium.
- Configurações avançadas de e-mail, WhatsApp, boletos e armazenamento externo.
- Apps Android de portaria e moradores.

## Alteração de linguagem

O termo técnico “OCR” foi trocado nas telas por “leitura automática da etiqueta/nota”, para facilitar o entendimento do usuário comum.

## Banco de dados

A base foi mantida em MySQL. No Render, configure as variáveis `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL=true` e `MYSQL_SSL_REJECT_UNAUTHORIZED=false`.

`REQUIRE_DATABASE=false` foi deixado como padrão no `render.yaml` para evitar que uma instabilidade temporária do banco derrube todo o site. Em produção estável, pode ser alterado para `true`.

## Arquivos críticos

Antes do deploy, confirme que existem:

- `index.html`
- `app.js`
- `styles.css`
- `backend/package.json`
- `backend/src/server.js`
- `backend/src/db.js`
- `backend/src/schema.js`
- `render.yaml`
- `VERSION.json`
