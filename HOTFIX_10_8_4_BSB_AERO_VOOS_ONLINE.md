# CrewCheck 10.8.4 — BSB Aero Voos Online

- Integra o endpoint `/api/flight-status` ao painel oficial de Voos Online do Aeroporto de Brasília.
- Para voos com origem/destino/rota BSB, o CrewCheck consulta `https://www.bsb.aero/passageiros/voos-online` no backend, evitando CORS no navegador.
- Usa cache curto no servidor para reduzir chamadas repetidas.
- Não salva senha corporativa nem dados sensíveis; consulta somente número do voo, rota, data e aeroportos necessários.
- Mantém fallback seguro quando o painel público não localiza o voo ou está indisponível.
