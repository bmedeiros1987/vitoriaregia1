# Configuração do Google Calendar no CrewCheck

## Passo 1 — Google Cloud Console

1. Crie ou abra um projeto no Google Cloud Console.
2. Ative a **Google Calendar API**.
3. Configure a tela de consentimento OAuth.
4. Crie uma credencial OAuth do tipo **Web application**.
5. Em **Authorized JavaScript origins**, adicione o domínio do CrewCheck, por exemplo:

```text
https://crewcheck.onrender.com
```

6. Copie o Client ID.

## Passo 2 — Variável de ambiente

No Render/Vercel, adicione:

```env
VITE_GOOGLE_CLIENT_ID=SEU_CLIENT_ID_GOOGLE
```

Depois faça novo deploy/build do frontend.

## Passo 3 — Uso no sistema

1. Abra a escala analisada.
2. Vá em **Configurações**.
3. Clique em **Conectar Google**.
4. Escolha o calendário.
5. Ative **Sincronizar automaticamente após cada upload de escala**.
6. Faça upload de nova escala.

## Como o CrewCheck evita duplicidade

Cada evento criado no Google Calendar recebe propriedades privadas:

- `crewcheck=true`
- `crewcheckPeriodKey=crewcheck:<tripulante>:<ano-mes>`
- `crewcheckEventKey=<chave unica do evento>`

Quando a escala é enviada novamente, o CrewCheck busca os eventos do mesmo período e:

- atualiza eventos existentes com `PATCH`;
- cria apenas eventos novos;
- remove eventos antigos que não existem mais na escala atual.

## Observação Android

A sincronização Google Calendar foi implementada no sistema web. No app Android WebView, o Google pode exigir abertura em navegador seguro dependendo das políticas OAuth da conta. Se o Google bloquear login dentro do WebView, use o sistema no Chrome ou evolua o Android wrapper para OAuth nativo com Google Sign-In.
