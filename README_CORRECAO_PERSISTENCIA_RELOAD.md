# Correção de persistência após atualizar a página

Esta versão corrige o problema em que cadastros, moradores, reservas ou encomendas apareciam na tela, mas desapareciam após atualizar a página.

## Causa corrigida

O frontend gravava no `localStorage` e enviava a sincronização ao backend em segundo plano. Se a página fosse atualizada muito rápido, o backend ainda podia estar com o estado anterior e sobrescrever o cache local ao recarregar.

## Correções aplicadas

- Sincronização das alterações em fila, evitando gravações paralelas do mesmo navegador.
- `fetch` com `keepalive` para gravações pequenas, reduzindo perda no reload/fechamento da aba.
- Recuperação automática de itens locais ainda não gravados no backend quando a página recarrega.
- Endpoint `/api/state/:key` corrigido para atualizar uma chave por vez de forma transacional no MySQL, com bloqueio da linha de estado.
- Endpoint `/api/state/bulk` corrigido para mesclar chaves permitidas sem sobrescrever o banco inteiro com estado antigo.

## Testes executados localmente

- Solicitação de cadastro de morador.
- Persistência do cadastro pendente.
- Login do síndico temporário.
- Aprovação de morador.
- Criação de encomenda.
- Consulta de estado antes de reiniciar o backend.
- Reinicialização do backend.
- Confirmação de que morador aprovado e encomenda continuaram armazenados após reiniciar.

## Observação de produção

Para produção no Render/Aiven, confirme que `/api/db/status` mostra banco pronto. Se o banco não estiver pronto, o sistema não deve operar em modo local/demo.
