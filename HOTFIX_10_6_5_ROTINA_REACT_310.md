# CrewCheck v10.6.7 — correção React #310 na Rotina

Correção aplicada na tela de resultados/rotina.

## Problema

Ao abrir a aba **Rotina**, a versão anterior podia gerar o erro minificado do React #310.

## Causa

Um `useMemo` usado para gerar as sugestões de rotina ficava depois de um retorno condicional (`if (!roster || !compliance) return null`). Na primeira renderização, antes da escala ser carregada, esse hook não era chamado; depois, quando a escala carregava, ele passava a ser chamado, alterando a ordem dos hooks.

## Correção

- A análise de carga e as sugestões de rotina agora são calculadas antes do retorno condicional.
- Foi adicionado fallback vazio seguro enquanto a escala ainda está carregando.
- Mantidas as melhorias de rotina na escala inteira, alertas clicáveis, tema claro/escuro e safe-area/notch.

## Validação

- `npm run check`
- `npm run build`
- `node --check server.mjs`
