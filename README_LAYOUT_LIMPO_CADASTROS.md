# Vitória Régia — Layout limpo para Moradores e Usuários

Esta atualização melhora a organização visual do sistema sem alterar banco de dados, login, permissões ou regras internas.

## O que muda

- Separa visualmente **Cadastro de Moradores** e **Consulta de Moradores**.
- Separa visualmente **Cadastro de Usuários internos** e **Consulta de Usuários**.
- Deixa as telas mais limpas, com cards, busca rápida, cabeçalhos claros e menos poluição visual.
- Mantém o menu Premium/Central Premium e os módulos já existentes.
- Não altera a conexão do banco.
- Não remove campos; apenas organiza e melhora a experiência.

## Arquivos incluídos

Envie estes arquivos para a **raiz do repositório**, junto de `index.html`, `app.js` e `styles.css`:

```txt
vr-clean-admin.css
vr-clean-admin.js
```

Depois, abra o arquivo `index.html` e adicione estas linhas:

Antes de `</head>`:

```html
<link rel="stylesheet" href="vr-clean-admin.css">
```

Antes de `</body>`, de preferência depois do `app.js`:

```html
<script src="vr-clean-admin.js"></script>
```

## Se quiser aplicar automaticamente em um computador ou Termux

Depois de copiar os arquivos para dentro do repositório, rode:

```bash
node injetar_layout_limpo.js
```

Esse script tenta inserir as duas linhas acima no `index.html` sem apagar o conteúdo atual.

## Observação importante

Esta atualização foi feita como camada visual segura. Ela não substitui o `app.js` original, porque esse arquivo concentra as regras do sistema, login, banco, moradores, usuários, permissões, reservas, portaria e Central Premium.

Isso reduz o risco de quebrar algo que já estava funcionando.
