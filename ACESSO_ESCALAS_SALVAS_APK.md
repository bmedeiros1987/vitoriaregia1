# CrewCheck v10.2 — Acesso rápido a escalas salvas no APK

Esta versão adiciona uma área de **Escalas salvas** logo após o login.

## Como funciona

- O usuário faz login.
- A tela inicial busca as últimas escalas salvas no banco MySQL/Aiven.
- Se o banco estiver indisponível, usa o histórico local do próprio aparelho.
- A última escala aparece em destaque com o botão **Abrir**.
- Ao abrir, a escala é carregada na tela de resultados sem selecionar novo PDF.
- O APK usa o mesmo fluxo via WebView, mantendo acesso ao histórico local do dispositivo.

## Deduplicação

As escalas são salvas por checksum. Se a mesma escala for importada novamente, o sistema atualiza/retorna a já existente sem duplicar.

## Banco indisponível

Se o banco cair, o CrewCheck mantém histórico local e mostra o status **Histórico local**. Quando o banco voltar, o usuário pode sincronizar pendências.
