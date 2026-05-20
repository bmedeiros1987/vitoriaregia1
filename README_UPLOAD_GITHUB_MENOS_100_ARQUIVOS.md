# Vitória Régia — pacote reduzido para upload no GitHub

Este pacote foi reduzido para ficar abaixo do limite de 100 arquivos no upload manual do GitHub.

## O que foi removido

- READMEs antigos/duplicados de correções anteriores.
- ZIPs internos dos apps Android na pasta `downloads/`.
- Workflows duplicados do GitHub Actions.
- READMEs internos dos projetos Android.

## O que foi mantido

- Sistema web: `index.html`, `app.js`, `styles.css`, `assets/`.
- Backend Node/Express: `backend/`.
- Banco MySQL/Aiven.
- Login bloqueando dashboard sem autenticação.
- Correção da senha temporária do Leandro.
- Usuários/perfis e permissões por abas.
- WhatsApp/Periskope.
- Supabase Storage para fotos/documentos na nuvem.
- Apps Android Portaria e Morador em código-fonte.
- Workflow principal `.github/workflows/main.yml` para gerar os APKs.

## Como subir pelo GitHub Web

1. Extraia este ZIP no computador/celular.
2. No GitHub, entre no repositório.
3. Clique em **Add file > Upload files**.
4. Arraste o conteúdo extraído, não o ZIP fechado.
5. Faça o commit.

## Render

O `render.yaml` usa `rootDir: backend`. No Render, mantenha as variáveis de ambiente sensíveis somente no painel do Render, nunca no GitHub.
