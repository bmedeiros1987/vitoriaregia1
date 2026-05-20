# Correções aplicadas - senha temporária e manual administrativo

## 1. Erro MySQL de data/hora
Corrigido o erro:

`Incorrect datetime value: '2026-05-20T14:13:48.452Z' for column 'created_at' at row 1`

O backend agora converte datas gravadas em colunas `timestamp`/`datetime` para o formato compatível com MySQL:

`YYYY-MM-DD HH:mm:ss`

O valor ISO original continua preservado dentro do JSON de payload quando existir.

## 2. Senha temporária
A geração de senha temporária continua disponível somente para síndico/subsíndico/administrador autenticado.
A correção evita que a gravação do estado falhe antes da chamada de geração de senha.

## 3. Login temporário de implantação
A mensagem pública de usuário temporário foi removida da tela de login.
O acesso temporário de implantação continua aceito apenas enquanto não existir síndico/administrador válido cadastrado.
Quando houver síndico/administrador ativo com e-mail diferente do bootstrap, o backend bloqueia automaticamente o login temporário.

## 4. Manual incorporado
O manual PDF foi incorporado ao backend em:

`backend/private/manual_usuario_sistema_vitoria_regia.pdf`

Ele é acessível apenas por administradores autenticados pela rota protegida:

`/api/admin/manual`

Também existe a rota de download protegida:

`/api/admin/manual/download`

A aba **Manual** aparece somente para perfil administrativo.
