# APK Vitória Régia Portaria

Este pacote cria um APK Android em formato WebView para acessar o sistema Vitória Régia, abrindo diretamente a área de portaria:

https://vitoriaregia1.onrender.com/#portaria

## Funcionalidades pensadas para porteiros

- Acesso rápido ao sistema pelo ícone do aplicativo.
- Abre diretamente na área de portaria.
- Compatível com cadastro de visitantes.
- Compatível com cadastro de encomendas.
- Permissão de câmera para leitura de etiquetas pelo celular.
- Suporte a upload de imagem pelo WebView.
- Links externos de WhatsApp, telefone e e-mail abrem nos aplicativos do aparelho.

## Importante

O APK não substitui o backend. O sistema precisa continuar publicado no Render e com o banco MySQL/Aiven funcionando.

O APK não guarda senha de banco, token do Asaas, MailerSend ou Evolution API. Essas chaves continuam somente no Render.

## Como gerar o APK pelo GitHub Actions

1. Crie um repositório no GitHub, por exemplo `vitoria-regia-apk`.
2. Envie todos os arquivos deste pacote para o repositório.
3. Entre no repositório pelo navegador.
4. Vá em **Actions**.
5. Abra o workflow **Build Android APK**.
6. Clique em **Run workflow**.
7. Aguarde finalizar.
8. Baixe o artifact chamado `vitoria-regia-portaria-debug-apk`.
9. Dentro dele estará o arquivo `app-debug.apk`.

## Como instalar no Android

1. Baixe o `app-debug.apk` no celular.
2. Toque no arquivo.
3. Autorize instalação de fonte desconhecida, se o Android pedir.
4. Instale o app.
5. Abra o app **Vitória Régia Portaria**.

## Como mudar a URL do sistema

Edite este arquivo:

`app/src/main/res/values/strings.xml`

Altere:

```xml
<string name="site_url">https://vitoriaregia1.onrender.com/#portaria</string>
```

Também altere em:

`app/src/main/java/br/com/vitoriaregia/portaria/MainActivity.java`

```java
private final String baseUrl = "https://vitoriaregia1.onrender.com/#portaria";
```

Depois gere o APK novamente.

## APK de produção

O APK gerado pelo workflow é um APK de teste/debug. Ele instala normalmente no Android, mas para publicar na Google Play será necessário gerar uma versão release assinada com keystore próprio.
