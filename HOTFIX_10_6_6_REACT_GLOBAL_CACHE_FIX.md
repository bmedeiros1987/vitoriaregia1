# CrewCheck v10.6.7 — Correção global React/cache

Esta versão reforça a estabilidade global do sistema após relato de erro React #310 em várias telas.

## Ajustes

- Versão atualizada para 10.6.7.
- Service Worker atualizado para `crewcheck-v10-6-6-global-react-cache-fix`.
- JS/CSS agora usam rede-primeiro para evitar execução de bundles antigos misturados com HTML novo.
- Limpeza automática de caches antigos `crewcheck-*` na ativação do service worker.
- App tenta atualizar o service worker ao iniciar.
- ErrorBoundary premium com botões:
  - Atualizar app;
  - Limpar sessão da escala.
- A limpeza preserva login, tema, idioma e perfil, mas remove sessão de escala possivelmente corrompida.

## Observação

Se o navegador ou Android já estava com bundle antigo em cache, pode ser necessário tocar em “Atualizar app” ou limpar cache do app uma vez após instalar/publicar esta versão.
