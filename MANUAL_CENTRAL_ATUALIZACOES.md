# Manual — Central de Atualizações Vitória Régia Pro v9.4

## Objetivo

A Central de Atualizações permite que o usuário Master envie um arquivo ZIP oficial de atualização pelo próprio sistema. O pacote é validado antes de ser aplicado.

## Quem pode usar

Somente usuário **Master**. O síndico não vê a Central de Atualizações e não consegue aplicar atualização.

## Formato do ZIP oficial

Cada atualização possui:

- `vr-update.json`: manifesto da atualização.
- `payload.zip`: arquivos do sistema que serão publicados no GitHub.
- `update_code`: código único da atualização.
- `validation_token`: token exclusivo criado para aquela atualização.
- `validation_token_hash`: hash que confirma que o token pertence ao pacote.
- `payload_sha256`: hash do payload para detectar arquivo corrompido.

## Como atualizar pelo sistema

1. Entre como Master.
2. Abra **Atualizações** no menu lateral.
3. Clique em **Selecionar ZIP**.
4. Escolha o pacote oficial de atualização.
5. Aguarde a validação.
6. O sistema cria uma notificação interna dizendo que há atualização validada.
7. Clique em **Aplicar** para publicar no GitHub e acionar o deploy, se o Render Deploy Hook estiver configurado.

## Variáveis recomendadas no Render

```text
UPDATE_APPLY_MODE=github
UPDATE_GITHUB_REPO=bmedeiros1987/vitoriaregia1
UPDATE_GITHUB_BRANCH=main
UPDATE_GITHUB_TOKEN=token_github_com_permissao_repo
RENDER_DEPLOY_HOOK_URL=url_deploy_hook_do_render_opcional
UPDATE_FEED_URL=
UPDATE_REQUIRE_SIGNATURE=false
```

## Segurança

O sistema bloqueia atualização que tente enviar `.env`, `node_modules`, `dist`, `build`, certificados, logs, bancos locais ou caminhos suspeitos. A chave `UPDATE_GITHUB_TOKEN` deve ficar somente no Render, nunca no GitHub.

## Primeira vez

A v9.1 ainda não possui a Central completa. Por isso, suba a v9.4 uma vez pelo Mac/GitHub. Depois, as próximas atualizações podem ser enviadas pelo próprio sistema.


## Segurança da atualização

A partir da v9.4, cada arquivo de atualização oficial deve conter:

- `vr-update.json` com código `VRUPD-...` único;
- token `VRTK-...` único por atualização;
- `payload.zip` com os arquivos reais do sistema;
- hash SHA-256 do payload;
- assinatura digital RSA-SHA256 validada pela chave pública embutida no sistema.

A chave privada usada para assinar os pacotes não entra no GitHub, no Render nem no ZIP do sistema. Somente a chave pública fica no sistema para validar se o arquivo foi realmente criado oficialmente.
