# Correção emergencial do build no Render

Diagnóstico confirmado em 17/07/2026:

1. O `postinstall` da raiz executava novos processos `npm install` dentro do próprio `npm install`, provocando o erro `Exit handler never called` em algumas versões/ambientes do npm.
2. Quando a instalação recursiva falhava, o build continuava sem `client/node_modules`, resultando em `vite: not found`.
3. Os arquivos `package-lock.json` continham URLs de um registro interno indisponível no Render.

A correção remove a instalação recursiva, fixa o registro público oficial do npm e faz o script de build instalar explicitamente as dependências do cliente e do servidor antes da compilação.
