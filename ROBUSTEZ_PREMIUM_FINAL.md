# CrewCheck — Robustez Premium Final

Esta versão aplica correções para reduzir falsos positivos e deixar a escala mais confiável:

- O mês de referência passa a ser o mês do cabeçalho da escala. Dias de transbordo são usados apenas como contexto de leitura e não bagunçam a tela principal.
- O formato AIMS é filtrado para não duplicar dias nem misturar meses na grade principal.
- Inativos/pernoites são inferidos pelo destino final da última programação antes da lacuna e pela próxima saída da mesma localidade.
- EZE é reconhecido como Buenos Aires / Ezeiza.
- CRM é classificado como Corporate Resource Management.
- O botão Today foi removido para evitar abertura incorreta quando o mês da escala não corresponde ao dia atual.
- Há botão Desligar sistema para encerrar sessão e limpar dados temporários da navegação.
- As telas foram simplificadas e receberam aviso de privacidade/LGPD com cadastro mínimo e senha com hash.
- O MySQL/Aiven mantém tratamento de rank e datetime.
