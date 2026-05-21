# Vitória Régia — Update completo consolidado

Este pacote reúne os últimos ajustes gerados para o sistema:

- correção de banco para PostgreSQL/Aiven no Render, mantendo compatibilidade com MySQL;
- preservação do menu Premium/Central premium;
- layout limpo para cadastro e consulta de moradores;
- layout limpo para cadastro e consulta de usuários/equipe;
- central de notificações pelo navegador;
- notificações gerais, por unidade e comunicados do síndico;
- botão de emergência/pânico com fluxo em duas etapas;
- rotas backend opcionais `/api/notifications` e `/api/panic`;
- scripts de injeção para ativar frontend e backend sem apagar o restante do sistema.

## Como aplicar pelo celular

1. Baixe este arquivo com o nome padrão:

```txt
vitoriaregia_update.zip
```

2. Coloque em:

```txt
/storage/emulated/0/Download/vitoriaregia_update.zip
```

3. Rode o bash atualizado:

```bash
termux-setup-storage
pkg install git unzip rsync nodejs-lts -y
bash aplicar_update_vitoriaregia.sh
```

O bash clona uma cópia limpa do GitHub, aplica este update, roda `node instalar_update_completo.js`, cria commit e envia para o GitHub.

## Fluxo do botão de emergência

```txt
Morador aciona emergência
↓
Síndico e portaria recebem primeiro
↓
Síndico ou portaria confirma
↓
Moradores são notificados somente após confirmação
```

## Atenção

Não coloque `.env`, senhas, tokens, certificados ou chaves dentro do GitHub. Configure esses dados apenas no painel do Render.

## Update adicional — Dashboard compacto

Este pacote também inclui o arquivo `vr-dashboard-actions.js` e `vr-dashboard-actions.css`, que reduzem o tamanho do dashboard e adicionam botões rápidos por perfil:

- Morador: reserva, encomendas, comunicados, visitante recorrente, serviços, contato e emergência.
- Portaria: registrar encomenda, cadastrar visitante, consultar recorrentes, avisar morador e emergências.
- Síndico/Administração: aprovações, moradores, usuários, comunicados, financeiro, escala, Central premium e emergências.

O instalador `instalar_update_completo.js` injeta automaticamente os arquivos no `index.html`.
