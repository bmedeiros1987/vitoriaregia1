# CrewCheck v10.6.15 — Agenda automática por assinatura ICS

Substitui a sincronização direta com Google Calendar/OAuth por um fluxo simples de assinatura ICS.

## O que mudou

- Remove a dependência prática de Google Cloud Identity, Client ID, OAuth e pop-up de autorização.
- A sincronização automática passa a atualizar um link ICS privado do usuário.
- O usuário assina esse link uma única vez no Google Calendar, Outlook ou Apple Calendar.
- A cada nova escala importada, o CrewCheck atualiza o mesmo link ICS.
- Mantém exportação manual `.ics`.
- Mantém modo automático após upload, agora sem token Google.

## Segurança/LGPD

- Não recebe senha Google.
- Não recebe conta corporativa.
- Não usa OAuth Google.
- O link ICS é privado por token aleatório e não exige login porque calendários externos precisam conseguir ler o feed.
