# Atualização — múltiplos moradores, unidade alugada e convidados

Esta versão adiciona:

- mais de um morador por apartamento;
- definição de morador principal para recebimento de boletos e cobranças;
- opção para marcar a unidade como alugada;
- edição de cadastro pelo síndico e pelo próprio morador vinculado à unidade;
- tela “Meu cadastro” para o morador atualizar seus próprios dados;
- lista de convidados nas reservas, especialmente para salão de festas;
- exibição da lista de convidados nas reservas para controle da administração/portaria;
- geração de boleto Asaas utilizando preferencialmente o morador principal da unidade.

## Publicação no Render

Use:

```bash
Build Command: cd backend && npm install
Start Command: cd backend && npm start
```

Mantenha senhas, tokens, API Key Asaas, SMTP e banco apenas em Environment Variables do Render. Não envie `.env` para o GitHub.
