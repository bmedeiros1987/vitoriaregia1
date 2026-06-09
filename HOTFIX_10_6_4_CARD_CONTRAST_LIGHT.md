# CrewCheck v10.6.7 — Correção de contraste dos cards no tema claro

Correções aplicadas:

- Corrigido contraste dos textos dentro dos cards no tema claro.
- Cards claros agora usam texto escuro/preto visível.
- Mantido texto claro apenas nas áreas de destaque/hero com fundo escuro.
- Ajustada tela de importação PDF para não deixar texto branco em cards brancos.
- Mantidas correções da v10.6.7: rotina na escala inteira, alertas clicáveis, safe-area/notch e menu Android.

Validação:

```bash
npm run check
npm run build
node --check server.mjs
```
