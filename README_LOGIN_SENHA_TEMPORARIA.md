# Login com senha, senha temporária e recuperação de acesso

Esta versão remove o acesso sem senha pelo navegador/celular e exige autenticação por e-mail + senha ou Conta Google.

## Recursos incluídos

- Tela inicial com e-mail e senha.
- Cadastro de morador com criação de senha.
- Aprovação do cadastro pelo síndico ativa a conta de acesso.
- Botão **Esqueci minha senha** para envio de senha temporária por e-mail.
- Botão do síndico para gerar senha temporária para moradores e equipe.
- Troca obrigatória de senha no próximo acesso quando a senha for temporária.
- Remoção do comportamento que reabria o aplicativo no celular usando apenas localStorage.

## Importante

Para envio de senha temporária por e-mail, configure MailerSend ou SMTP nas variáveis de ambiente do Render.

Não envie senhas, tokens ou arquivos `.env` para o GitHub.
