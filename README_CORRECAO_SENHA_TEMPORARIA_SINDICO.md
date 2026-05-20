# Correção: senha temporária gerada pelo síndico/subsíndico

## Problema
Ao gerar senha temporária para morador/equipe, o sistema podia retornar:

> Acesso permitido somente ao síndico/subsíndico.

Isso ocorria principalmente em produção no Render, porque a aplicação roda atrás de proxy HTTPS. Sem `trust proxy`, o cookie de sessão administrativa podia não ser reconhecido nas chamadas seguintes ao login. Assim, o login parecia funcionar no navegador, mas a rota `/auth/password/admin-reset` recebia a requisição sem sessão válida.

Também foi reforçada a identificação do subsíndico, mantendo o perfil visual como administração, mas preservando o `staffRole` original.

## O que foi corrigido
- Adicionado `app.set('trust proxy', 1)` automaticamente em produção/Render.
- Configuração de cookie de sessão passou a aceitar `SESSION_COOKIE_SECURE` e `SESSION_COOKIE_SAME_SITE`.
- Middleware `requireSyndicUser` agora valida:
  - síndico;
  - subsíndico;
  - usuário bootstrap temporário do síndico;
  - registro ativo da equipe no banco.
- Login agora retorna `staffRole`, permitindo distinguir `sindico` e `subsindico` sem quebrar permissões do painel.
- Mensagem do frontend ficou mais clara quando a sessão administrativa expira.

## Variáveis recomendadas no Render

```env
TRUST_PROXY=true
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAME_SITE=lax
SESSION_SECRET=crie_uma_chave_grande_e_aleatoria
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=seu_email_de_sindico
BOOTSTRAP_ADMIN_PASSWORD=sua_senha_temporaria
```

Depois que o síndico definitivo estiver cadastrado em Equipe, você pode desativar ou trocar a senha bootstrap.

## Como testar
1. Entre no sistema no perfil **Síndico / Administração**.
2. Vá em **Moradores** ou **Equipe**.
3. Clique em **Gerar senha temporária**.
4. O sistema deve mostrar a senha temporária e, se o e-mail estiver configurado, enviar a mensagem automática.
5. Clique em **Sair** e teste a nova senha no login do usuário.

Se a mensagem de permissão continuar aparecendo, clique em **Sair**, entre novamente como Síndico/Administração e confirme que o Render recebeu as variáveis acima.
