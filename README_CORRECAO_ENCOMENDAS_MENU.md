# Correção de layout de encomendas e menu recolhível

Esta versão corrige a sobreposição entre **Encomendas pendentes** e **Cadastrar encomenda**.

Alterações principais:

- lista de encomendas com rolagem interna no desktop quando houver muitos registros;
- formulário e lista redimensionados para caber lado a lado;
- quebra de texto em códigos, botões e rastreios longos;
- em telas menores, cadastro e lista ficam empilhados;
- botão no topo para recolher o menu lateral e deixar apenas ícones;
- preferência do menu recolhido salva no navegador.

No Render, mantenha:

```bash
Build Command:
cd backend && npm install

Start Command:
cd backend && npm start
```
