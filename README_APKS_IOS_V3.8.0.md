# Vitória Régia v3.8.0 — Apps Android e iOS

## Android

O projeto contém três aplicativos Android WebView:

- `android-morador/`
- `android-sindico/`
- `android-portaria/`

O GitHub Actions contém o workflow:

- `.github/workflows/build-mobile-apps.yml`

Depois de enviar o sistema para o GitHub, acesse:

**Actions → Gerar APKs Android Vitória Régia → Run workflow**

Ao finalizar, baixe os APKs em **Artifacts** ou na release `apps-v3.8.0`:

- `vitoria-regia-morador-v3.8.0.apk`
- `vitoria-regia-sindico-v3.8.0.apk`
- `vitoria-regia-portaria-v3.8.0.apk`

## iPhone / iPad

Esta versão também está preparada como PWA, que permite instalar o sistema na tela inicial do iPhone pelo Safari.

Caminho simples para o usuário:

1. Abrir o site no Safari.
2. Tocar no botão de compartilhar.
3. Escolher **Adicionar à Tela de Início**.
4. Confirmar o nome **Vitória Régia**.

Para publicar como app iOS na App Store/TestFlight, use a pasta `ios-vitoria-regia/` como base do app WebView e finalize no Xcode com sua conta Apple Developer.
