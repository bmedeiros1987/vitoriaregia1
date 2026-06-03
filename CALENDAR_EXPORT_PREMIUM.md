# CrewCheck Premium — Exportação de calendário

Esta versão melhora a exportação `.ics` para Google Calendar, Apple Calendar, Outlook e outros calendários.

## Melhorias

- Título premium dos voos:
  - `BSB-GYN · LA3755`
  - ou, internamente configurável, `LA3755 · BSB-GYN`
- Número do voo sempre ao lado da rota.
- Descrição detalhada com:
  - rota;
  - cidades de origem e destino;
  - horários locais;
  - horários UTC;
  - tipo de operação;
  - aeronave;
  - duty report/debrief;
  - tripulante;
  - base;
  - função.
- Exportações separadas:
  - calendário completo;
  - somente voos;
  - somente atividades;
  - folgas/repousos;
  - academia.
- Lembretes automáticos:
  - voos e atividades: 2h e 30min antes;
  - academia: 1h antes.
- Eventos de descanso como `TRANSPARENT`, para não bloquear a agenda como compromisso ocupado.
- Voos, ASB, HSB/HSBE, C32F e treinamentos como `OPAQUE`.

## Deploy pelo Termux

Rode:

```bash
chmod +x deploy-termux.sh
./deploy-termux.sh
```

O script pedirá o token no terminal. O token não fica salvo no arquivo.


## MT

`MT` é exportado como `MT · Meeting / reunião com a chefia`, com agenda ocupada quando houver horário.
