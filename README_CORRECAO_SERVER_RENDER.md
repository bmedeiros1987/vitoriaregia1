# Correção Render — backend/src/server.js ausente

Este update restaura `backend/src/server.js`, que é o arquivo de entrada usado pelo Render.

Erro corrigido:

```txt
Cannot find module '/opt/render/project/src/backend/src/server.js'
```

## O que foi feito

- Recriado `backend/src/server.js` com servidor Express de recuperação.
- Mantidos endpoints essenciais do frontend.
- Carregadas rotas de notificações e botão de pânico quando disponíveis.
- Servido o frontend estático a partir da raiz do projeto.
- Mantido o `vitoriaregia_update.zip` completo com os updates anteriores.

## Importante

Este servidor é uma restauração segura para o sistema voltar a subir. Depois que o diretório completo for restaurado a partir do GitHub, ele pode ser substituído pelo `server.js` completo original.
