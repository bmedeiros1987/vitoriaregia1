# CrewCheck — correção de precisão PDF/mobile e histórico

Esta versão reforça a leitura dos formatos CrewRosterReport e AIMS, adiciona fallback local para histórico/estatísticas quando o banco estiver indisponível e mantém sincronização sem duplicidade quando a base voltar.

## Melhorias
- Parser CrewRosterReport com segunda estratégia de leitura textual para evitar escala com apenas uma folga.
- Filtro de mês de referência para evitar mistura visual de meses.
- Histórico local no aparelho, mesmo sem banco.
- Estatísticas pessoais locais como fallback.
- Deduplicação por checksum quando sincronizar.
- Mantidas correções MySQL: `rank` escapado e datetime convertido.
