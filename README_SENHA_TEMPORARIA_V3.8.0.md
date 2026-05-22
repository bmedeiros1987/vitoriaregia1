# Recuperação de senha — Vitória Régia v3.8.0

A opção **Esqueci minha senha** foi reforçada.

## Como funciona

1. O usuário clica em **Esqueci minha senha** na tela inicial.
2. Informa o e-mail cadastrado.
3. O sistema verifica se o usuário já foi aprovado/liberado pelo síndico ou administrador.
4. Se estiver aprovado, o sistema gera uma senha temporária simples, por exemplo: `VR-482913`.
5. A senha temporária é enviada por e-mail.
6. No próximo login, o usuário precisa criar uma nova senha definitiva.

## Segurança

- Cadastros pendentes não recebem senha temporária.
- Cadastros reprovados/inativos não recebem senha temporária.
- A resposta da tela não revela se o e-mail existe ou não, evitando exposição de usuários.

## Configuração necessária no Render

Configure o envio de e-mail nas variáveis de ambiente do backend. Exemplo SMTP:

```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario
SMTP_PASS=senha
EMAIL_FROM=Sistema Vitória Régia <naoresponda@seudominio.com>
```

Sem essas variáveis, a geração da senha pode ocorrer, mas o envio por e-mail não será concluído.
