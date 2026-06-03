# CrewCheck Premium

Versão com login obrigatório, cadastro simples, leitura de escala, análise de irregularidades, academia, exportação premium para calendário, e-mail e banco de dados.

Esta build aceita **MySQL/Aiven** via `DATABASE_URL=mysql://...` e também mantém compatibilidade técnica com MySQL se necessário.

Consulte `README_MYSQL_DEPLOY.md` para configurar no Render.

# CrewCheck Premium

Aplicação Vite/React para leitura de CrewRosterReport em PDF, com layout desktop/mobile premium e análise de escala de tripulantes.

## Recursos desta versão

- Leitura do PDF CrewRosterReport por linhas e colunas.
- Menu: **Escala**, **Irregularidades**, **Dias de Academia** e **Escala Puxada**.
- Seleção automática ou manual da função:
  - ACT SNA/TAM Aeronautas Comissários 2025/2027.
  - ACT SNA/TAM Aeronautas Pilotos 2025/2027.
- Detecção de ACT por cargo/código da escala, com fallback manual na tela inicial.
- Análise parametrizada por função para:
  - sobreaviso;
  - reserva;
  - tempo em solo entre etapas;
  - madrugadas consecutivas e janela móvel de 168h;
  - limite de horas de voo 90/28 e 900/365 para narrow/A32F/Embraer;
  - limite de horas de voo 100/28 e 1000/365 para wide body;
  - folgas, escala com 9 folgas e indenização prevista em ACT;
  - repouso adicional de +1h em jornada simples planejada acima de 10h;
  - pontos que dependem de GRF/SGRF, tripulação, manual do operador e validação oficial.
- Ranking de dias mais cansativos.
- Nota de puxada da escala.
- Recomendação dos melhores dias de academia.
- Exportação de relatório em PDF.
- Exportação de calendário `.ics`.
- Servidor Node próprio para Render com fallback de rotas SPA.

## Deploy no Render

Use como **Web Service / Node**.

```bash
Build Command: yarn install && yarn build
Start Command: node server.mjs
```

Depois de cada atualização, faça no Render:

```text
Manual Deploy → Clear build cache & deploy
```

## Aviso importante

O CrewCheck faz leitura automática do PDF e aplica regras parametrizadas. Ele não substitui conferência oficial pela escala publicada, ACT/CCT aplicável, GRF/SGRF, manual do operador, extensão registrada, tipo de tripulação e validação da empresa/sindicato.

## Revisão de precisão operacional - siglas LATAM/Aeronautas

Esta versão ajusta a leitura das siglas operacionais informadas pelo usuário:

- `DO`, `DR`, `DOF`: folgas formais publicadas e contadas como folga mensal.
- `OFF`: extensão de descanso/repouso; aparece como descanso, mas não entra como folga formal mensal.
- Dia em branco entre programação que termina fora da base e próxima programação que inicia na mesma localidade: marcado como `INATIVO/PERNOITE`.
- `ASB`: Airport Stand By; tratado como reserva aeroportuária.
- `HSB` e `HSBE`: Home Stand By / Home Stand By Extra; tratados como sobreaviso.
- Siglas desconhecidas passam a gerar alerta de glossário, sem virar irregularidade automática até serem configuradas.

O motor de irregularidades foi ajustado para reduzir falsos positivos: apenas violações determinísticas aparecem como irregularidade; situações dependentes de ACT, GRF/SGRF, manual do operador, tipo de tripulação ou sigla não classificada aparecem como revisão/ponto de atenção.


## Atualização de siglas

- `C32F` agora é classificado como check de competência de equipamento A32F: prova anual para renovação da carteira de comissário da Família Airbus A32F.
- `C32F` entra como treinamento/check operacional, com duty contabilizado quando houver horários na escala, sem ser tratado como irregularidade ou sigla desconhecida.


### Glossário operacional atualizado

- `MT`: Meeting / reunião com a chefia. É atividade de solo e deve contar como compromisso/jornada quando possuir horário na escala, mas não deve ser classificada como treinamento/check.
- `JUN`, `JUL` e demais abreviações de mês ou dia da semana são ignoradas pelo analisador de siglas, pois pertencem ao calendário e não são códigos operacionais.

## Banco de dados MySQL/Aiven

Esta versão inclui persistência em MySQL/Aiven via servidor Node (`server.mjs`).

### Recursos de banco

- Conexão via `DATABASE_URL` no backend, sem expor senha no navegador.
- Criação automática das tabelas `crewcheck_rosters` e `crewcheck_audit_logs` na primeira execução.
- API interna:
  - `GET /api/db/status`
  - `POST /api/rosters`
  - `GET /api/rosters?limit=20`
  - `GET /api/rosters/:id`
  - `DELETE /api/rosters/:id`
- Botão real na tela de resultados para **Salvar análise**.
- Histórico das últimas escalas salvas no painel lateral.

### Variáveis no Render

Configure em Environment:

```text
DATABASE_URL=mysql://avnadmin:SENHA@mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com:22966/defaultdb?ssl-mode=REQUIRED
MYSQL_SSL_MODE=REQUIRED
CREWCHECK_AUTO_MIGRATE=true
NODE_VERSION=20
```

> Não grave credenciais reais no GitHub. Use sempre variáveis de ambiente.


## Versão Auth + Offline + Banco

Esta versão adiciona:

- Tela de login/cadastro premium.
- Cadastro obrigatório para acessar upload e análises.
- Backend Node com usuários, sessões e senha com hash.
- Aiven/MySQL com histórico por usuário.
- Salvamento offline-first.
- Sincronização posterior sem duplicidade por checksum.
- Botão de envio por e-mail, condicionado a SendGrid ou MailerSend configurado.
- PWA/APK-ready para instalação no Android.

## E-mail

O botão de e-mail já existe. Ele depende de variáveis no Render:

- `SENDGRID_API_KEY` + `SENDGRID_FROM`; ou
- `MAILERSEND_API_KEY` + `MAILERSEND_FROM`.

## APK offline

Leia `APK_OFFLINE.md`.
