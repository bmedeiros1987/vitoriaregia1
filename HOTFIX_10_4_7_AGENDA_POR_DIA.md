# CrewCheck 10.4.7 - Agenda agrupada por dia

## Correção principal
A tela de escala agora agrupa todas as programações de uma mesma data em um único cartão/bloco de dia, no padrão visual do Crew Lounge Connect.

Exemplo:

- TER 02 JUN
  - 09:00-11:00 CBF · EAD - Combate ao Fogo
  - 11:01-13:00 EMER · EAD - Emergências Gerais

## Ajuste de horários encostados
Quando duas atividades não-voo do mesmo dia encostam no mesmo minuto, a segunda linha recebe ajuste visual de +1 minuto para evitar falso positivo de sobreposição.

- CBF 09:00-11:00
- EMER 11:00-13:00

vira:

- CBF 09:00-11:00
- EMER 11:01-13:00

Voos reais não são alterados.

## Itens preservados
Mantidas as correções anteriores: siglas LATAM, PS com ícone de voo cinza, MT como reunião, Google Calendar por cores, salvamento automático no banco, política de privacidade e parser com deduplicação.
