# APK offline / PWA

Esta versão já está preparada como **PWA offline-first**. Após abrir o site no Chrome Android, o usuário pode instalar como app:

1. Abrir o site no Chrome.
2. Menu ⋮.
3. “Adicionar à tela inicial” ou “Instalar app”.
4. Depois de instalado, o app abre em tela cheia e usa cache offline.

## Como funciona offline

- O PDF pode ser analisado no aparelho.
- A análise fica no navegador enquanto estiver sem internet.
- Ao salvar, se o banco estiver indisponível, a escala entra em fila local.
- Ao voltar a internet, clique em **Sincronizar**.
- O backend usa `checksum` para evitar duplicidade no banco.

## APK nativo

Para gerar APK nativo assinado, use Capacitor/Android Studio a partir deste projeto. O pacote web já está pronto para isso, mas o APK binário precisa ser compilado em ambiente com Android SDK/Gradle.

Comandos sugeridos fora do Termux, em PC com Android Studio:

```bash
yarn install
yarn build
npx cap init CrewCheck br.com.crewcheck.app --web-dir=dist
npx cap add android
npx cap sync android
npx cap open android
```

No Android Studio, gere o APK em **Build > Build Bundle(s) / APK(s)**.
