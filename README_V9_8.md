# Vitória Régia Pro v9.8 - Profissional

Versão focada em relacionamento automático por unidade, confirmação antes de salvar, bloqueio de duplicidade, identidade visual residencial, CrewCheck, auditoria, notificações completas e manuais mais didáticos.

## Principais melhorias

- Ao informar a unidade/apartamento em reservas e encomendas, o sistema consulta moradores cadastrados e preenche os dados quando possível.
- Leitura automática de etiqueta de encomenda com preenchimento de unidade, rastreio e destinatário.
- Tela de confirmação antes de salvar cadastros, reservas, encomendas e visitantes.
- Bloqueio de duplicidade com mensagens amigáveis: usuário já cadastrado, encomenda já cadastrada e reserva já efetuada.
- Síndico pode cadastrar áreas de lazer, taxa, regras e limite de convidados.
- Síndico/Bruno podem remover cadastros permitidos; tudo fica registrado em auditoria.
- Configurações separadas por E-mail, Telegram, WhatsApp, Banco, Apps, Atualizações e Auditoria.
- Teste de envio para e-mail, Telegram, WhatsApp e navegador.
- Menu de atualização pode ser exibido ou ocultado para o síndico conforme configuração do Bruno.
- Aparência com seletor de cor tipo conta-gotas e ajuste de tamanho do texto.
- E-mails com corpo profissional, marca Vitória Régia e assinatura CrewCheck.
- Manuais em PDF dentro de `docs/manuais`.

## Estrutura do prédio

- Bloco único.
- 11 andares.
- 3 apartamentos por andar.
- Unidades esperadas: 101, 102, 103 até 1101, 1102 e 1103.

## Render

Build Command:

```bash
npm install --no-audit --no-fund && npm run build
```

Start Command:

```bash
npm start
```

Root Directory: deixe vazio.

## Importante sobre segredos

Não envie `.env`, tokens, senhas, `DATABASE_URL`, certificados, `node_modules` ou arquivos de build para o GitHub.
