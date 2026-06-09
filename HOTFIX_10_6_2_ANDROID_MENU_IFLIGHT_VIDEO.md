# CrewCheck v10.6.7 — Android menu fixo, rodapé seguro e iFlight pelo caminho do vídeo

## Ajustes principais

- Rodapé/versão no Android reposicionado para não cobrir o menu inferior.
- Menu inferior global mantido em todas as telas principais do app Android/WebView.
- Tema claro preservado e compatível com o novo menu.
- Tela iFlight simplificada: botão principal mais direto e menos texto.
- Fluxo iFlight ajustado para quando a sessão já está autenticada, sem exigir novo login.
- Removido banner injetado no rodapé do iFlight, que podia cobrir botões como `Roster Report`.
- Automação reforçada conforme o caminho visto no vídeo:
  1. Menu do iFlight.
  2. Roster.
  3. Roster Calendar.
  4. Roster Report.
  5. Datas do mês.
  6. PDF.
  7. LT.
  8. Run.
- Captura de PDF melhorada para respostas `fetch`, `XMLHttpRequest`, `blob:` e conteúdo iniciado por `%PDF`.
- Continua sem clicar em `Send`.
- Continua sem salvar usuário, senha, MFA, cookies ou sessão corporativa.

## Validação

- `npm run check`
- `npm run build`
- `node --check server.mjs`
