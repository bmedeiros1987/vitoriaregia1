# Login com Conta Google

Esta versão habilita o login por Conta Google no backend Node/Express.

## Variáveis necessárias no Render

Adicione em **Render → Web Service → Environment**:

```env
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=SEU_CLIENT_ID
GOOGLE_CLIENT_SECRET=SEU_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://vitoriaregia1.onrender.com/auth/google/callback
```

Depois clique em **Save Changes** e faça **Manual Deploy → Deploy latest commit**.

## Configuração no Google Cloud

No OAuth Client do Google, cadastre exatamente esta URL em **Authorized redirect URIs**:

```text
https://vitoriaregia1.onrender.com/auth/google/callback
```

## Como o sistema autoriza cada perfil

- **Morador:** a Conta Google precisa usar o mesmo e-mail de um morador cadastrado e aprovado.
- **Síndico/Subsíndico:** o e-mail precisa estar em `ADMIN_EMAILS` ou cadastrado como equipe com papel de síndico/subsíndico.
- **Portaria:** o e-mail precisa estar em `PORTARIA_EMAILS` ou cadastrado como equipe com papel de porteiro.

O login Google não reativa modo demo e continua exigindo banco MySQL operacional.
