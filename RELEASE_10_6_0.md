# CrewCheck v10.6.7 — iFlight, temas e Play Console

## O que foi ajustado

- Tema claro/escuro/sistema reforçado em todas as telas principais, inclusive login, dashboard, configurações, iFlight, histórico e cards de ação.
- Preferência de tema mantida em `localStorage` e aplicada no Android WebView e na versão web.
- Tela iFlight revisada para deixar claro o fluxo seguro: login e MFA são manuais, sem salvar senha, e a automação só atua depois do portal carregado.
- Android wrapper completado com `app/build.gradle`, `versionCode 10607`, `versionName 10.6.7`, `applicationId com.crewcheck.app`, `minSdk 26` e `targetSdk 35`.
- GitHub Actions incluído para gerar AAB de Play Console e build web.

## Limite técnico importante

A versão web comum não consegue controlar o iFlight por dentro nem ler download de outro domínio por causa das proteções do navegador. Por isso, na web o fluxo seguro é abrir o portal, baixar o PDF e importar manualmente. A automação completa fica no Android, usando WebView interna e ponte nativa.

## Como gerar AAB assinado no GitHub

Crie estes secrets no repositório:

- `CREWCHECK_UPLOAD_KEYSTORE_BASE64`: conteúdo do arquivo `.jks` convertido para base64.
- `CREWCHECK_STORE_PASSWORD`: senha do keystore.
- `CREWCHECK_KEY_ALIAS`: alias da chave.
- `CREWCHECK_KEY_PASSWORD`: senha da chave.

Depois rode **Actions → Build Android AAB → Run workflow**. O artefato final será `CrewCheck-com.crewcheck.app-v10607-10.6.7-aab`.

## Como converter a JKS para base64 no Mac/Termux

```bash
base64 -i crewcheck-new-upload-key.jks | tr -d '\n'
```

No Termux, se `-i` não funcionar:

```bash
base64 crewcheck-new-upload-key.jks | tr -d '\n'
```

## Observação sobre o Crewtopia

O pacote recebido foi usado apenas como referência de arquitetura visível do pacote Android: app separado, `minSdk 26`, `targetSdk 35` e permissões de calendário. Não foi copiado código, fluxo proprietário nem credencial.
