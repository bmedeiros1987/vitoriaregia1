# Vitória Régia — Saudação, fundo do prédio e botão discreto de emergência

Este update adiciona:

- imagem do prédio como fundo do topo do dashboard;
- saudação automática ao usuário: **Bom dia / Boa tarde / Boa noite**;
- exibição do primeiro nome do usuário ativo;
- botão discreto e flutuante de **Emergência** com símbolo de giroflex 🚨 em qualquer página.

## Arquivos

- `vr-ux-plus.css`
- `vr-ux-plus.js`
- `injetar_ux_plus.js`

## Como instalar

1. Copie os arquivos para a raiz do repositório/site.
2. Rode:

```bash
node injetar_ux_plus.js
```

## Alternativa manual

Antes de `</head>`:

```html
<link rel="stylesheet" href="vr-ux-plus.css">
```

Antes de `</body>`:

```html
<script src="vr-ux-plus.js"></script>
```

## Observações

- O script tenta descobrir automaticamente o nome do usuário em `localStorage` e elementos visuais já existentes.
- Se houver uma imagem do prédio na interface, ele tenta utilizá-la como background do dashboard.
- Se quiser definir manualmente a imagem do prédio, rode no console do navegador:

```js
localStorage.setItem('vrBuildingBackground', 'URL_DA_IMAGEM_DO_PREDIO')
```
