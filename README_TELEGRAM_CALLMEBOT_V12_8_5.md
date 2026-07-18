# Vitória Régia Pro v12.8.5 — Chamadas pelo Telegram

## Visão geral

A versão 12.8.5 adiciona chamadas de voz pelo Telegram usando o CallMeBot, integradas ao bot e ao sistema de notificações já existentes no Vitória Régia.

O bot oficial do condomínio continua enviando mensagens, fotos, botões e confirmações. Depois que uma mensagem compatível é entregue pelo Telegram, o servidor classifica o alerta e, conforme as preferências do morador, solicita ao CallMeBot uma chamada de voz para o `@username` vinculado.

## Fluxos automáticos

| Alerta | Comportamento padrão | Atraso padrão |
|---|---|---:|
| Emergência | Ligação habilitada quando o morador ativa o recurso; pode ignorar horário silencioso | 2 segundos |
| Visitante aguardando | Ligação após o aviso da portaria | 20 segundos |
| Interfone sem resposta | Ligação após tentativa de contato | 10 segundos |
| Encomenda urgente | Medicamento, perecível ou item marcado como urgente | 5 segundos |
| Encomenda comum | Desativada por padrão para evitar excesso de chamadas | configurável |
| Comunicado | Desativado por padrão | configurável |

A chamada só é iniciada quando:

1. o Telegram do morador está vinculado ao sistema;
2. existe um `@username` válido no perfil do Telegram;
3. o morador autorizou o CallMeBot;
4. a opção geral de chamadas está ativada;
5. a categoria do alerta está habilitada;
6. o horário silencioso permite a chamada, exceto emergência configurada para ignorá-lo.

## Ativação pelo morador

1. No Telegram, crie ou confirme um `@username` em **Configurações → Editar perfil → Nome de usuário**.
2. Abra `@CallMeBot_txtbot`.
3. Envie `/start` e conclua a autorização solicitada pelo serviço.
4. No Vitória Régia, abra **Alertas inteligentes → Chamadas Telegram**.
5. Ative **Chamadas pelo Telegram** e selecione os tipos de alerta.
6. Toque em **Testar chamada**.

O teste possui intervalo mínimo de um minuto entre tentativas.

## Central de chamadas

A nova tela oferece:

- situação do vínculo com o Telegram;
- identificação do `@username` utilizado;
- botão para abrir o CallMeBot;
- teste de chamada;
- seleção individual de emergências, visitantes, interfone, encomendas e comunicados;
- horário silencioso;
- opção para emergência ignorar o horário silencioso;
- histórico das chamadas solicitadas e falhas.

## Portaria e administração

Perfis `master`, `admin`, `síndico`, `subsíndico` e `portaria` recebem um formulário de chamada manual.

A portaria informa:

- unidade;
- tipo do alerta;
- mensagem a ser falada.

O servidor localiza o morador pelo banco de dados. O navegador não envia diretamente o `@username` do destinatário, reduzindo risco de adulteração.

## Segurança e confiabilidade

- chamadas dependem de consentimento individual;
- preferências ficam no campo já existente `notification_preferences.telegram_call`;
- cada solicitação é registrada em `telegram_call_logs`;
- chamadas duplicadas são bloqueadas por janela de tempo;
- mensagens são sanitizadas e limitadas antes do envio;
- o endpoint de teste possui limitação de frequência;
- rotas de status, preferências, teste, chamada manual e histórico exigem sessão JWT;
- a chamada manual é restrita à administração e portaria;
- nenhuma credencial do Telegram ou do CallMeBot é exposta no frontend.

## Limitação conhecida no iOS

O CallMeBot informa uma limitação atual do Telegram no iPhone e iPad: a chamada pode tocar, mas o áudio pode não ser reproduzido ao atender. Por esse motivo, emergências continuam sendo enviadas também como mensagem do bot, notificação do aplicativo e outros canais configurados.

## Configuração no Render

Variáveis principais:

```env
VR_TELEGRAM_CALL_ENABLED=true
VR_CALLMEBOT_BASE_URL=https://api.callmebot.com/start.php
VR_CALLMEBOT_LANG=pt-BR-Standard-A
VR_CALLMEBOT_REPEAT=2
VR_CALLMEBOT_TEXT_COPY=missed
VR_CALLMEBOT_TIMEOUT_SECONDS=45
VR_TELEGRAM_CALL_EMERGENCY_DELAY_SECONDS=2
VR_TELEGRAM_CALL_VISITOR_DELAY_SECONDS=20
VR_TELEGRAM_CALL_INTERCOM_DELAY_SECONDS=10
VR_TELEGRAM_CALL_URGENT_PACKAGE_DELAY_SECONDS=5
VR_TELEGRAM_CALL_USE_EDGE_TTS=false
```

O modo padrão usa o TTS do próprio CallMeBot e não precisa de chave adicional.

## Voz neural MP3 opcional

A versão também está preparada para gerar MP3 por um serviço compatível com OpenAI, como `openai-edge-tts`, e entregar o arquivo temporário ao CallMeBot.

Para ativar:

```env
VR_TELEGRAM_CALL_USE_EDGE_TTS=true
VR_TTS_BASE_URL=https://seu-servico-tts.onrender.com
VR_TTS_API_KEY=CHAVE_PRIVADA_DO_SERVICO
VR_TTS_VOICE=pt-BR-FranciscaNeural
VR_TTS_SPEED=0.95
VR_TELEGRAM_CALL_AUDIO_SECRET=SEGREDO_LONGO_E_ALEATORIO
PUBLIC_APP_URL=https://seu-app.onrender.com
```

O áudio é acessado por URL assinada com expiração curta. O modo MP3 permanece desativado até que o serviço TTS seja implantado e validado.

## Endpoints internos

```text
GET  /api/telegram-calls/status
PUT  /api/telegram-calls/preferences
POST /api/telegram-calls/test
POST /api/telegram-calls/trigger
GET  /api/telegram-calls/history
GET  /api/telegram-calls/audio/:token.mp3
```

O último endpoint só aceita token assinado e temporário; os demais exigem autenticação.

## Deploy

1. Faça o deploy da versão mais recente da branch principal.
2. No Render, use **Clear build cache & deploy**.
3. Confirme no log:

```text
[telegram-calls] Preload ativo.
[telegram-calls] Integração CallMeBot carregada.
```

4. Vincule um usuário de teste ao bot do Vitória Régia.
5. Autorize esse mesmo usuário no `@CallMeBot_txtbot`.
6. Ative as chamadas no aplicativo.
7. Execute **Testar chamada**.
8. Simule visitante, encomenda urgente e emergência.
9. Confira o histórico na central de chamadas.

## Observação operacional

A resposta do CallMeBot confirma que a solicitação foi aceita pelo provedor. O serviço compartilhado não fornece ao Vitória Régia um webhook confiável informando se a pessoa atendeu ou ouviu toda a mensagem. O histórico diferencia solicitação aceita e erro do provedor, sem afirmar atendimento concluído.
