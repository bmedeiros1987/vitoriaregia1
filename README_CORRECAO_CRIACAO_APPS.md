# Correção da criação dos apps Android

Esta versão corrige a geração dos APKs no GitHub Actions.

## Problema encontrado

O repositório público ainda tinha o workflow `.github/workflows/main.yml` configurado para compilar um projeto Android na raiz do repositório (`:app`) e publicar apenas o APK da portaria. Porém o pacote atual do sistema usa dois projetos Android separados:

- `android-portaria/`
- `android-morador/`

Com isso, a criação dos apps ficava inconsistente e podia gerar APK antigo, incompleto ou apenas da portaria.

## Correções aplicadas

- Criado/corrigido `.github/workflows/main.yml` para gerar os dois APKs.
- Corrigidos também os workflows `build-android-apks.yml` e `build-portaria-apk.yml`, para evitar que um workflow antigo continue executando errado.
- Ajustado `settings.gradle` da raiz para apontar para os módulos reais `android-portaria/app` e `android-morador/app`.
- Ajustado `build.gradle` da raiz.
- Adicionado Java 17 nos projetos Android.
- Corrigido import explícito do `FileChooserParams` nos apps Android.
- Regenerados os ZIPs dos projetos Android em `downloads/`.

## Como gerar os APKs

1. Suba todos os arquivos deste ZIP no GitHub.
2. No GitHub, entre em **Actions**.
3. Abra o workflow **Build Android Apps**.
4. Clique em **Run workflow**.
5. Ao finalizar, o GitHub criará os artifacts:
   - `vitoria-regia-portaria.apk`
   - `vitoria-regia-morador.apk`
6. As releases também serão atualizadas:
   - `android-portaria-latest`
   - `android-morador-latest`

## Atenção

Se ainda existir um workflow antigo chamado apenas `main.yml` no GitHub, ele precisa ser sobrescrito por este pacote. Se aparecer mais de um workflow duplicado, mantenha apenas o workflow novo e apague o antigo pelo GitHub.
