# Histórico e estatísticas do CrewCheck

Esta versão adiciona uma área de histórico para escalas salvas no banco de dados.

## Recursos

- Estatísticas pessoais por usuário a partir das escalas armazenadas.
- Quadro comparativo geral agregado, apenas superficial.
- Aviso explícito de que os números não devem ser usados como prova, cobrança ou apresentação à empresa.
- Endpoint `/api/stats` protegido por login.
- Correção do PDF.js com `GlobalWorkerOptions.workerSrc` configurado e fallback sem worker.

## Privacidade

Os dados são usados para organização pessoal da escala e análise operacional do usuário. O comparativo geral é superficial e deve ser interpretado apenas como referência visual.
