# Vitória Régia — Dashboard compacto e ações rápidas por perfil

Este update reduz o tamanho visual do Dashboard e adiciona uma área de **Ações rápidas do perfil**, posicionada logo abaixo do bloco principal onde já existia o botão **Solicitar reserva**.

## O que muda

- Dashboard mais limpo e menor.
- Botões operacionais logo no topo.
- Opções exclusivas por perfil:
  - **Morador:** solicitar reserva, encomendas, comunicados, visitante recorrente, serviços, contato e emergência.
  - **Portaria:** registrar encomenda, cadastrar visitante, consultar recorrentes, avisar morador, comunicados, logs e emergências.
  - **Síndico/Administração:** aprovações, moradores, usuários, comunicados, financeiro, encomendas, escala, Central premium e emergências.
- Respeita permissões já existentes: se uma aba estiver oculta ou bloqueada, o botão não aparece.
- Inclui botão para alternar o modo compacto.

## Instalação manual

Se não usar o instalador completo, adicione no `index.html`:

Antes de `</head>`:

```html
<link rel="stylesheet" href="vr-dashboard-actions.css">
```

Antes de `</body>`:

```html
<script src="vr-dashboard-actions.js"></script>
```

Ou execute:

```bash
node injetar_dashboard_compacto.js
```
