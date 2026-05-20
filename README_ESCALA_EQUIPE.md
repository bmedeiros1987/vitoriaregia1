# Atualização — Escala de equipe, ausência e contato protegido

Esta versão adiciona recursos operacionais para gestão de equipe e controle de mensagens.

## Recursos incluídos

- Exclusão de moradores e equipe pelo painel do síndico.
- Situação da equipe: `Disponível`, `Afastado`, `Ausente` ou `Férias`.
- Período de indisponibilidade com data inicial e final.
- Funcionário, síndico ou subsíndico indisponível não recebe mensagens pelo sistema.
- Cadastro de escala por data e turno: `Manhã`, `Tarde` e `Noite`.
- Painel de escala visível somente ao síndico.
- Morador vê apenas o destinatário disponível para contato, sem telefone ou e-mail.
- Para a portaria, o morador só consegue enviar mensagem ao porteiro escalado no turno atual.
- Se não houver porteiro escalado/disponível, o sistema bloqueia o envio para portaria.

## Persistência

As informações são salvas no PostgreSQL por meio do estado operacional do sistema (`app_meta`). A tabela `staff_schedules` também é criada para futuras consultas nativas/relatórios.

## Render

Mantenha:

```bash
Build Command:
cd backend && npm install

Start Command:
cd backend && npm start
```

E no Render use:

```env
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
ALLOW_LEGACY_DEMO_LOGIN=false
```
