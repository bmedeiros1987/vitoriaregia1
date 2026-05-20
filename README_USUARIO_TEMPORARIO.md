# Usuário temporário de implantação

Esta versão permite criar um usuário temporário de síndico para iniciar o sistema sem reativar modo demo.

## Variáveis no Render

Adicione em **Render → Web Service → Environment**:

```env
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=seuemail@gmail.com
BOOTSTRAP_ADMIN_PASSWORD=crie_uma_senha_forte_temporaria
BOOTSTRAP_ADMIN_NAME=Usuário temporário de implantação
BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO=true
```

Depois faça **Manual Deploy → Deploy latest commit**.

## Como acessar

1. Abra o site publicado.
2. Selecione **Síndico / Administração**.
3. Informe o e-mail configurado em `BOOTSTRAP_ADMIN_EMAIL`.
4. Informe a senha configurada em `BOOTSTRAP_ADMIN_PASSWORD`.
5. Acesse **Equipe** e cadastre o síndico oficial com e-mail e WhatsApp.

## Desativação automática

Com `BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO=true`, o usuário temporário é bloqueado automaticamente assim que existir pelo menos um cadastro ativo de **síndico** ou **subsíndico** na tela **Equipe**, com e-mail diferente do e-mail temporário.

Depois disso, o síndico oficial acessa pelo próprio e-mail cadastrado em **Equipe**. Porteiros também passam a acessar pelo e-mail cadastrado em **Equipe**.

## Segurança

Nunca envie `BOOTSTRAP_ADMIN_PASSWORD` para o GitHub. Use somente as Environment Variables do Render.
