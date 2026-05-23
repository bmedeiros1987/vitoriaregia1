# Vitória Régia v4.3.5 — Restauração Premium Clean

Esta versão restaura a base premium estável e corrige a bagunça causada por scripts posteriores.

## Correções principais

- Tela de login limpa novamente.
- Nada de notificações, menu, editor, dashboard ou mensagem “usuário cadastrado com sucesso” na tela de login.
- Menu lateral restaurado, escuro, rolável e clicável no celular.
- Dashboard com saudação e privacidade por perfil, sem expor dados gerais ao morador.
- Cadastro de usuário/funcionário com opção sem unidade vinculada.
- Editor de usuário disponível apenas dentro do sistema, nos botões de editar.
- Reset de senha temporária, copiar senha e envio por Telegram dentro da edição do usuário.
- Base MySQL, manuais, vídeos, Telegram e funcionalidades premium preservadas.

## Recuperação de acesso

No Render, para recuperar acesso do proprietário, mantenha:

BOOTSTRAP_ADMIN_ENABLED=true  
BOOTSTRAP_ADMIN_EMAIL=bmedeiros1987@gmail.com  
BOOTSTRAP_ADMIN_PASSWORD=sua_senha_temporaria  
BOOTSTRAP_DISABLE_AFTER_FIRST_SINDICO=false

Depois entre com o e-mail configurado e a senha temporária.

Sistema desenvolvido em parceria por Bruno Saraiva e ChatGPT.
