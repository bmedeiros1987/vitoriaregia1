# Auditoria CrewCheck — AIMS + MySQL/Aiven

Esta versão foi revisada para evitar dois problemas recorrentes:

1. **Campo `rank` no MySQL 8**
   - `rank` é palavra reservada/função de janela no MySQL 8.
   - No schema MySQL, o campo agora é emitido como `` `rank` ``.
   - O adaptador MySQL também escapa automaticamente qualquer ocorrência SQL de `rank` antes de executar queries.

2. **Datetime no MySQL/Aiven**
   - Datas ISO como `2026-06-07T23:13:13.167Z` são convertidas para `2026-06-07 23:13:13` antes de gravar.
   - Isso evita erro `Incorrect datetime value`.

3. **Formato AIMS**
   - O parser detecta PDF com “Convertida para padrão AIMS”.
   - A leitura visual por colunas deduplica por data e evita duplicar o mesmo dia.
   - O fallback textual também deduplica por `DD/MM/YYYY`.

Checklist local executado:

```bash
node --check server.mjs
```
