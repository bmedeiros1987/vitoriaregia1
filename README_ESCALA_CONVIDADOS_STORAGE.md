# Atualização — convidados, escala, Google Calendar e armazenamento

## Lista de convidados
- Em Reservas, a lista pode ser digitada manualmente ou importada por CSV/TXT.
- O arquivo pode ter um convidado por linha.
- Em cada reserva com convidados há opção de imprimir e exportar CSV.

## Exportação para Google Calendar
- O sistema gera arquivos `.ics` para importação no Google Calendar:
  - Calendário de reservas: `calendario-reservas-vitoria-regia.ics`.
  - Escala de equipe: `escala-equipe-vitoria-regia.ics`.
- Para sincronização automática via API do Google Calendar será necessário configurar OAuth com escopo do Google Calendar.

## Escala em lote
- O síndico pode selecionar data inicial, data final e/ou datas avulsas.
- O sistema ignora duplicidades automaticamente.
- A importação de escala aceita CSV/TXT com este modelo:

```csv
data;turno;email;observacoes
2026-06-01;Manhã;porteiro@email.com;Turno normal
2026-06-01;Tarde;porteiro2@email.com;Cobertura
2026-06-01;Noite;porteiro3@email.com;Plantão
```

Também é possível usar a coluna `nome` no lugar de `email`, desde que o nome seja igual ao cadastro da equipe.

## Permissão para alterar escala
- O síndico sempre pode alterar a escala.
- O síndico pode marcar um usuário da equipe com a opção “Autorizar este usuário a alterar/importar escala”.
- Alterações, importações e exclusões de escala geram logs em `activity_logs`.

## Arquivos e fotos fora do banco de dados
- Esta versão não grava o conteúdo de fotos/documentos em base64 no banco.
- O banco salva apenas metadados: nome, tipo, tamanho e data do registro.
- Para guardar arquivos reais em produção, use storage externo, como Cloudflare R2, Amazon S3 ou Supabase Storage, e salve no banco apenas a URL/chave do arquivo.
