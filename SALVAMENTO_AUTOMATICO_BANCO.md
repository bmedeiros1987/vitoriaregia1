# Salvamento automático da escala no banco

Esta versão inclui salvamento automático após upload da escala.

## Como funciona

1. O usuário envia o PDF da escala.
2. O parser interpreta e normaliza a escala.
3. O sistema grava os dados em `sessionStorage` e marca `crewcheck_auto_db_save_pending=1`.
4. Ao abrir a tela de resultados, o CrewCheck executa `saveRosterOfflineFirst()`.
5. Se o banco estiver online e o usuário estiver autenticado, a escala é enviada para `POST /api/rosters`.
6. O servidor calcula/usa checksum e, quando encontra a mesma escala para o mesmo usuário, atualiza o registro existente em vez de duplicar.
7. Se o banco estiver indisponível, a escala é preservada no histórico/fila offline para sincronizar depois.

## Requisitos

- Usuário logado.
- Banco configurado no ambiente do servidor.
- Tabelas criadas pelo `database/schema.sql` ou migração automática com `CREWCHECK_AUTO_MIGRATE=true`.

## Botão manual

O botão **Salvar análise** continua disponível como reforço. Ele usa a mesma função e também evita duplicidade por checksum.
