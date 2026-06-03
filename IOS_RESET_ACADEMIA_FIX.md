# CrewCheck — correções iOS, senha e academia

## PDF no iOS/iPadOS
- Leitura de PDF agora usa fallback com FileReader quando Blob.arrayBuffer falha.
- O botão de importação passa a abrir o seletor de arquivos diretamente, com instrução para salvar PDFs do WhatsApp em Arquivos antes de importar.
- Aceita PDFs mesmo quando o iOS informa tipo genérico `application/octet-stream`.

## Recuperação de senha
- Tela de login ganhou botão real “Esqueci minha senha”.
- Backend adicionou `/api/auth/request-reset`.
- Se o e-mail existir, gera senha provisória válida por 7 dias e envia e-mail premium.
- Resposta é neutra para não revelar se o e-mail existe.

## Academia premium
- Recomendações agora exibem tipo de plano, foco, intensidade, cautela e confiança.
- Folga formal, OFF, pernoite/inativo, dia incerto e dia operacional recebem orientações diferentes.
- Dias de leitura incerta não são tratados como folga confiável.
