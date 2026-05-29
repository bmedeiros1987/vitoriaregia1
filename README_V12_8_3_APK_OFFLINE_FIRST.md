# Vitória Régia Pro v12.8.3 — APK Offline First Premium

Esta versão prepara o sistema para APKs offline-first sem duplicidade de cadastros e com política segura de emergência.

## Incluído

- Central de aplicativos com explicação premium sobre APK offline-first.
- Logo padrão do sistema mantido nos cards e no manifesto dos APKs.
- Endpoint `/api/apps/manifest` para o APK consultar versão, logos, política offline e links de atualização.
- Configurações novas em Configurações > Apps:
  - APK_OFFLINE_FIRST_ENABLED
  - APK_CURRENT_VERSION
  - APK_EMERGENCY_OFFLINE_ENABLED sempre tratado como bloqueado.
- Emergência bloqueada quando o dispositivo estiver offline.
- Deduplicação de solicitações de cadastro vindas do APK offline:
  - `client_offline_id` único quando informado;
  - fallback por e-mail, documento, telefone, Telegram, unidade e nome;
  - quando houver duplicidade, o servidor retorna a solicitação existente em vez de criar outra.

## Regra de atualização dos APKs

- Quando o APK for WebView/PWA apontando para o sistema online, atualizações do sistema passam a aparecer no APK após deploy e reload.
- Quando houver mudança nativa de Android, como ícone, permissões, câmera, banco local ou sincronizador, será necessário gerar nova versão APK/AAB e publicar na Central de APKs ou Google Play.

## Segurança

O botão de emergência não entra em fila offline. Ele exige internet ativa para avisar portaria, síndico e Telegram em tempo real.
