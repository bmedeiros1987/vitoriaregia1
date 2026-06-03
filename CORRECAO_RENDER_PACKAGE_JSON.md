# Correção do deploy Render — package.json

O erro do Render:

```text
error package.json: Name contains illegal characters
```

acontece quando o arquivo `package.json` da raiz do repositório não é um `package.json` de projeto Node válido, ou quando o campo `name` possui espaços/maiúsculas/caracteres inválidos.

Nesta versão, a raiz do projeto contém um `package.json` Node correto:

```json
{
  "name": "crewcheck-premium-github",
  "version": "10.4.1",
  "type": "module",
  "private": true
}
```

Também foi mantido o manifesto PWA no local correto:

```text
client/public/manifest.json
```

## Configuração recomendada no Render

Use:

```text
Build Command: npm ci && npm run build
Start Command: node server.mjs
```

Se preferir manter Yarn, também deve funcionar com:

```text
Build Command: yarn install && yarn build
Start Command: node server.mjs
```

Mas como este pacote possui `package-lock.json`, `npm ci` é o caminho mais previsível.

## Atenção ao GitHub

Suba o conteúdo deste ZIP exatamente na raiz do repositório. A raiz precisa conter estes arquivos reais:

```text
package.json
vite.config.ts
server.mjs
render.yaml
client/
shared/
database/
android-wrapper/
```

Não deixe o manifesto PWA substituir o `package.json`. O manifesto deve ficar em `client/public/manifest.json`.
