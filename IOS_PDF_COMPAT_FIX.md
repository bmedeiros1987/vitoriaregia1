# Correção de PDF no iOS/Safari

Esta versão troca o leitor PDF para `pdfjs-dist 3.11.174` com build legacy.

Motivo: algumas versões do iOS/Safari não suportam APIs modernas usadas pelo PDF.js 5.x, gerando erro como:

```text
undefined is not a function
```

A leitura agora usa:

- `FileReader` como fallback para arquivos do app Arquivos/iCloud;
- build legacy do PDF.js;
- worker `.js` compatível;
- flags de compatibilidade para reduzir falhas de fonte/eval no Safari.

Ainda é recomendado, no iPhone, salvar o PDF no app Arquivos antes de importar.
