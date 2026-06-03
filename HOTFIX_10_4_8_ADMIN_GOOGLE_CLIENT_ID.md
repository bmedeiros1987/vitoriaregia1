# CrewCheck 10.4.8 — Google Client ID somente para administrador

## Ajuste aplicado

O campo técnico **Client ID Google opcional** foi removido da visualização dos tripulantes/usuários comuns na tela de Configurações.

Agora ele só aparece quando o usuário logado for considerado administrador, pelos critérios:

- `role`: `admin`, `administrator`, `master`, `owner`, `suporte`, `support` ou `bruno`; ou
- e-mail `bmedeiros1987@gmail.com`.

## Para usuários comuns

Se `VITE_GOOGLE_CLIENT_ID` não estiver configurado no ambiente, o usuário vê apenas o aviso:

> Google Calendar ainda não foi configurado pelo administrador do sistema.

O usuário comum não vê, não edita e não salva Client ID local.

## Recomendação de produção

Configure o Client ID no Render:

```env
VITE_GOOGLE_CLIENT_ID=811142401548-da2kf1qmqn8629ik689oaf3acsa8c3ai.apps.googleusercontent.com
```

Depois faça **Manual Deploy → Clear build cache & deploy**.


## Complemento 10.4.9 — Folga fantasma

- Bloqueia códigos DAY_OFF como subprogramação quando o dia real é treinamento, voo, reserva, sobreaviso ou outra atividade.
- Corrige o caso em que o sistema criava DO inexistente junto de CBF/EMER no mesmo dia.
- Mantém DO/DR/DOF/OFF apenas quando forem a própria programação publicada na escala.
