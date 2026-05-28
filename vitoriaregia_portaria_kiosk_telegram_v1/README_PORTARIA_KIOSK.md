# Vitória Régia — APK Portaria Kiosk + Telegram

Este pacote cria um APK Android para deixar um celular exclusivo da portaria travado no sistema Vitória Régia, com opção autorizada por PIN para abrir Telegram, câmera, Wi-Fi ou sair temporariamente do modo kiosk.

## O que está incluído

- `android-portaria-kiosk/`: projeto Android nativo em Java.
- WebView fixo em `https://vitoriaregia-pro.onrender.com/?app=portaria#/portaria/encomendas`.
- Tela cheia e tela sempre ligada.
- Botão oculto/compacto `⋮` no canto superior direito.
- Menu administrativo protegido por PIN.
- Botões autorizados:
  - Reabrir Vitória Régia;
  - Abrir Telegram da portaria;
  - Abrir câmera;
  - Abrir Wi-Fi;
  - Pausar kiosk/trocar app;
  - Alterar PIN.
- Permissão de câmera para OCR/leitor de etiqueta no sistema web.
- Suporte a modo kiosk leve via fixação de app.
- Suporte a modo kiosk avançado via Device Owner, se desejar.

## PIN padrão

O PIN inicial é:

```txt
1987
```

Depois de instalar, abra o menu `⋮` e use a opção **Alterar PIN**.

## Como gerar o APK pelo GitHub

1. Suba a pasta `android-portaria-kiosk` para o seu repositório.
2. Suba também o arquivo:

```txt
android-portaria-kiosk/.github/workflows/build-portaria-kiosk-apk.yml
```

3. No GitHub, vá em **Actions**.
4. Execute **Build Portaria Kiosk APK**.
5. Baixe o artifact `vitoria-regia-portaria-kiosk-debug-apk`.
6. Instale o APK no celular da portaria.

## Como gerar pelo Android Studio

1. Abra o Android Studio.
2. Escolha **Open**.
3. Selecione a pasta `android-portaria-kiosk`.
4. Aguarde sincronizar.
5. Clique em **Build > Build APK(s)**.
6. Instale o APK gerado no celular.

## Configuração recomendada no celular da portaria

1. Instalar Telegram no celular.
2. Entrar com a conta `@portariavr1`.
3. Abrir o bot `@vitoriaregia_bot`.
4. Enviar `/start`.
5. No sistema Vitória Régia, cadastrar o Chat ID da portaria em:

```txt
Configurações > Notificações > Telegram Portaria Premium
```

6. Instalar o APK Vitória Régia Portaria.
7. Dar permissão de câmera.
8. Ativar fixação de app no Android.

## Modo kiosk simples por fixação de app

No Android:

```txt
Configurações > Segurança > Fixação de app
Ativar
Exigir PIN para desafixar
```

Depois:

```txt
Abra o APK Vitória Régia Portaria
Abra a visão de apps recentes
Toque no ícone do app
Escolha Fixar app
```

## Modo kiosk avançado via ADB/Device Owner

Use somente em aparelho dedicado, preferencialmente recém-formatado.

Depois de instalar o APK, conecte no computador com ADB e rode:

```bash
adb shell dpm set-device-owner br.com.vitoriaregia.portariakiosk/.KioskDeviceAdminReceiver
```

Depois abra o aplicativo. Ele tentará entrar em Lock Task Mode automaticamente.

Observação: o Android normalmente exige aparelho sem contas configuradas para definir Device Owner. Se der erro, será necessário formatar o celular e repetir antes de adicionar contas.

## Como trocar a URL do sistema

No arquivo:

```txt
android-portaria-kiosk/app/src/main/java/br/com/vitoriaregia/portariakiosk/MainActivity.java
```

Altere:

```java
private static final String APP_URL = "https://vitoriaregia-pro.onrender.com/?app=portaria#/portaria/encomendas";
```

Se você criar uma rota própria para leitor automático, pode usar, por exemplo:

```java
private static final String APP_URL = "https://vitoriaregia-pro.onrender.com/?app=portaria#/portaria/leitor-automatico";
```

## Segurança e privacidade

- O Telegram da portaria recebe mensagens operacionais.
- Dados completos devem ficar dentro do sistema Vitória Régia.
- No Telegram, prefira mensagens resumidas, sem CPF, telefone, foto de documento ou dados financeiros.
- A decisão do morador sobre encomendas deve ficar registrada no sistema.

