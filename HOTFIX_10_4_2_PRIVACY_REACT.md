# CrewCheck 10.4.2 — Hotfix Play Console + React

## Corrigido

1. **Erro React minificado #310**
   - Causa: um `useEffect` de salvamento automático ficava depois de um retorno condicional em `Results.tsx`.
   - Correção: todos os hooks do componente principal agora executam antes de qualquer `return null`, mantendo a mesma ordem de hooks em todos os renders.

2. **Política de Privacidade para Google Play**
   - Rota pública dentro do app: `/privacy`.
   - Página estática pública: `/privacy.html`.
   - URL recomendada no Play Console: `https://crewcheck.online/privacy.html`.
   - URL alternativa: `https://crewcheck.online/privacy`.

3. **Link dentro do app**
   - A tela de login agora exibe links para Política de Privacidade e Termos de Uso.

## Validação local executada

```bash
npm run check
npm run build
node --check server.mjs
```

Também foi validado que `/privacy`, `/privacy.html` e `/healthz` respondem HTTP 200 no servidor local.
