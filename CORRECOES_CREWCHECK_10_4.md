# CrewCheck 10.4.0 — correções aplicadas

Este pacote corrige os pontos reportados no app/sistema:

## 1. Parser da escala sem duplicidade

Arquivos principais:

- `client/src/lib/rosterNormalizer.ts`
- `client/src/pages/Home.tsx`
- `client/src/pages/Results.tsx`
- `server.mjs`

Correções:

- Remove duplicados `All Day` quando existe o mesmo código/dia com horário real.
  - Ex.: `HSBE / Sobreaviso` com horário + `All Day` vira apenas o evento com horário.
  - Ex.: `ASB / Reserva` com horário + `All Day` vira apenas o evento com horário.
- Agrupa atividade + voo do mesmo bloco no mesmo dia.
  - Ex.: `Check de competência / C32F` + `CGH – BSB` vira um único card concatenado.
- Junta atividades consecutivas do mesmo código.
  - Ex.: `CRM 09:00–11:00` + `CRM 11:00–13:00` vira `CRM 09:00–13:00`.
- Remove dias vazios quando já existe evento real na mesma data.
- Mantém fallback `Sem programação lida` apenas quando o parser não encontrou nenhum evento para aquela data.

## 2. Nome do tripulante no topo

Arquivo principal:

- `client/src/pages/Results.tsx`

Correção:

O topo agora tenta exibir o nome nesta ordem:

1. nome lido da escala;
2. nome salvo no usuário logado;
3. início do e-mail antes do `@`;
4. `Tripulante` somente como último fallback.

Também foram melhorados os parsers de cabeçalho em:

- `client/src/lib/pdfParser.ts`
- `client/src/lib/aimsParser.ts`
- `server.mjs`

## 3. Google Calendar

Arquivos principais:

- `client/src/lib/googleCalendarSync.ts`
- `client/src/pages/Results.tsx`
- `.env.example`

Incluído:

- menu `Configurações`;
- botão de sincronização Google Calendar;
- seleção do calendário desejado;
- opção de sincronização automática após upload da escala;
- atualização/substituição sem duplicar eventos.

A lógica usa `extendedProperties.private` nos eventos do Google Calendar para marcar:

- período CrewCheck;
- chave única do evento;
- origem CrewCheck.

Na nova sincronização, o sistema procura os eventos do mesmo período/chave e faz `PATCH`; cria apenas eventos novos e remove eventos que saíram da escala.

### Variável necessária

Configurar no ambiente do Render/Vercel:

```env
VITE_GOOGLE_CLIENT_ID=SEU_CLIENT_ID_GOOGLE
```

O Client ID deve ser do tipo **Web application** no Google Cloud Console, com origem autorizada do domínio do CrewCheck.

## 4. Manual dentro do sistema

Arquivo principal:

- `client/src/pages/Results.tsx`

Incluído menu `Manual` com instruções rápidas de:

- upload da escala;
- conferência da leitura;
- irregularidades;
- rotina inteligente;
- Google Calendar;
- histórico e privacidade.

## 5. Android / Google Play

Arquivos principais:

- `android-wrapper/app/build.gradle`
- `android-wrapper/app/src/main/AndroidManifest.xml`
- `android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java`
- `android-wrapper/app/src/main/res/values/styles.xml`
- `.github/workflows/build-android.yml`

Correções:

- `applicationId`: `com.crewcheck.app`
- `namespace`: `com.crewcheck.app`
- `versionCode`: `19`
- `versionName`: `10.4.0`
- tema sem ActionBar/título para remover a tarja superior nativa;
- ícone/launcher mantido;
- Activity movida para `com.crewcheck.app.MainActivity`;
- workflow GitHub Actions preparado para gerar APK/AAB release assinado com secrets.

### Secrets necessários no GitHub Actions

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Depois disso, rode o workflow **Build CrewCheck Android APK/AAB** e use o artefato `CrewCheck-release-aab` para a Play Console.

## 6. Validação feita neste ambiente

Comandos executados com sucesso:

```bash
npm run check
npm run build
node --check server.mjs
```

Observação: não foi possível gerar o AAB localmente neste ambiente porque o comando `gradle` não está instalado aqui. O projeto Android e o workflow estão corrigidos para gerar o AAB assinado no GitHub Actions ou em uma máquina com Android Studio/Gradle.

## Atualização 10.4.1 — salvamento automático no banco

- Ao importar uma nova escala em PDF, a tela de resultados marca `crewcheck_auto_db_save_pending`.
- Ao abrir os resultados, o sistema chama automaticamente `saveRosterOfflineFirst()`.
- Se o banco estiver disponível e o usuário estiver logado, a escala é salva em `/api/rosters`.
- Se a mesma escala já existir, o checksum evita duplicidade e o registro existente é atualizado.
- Se o banco estiver indisponível, a escala fica no histórico/fila offline para sincronização posterior.
- O botão **Salvar análise** permanece como ação manual de segurança.

