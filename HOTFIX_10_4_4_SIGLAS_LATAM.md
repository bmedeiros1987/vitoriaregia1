# CrewCheck 10.4.4 — Base de Siglas LATAM

Esta versão adiciona uma base local de siglas operacionais extraída dos prints do Crew Lounge Connect enviados pelo usuário.

## Incluído

- `client/src/lib/rosterCodes.ts` com a base de códigos, descrição e categoria.
- Tradução automática dos códigos no upload da escala.
- Tela da escala usa descrição/categoria/cores/ícones conforme a classe do código.
- Exportação e sincronização Google Calendar usam os nomes traduzidos.
- Parser AIMS passa a reconhecer a base de siglas em vez de apenas CRM/CBF/EMER/C32F.
- ZIP final reduzido para menos de 100 arquivos para facilitar upload no GitHub.

## Categorias utilizadas

- Ground Duty: vermelho / treinamento em solo.
- Simulator: roxo.
- Day OFF: verde.
- Day Marker: laranja.
- Transport: marrom.
- Reserve/Standby: laranja.
- Other: neutro.

Observação: alguns códigos do print do Crew Lounge aparecem como `Unknown Code` ou `---`; nesses casos foram mantidos como `OTHER`, sem inventar descrição não informada.
