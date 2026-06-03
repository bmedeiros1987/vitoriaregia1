# CrewCheck 10.4.5 — PS, MT e Google Calendar

Correções aplicadas:

- Voos com `workType`/código operacional `PS` agora usam o mesmo ícone de voo, porém em cinza.
- A sincronização com Google Calendar envia `colorId` por categoria para manter padrão visual:
  - voo operacional: azul;
  - voo PS/extra: cinza;
  - folga: verde;
  - reserva/sobreaviso/day marker: laranja;
  - ground duty/treinamento: vermelho;
  - simulador: roxo;
  - transporte: marrom/amarelo;
  - reunião/medical: azul-esverdeado.
- Exportação `.ics` também recebe propriedades `COLOR` e `X-APPLE-CALENDAR-COLOR` como fallback visual.
- `MT`, `MT_GUIDE` e `MTC` passaram para categoria `MEETING`, com ícone de reunião.
- Caso `VITE_GOOGLE_CLIENT_ID` não esteja configurado no Render/Vercel, a tela Configurações permite informar temporariamente o Google Client ID localmente.

## Importante sobre VITE_GOOGLE_CLIENT_ID

O ideal em produção é configurar no Render antes do build:

```env
VITE_GOOGLE_CLIENT_ID=SEU_CLIENT_ID.apps.googleusercontent.com
```

Depois execute `Manual Deploy -> Clear build cache & deploy`.

Como variáveis `VITE_` são injetadas no build do front-end, alterar a variável sem redeploy não atualiza o JavaScript já gerado.
