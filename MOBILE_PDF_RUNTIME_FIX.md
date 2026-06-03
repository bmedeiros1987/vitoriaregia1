# Correção do erro `TypeError: Illegal constructor` no Android/iOS

Esta versão remove o carregamento estático do PDF.js no bundle inicial e passa a carregar o leitor de PDF apenas no momento do upload.

Mudanças aplicadas:

- `pdfjs-dist` não é mais importado no topo do app.
- O parser usa `dynamic import()` somente quando o usuário seleciona um PDF.
- O worker do PDF.js é desativado no mobile (`disableWorker: true`) para evitar falhas de inicialização em Chrome Android, Safari iOS e PWA.
- A leitura do arquivo mantém fallback com `FileReader`.
- O erro passa a ficar isolado no upload, não derruba a tela inteira do sistema.

Após publicar, limpar o cache do Chrome/PWA se o navegador ainda estiver carregando o asset antigo.
