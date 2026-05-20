# Integração TeraBox para documentos e fotos

Esta versão adiciona um adaptador de armazenamento externo para que fotos e documentos não sejam salvos no banco de dados. O banco grava apenas metadados, caminho externo, tamanho, tipo do arquivo e data de upload.

## Configuração no Render

Adicione as variáveis em **Render → Web Service → Environment**:

```env
STORAGE_ENABLED=true
STORAGE_PROVIDER=terabox
STORAGE_MAX_UPLOAD_MB=10

TERABOX_BASE_URL=https://www.terabox.com
TERABOX_UPLOAD_BASE_URL=https://c-jp.terabox.com
TERABOX_ACCESS_TOKEN=COLOQUE_O_ACCESS_TOKEN_OFICIAL_DA_TERABOX
TERABOX_ACCESS_TOKEN_PARAM=access_tokens
TERABOX_FOLDER=/vitoria-regia
TERABOX_RTYPE=1
```

Também é possível configurar em **Configurações → Integrações → Armazenamento externo** no painel do síndico.

## Como funciona

1. O usuário seleciona/fotografa um arquivo no sistema.
2. O navegador envia o arquivo ao backend.
3. O backend envia o arquivo para a TeraBox pela API aberta.
4. O banco MySQL salva apenas os metadados e o caminho retornado.

## Diagnóstico

Abra:

```text
https://SEU-SITE.onrender.com/api/integrations/storage/debug
```

O ideal é retornar `ok: true`.

## Observação importante

A TeraBox Open Platform trabalha com `access_token`/`access_tokens` e fluxo de upload em etapas, com pré-upload, upload e criação do arquivo. Caso sua conta TeraBox retorne domínio de upload diferente, configure `TERABOX_UPLOAD_BASE_URL` com o domínio informado pela própria TeraBox.

Não coloque o token da TeraBox no GitHub.
