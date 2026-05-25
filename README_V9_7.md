# Vitória Régia Pro v9.7 - Perfis, notificações, manuais e ajustes profissionais

Esta versão organiza a fase profissional de perfis, notificações e manuais.

## Novidades principais

- Meu perfil: o próprio morador atualiza e-mail, WhatsApp, Telegram e preferências.
- Síndico edita moradores e usuários.
- Reset de senha: a senha temporária é enviada somente ao usuário.
- Configurações de notificação separadas por subgrupos.
- Teste de e-mail, WhatsApp, Telegram e notificação do navegador.
- Configurações exibidas sem mostrar senhas/tokens.
- Critérios dos moradores para filtros de avisos: pet, imóvel alugado, carro e outros.
- Upload de manuais em PDF pela área reservada de administração.
- Manuais normais não exibem o usuário reservado de administração.
- Telegram com botões para resposta da encomenda.
- Emergência com notificação persistente e vibração forte no navegador/PWA quando permitido.
- Termo OCR foi substituído por leitura automática no sistema.

## Render

Build Command:

```bash
npm install --no-audit --no-fund && npm run build
```

Start Command:

```bash
npm start
```

## Variáveis importantes

Use o arquivo RENDER_CONFIGURACAO.txt do pacote. Não coloque DATABASE_URL, tokens ou senhas no GitHub.
