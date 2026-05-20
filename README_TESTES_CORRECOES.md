# Testes e correções aplicadas — Vitória Régia

Data dos testes: 20/05/2026.

## Correções aplicadas

1. Mantida a proteção da tela inicial: o sistema inicia bloqueado e mostra apenas login/senha até autenticar.
2. Corrigido erro de JavaScript no front-end: `normalizeEmail is not defined`, que impedia finalizar o cadastro de morador pela tela de solicitação.
3. Corrigido o modo operacional/local para criação e autenticação de usuários quando `REQUIRE_DATABASE=false`, preservando contas de acesso em arquivo local de teste.
4. Corrigida a aprovação de morador no modo local/teste para ativar a senha cadastrada pelo morador.
5. Corrigido registro de logs da portaria no modo local/teste para não depender de consulta MySQL quando o banco estiver desativado.

## Testes automatizados realizados

- Tela inicial mostra somente o login.
- Dashboard/app permanece oculto sem login.
- Menu do dashboard não aparece sem login.
- Solicitação de cadastro de morador pela interface.
- Login do síndico/admin por e-mail e senha.
- Aprovação de cadastro pendente pelo síndico.
- Cadastro de encomenda para unidade.
- Logout bloqueia novamente o dashboard.
- Login do morador aprovado.
- Morador visualiza apenas a encomenda da própria unidade.
- Criação de reserva pelo morador.
- Recarregamento sem sessão da aba não reabre o dashboard automaticamente.
- Criação de porteiro/portaria, geração de senha temporária e login da portaria via API.
- Registro de log da portaria via API.

## Observação importante

Os testes foram executados em ambiente local com `REQUIRE_DATABASE=false`, porque não foi fornecido um banco MySQL ativo neste ZIP. Em produção, mantenha o banco MySQL/Aiven configurado nas variáveis de ambiente e valide `/api/health` e `/api/db/status` após publicar.
