# CrewCheck Trust & Performance

Esta versão adiciona uma camada de leitura de PDF no servidor para melhorar a compatibilidade com iPad, Android e Chrome mobile. O navegador envia o PDF ao backend, o backend interpreta o PDF e devolve a escala normalizada. Se o servidor não conseguir interpretar, o sistema tenta o parser local como fallback.

## Melhorias principais

- Central de leitura mais robusta para CrewRosterReport e AIMS.
- Diagnóstico de confiança da leitura.
- Histórico local quando o banco estiver indisponível.
- Estrutura preparada para estatísticas pessoais e comparativo geral superficial.
- Exportação para calendário mantida.
- Correções MySQL/Aiven mantidas: `rank` escapado e datas convertidas para formato MySQL.
- Layout responsivo para desktop, tablet, iPad e celular.

## Aviso de uso dos comparativos

As estatísticas gerais são superficiais, agregadas e servem apenas como quadro comparativo pessoal. Elas não devem ser usadas como prova, cobrança, representação trabalhista ou apresentação formal à empresa.

## Privacidade

O CrewCheck utiliza cadastro mínimo, mantém senha com hash e usa os dados de escala somente para análise, histórico e estatísticas do próprio usuário, observando boas práticas compatíveis com a LGPD.
