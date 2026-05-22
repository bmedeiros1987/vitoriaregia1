# App iOS — Vitória Régia

Esta pasta contém o código-base SwiftUI/WKWebView para criar o aplicativo iOS do sistema Vitória Régia.

## O que já está pronto

- Tela WebView apontando para o sistema online.
- Permissão de câmera e galeria para visitantes/encomendas.
- Abertura externa para telefone, e-mail e WhatsApp.
- Base preparada para TestFlight/App Store.

## Como gerar o app iOS

1. Abra o Xcode em um Mac.
2. Crie um projeto iOS do tipo **App** com SwiftUI.
3. Use o nome **Vitória Régia**.
4. Substitua os arquivos `ContentView.swift`, `VitoriaRegiaApp.swift` e `Info.plist` pelos arquivos desta pasta.
5. Configure o Bundle Identifier, por exemplo: `br.com.vitoriaregia.app`.
6. Assine com sua conta Apple Developer.
7. Gere o build para TestFlight ou App Store.

## Alternativa imediata para iPhone

Como o sistema também é PWA, o usuário pode instalar pelo Safari usando:

**Compartilhar → Adicionar à Tela de Início**.
