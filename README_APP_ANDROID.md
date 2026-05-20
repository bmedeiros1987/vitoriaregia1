# App Android da Portaria

Este pacote inclui o projeto Android em `android-portaria/` e um workflow do GitHub Actions em `.github/workflows/build-portaria-apk.yml`.

## Como gerar o APK

1. Suba todo o pacote extraído no GitHub.
2. No GitHub, acesse **Actions**.
3. Abra **Build Android APK**.
4. Clique em **Run workflow**.
5. Ao final, o APK ficará disponível como artifact e também será publicado em uma release estável.

Link usado pelo botão do site:

```text
https://github.com/bmedeiros1987/vitoriaregia1/releases/download/android-portaria-latest/vitoria-regia-portaria.apk
```

## Observações

- O APK é apenas para Android.
- O aplicativo abre o sistema em `https://vitoriaregia1.onrender.com/#portaria`.
- O acesso continua exigindo login e senha da portaria.
- O app usa permissões de internet e câmera para visitantes, fotos e leitura de etiquetas.
- Não envie `.env`, senhas, tokens ou chaves privadas para o GitHub.
