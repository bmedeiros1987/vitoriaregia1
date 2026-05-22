# Correção do erro Not Found no Render

Este pacote corrige o caso em que o Render abre o site, mas rotas internas ou APIs retornam `Not Found` porque o backend foi publicado sem o `backend/src/server.js` completo.

## O que foi ajustado

- Restaura `backend/src/server.js` com servidor de recuperação seguro.
- Garante que o backend sirva o `index.html` para rotas internas do sistema.
- Mantém endpoints básicos para login, estado, moradores, reservas, visitantes, encomendas e comunicados.
- Mantém rotas de notificações e botão de pânico quando os arquivos estiverem presentes.
- Define `FRONTEND_DIR=/opt/render/project/src` no Render para o backend encontrar o frontend corretamente.
- Define `REQUIRE_DATABASE=false` para o site não sair do ar se o banco oscilar.

## Como aplicar

Use o atualizador profissional:

```bash
cd /storage/emulated/0/Download
bash atualizador_profissional_vitoriaregia.sh repair
```

Depois faça Manual Deploy no Render.
