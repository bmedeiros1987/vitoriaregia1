# Vitória Régia Pro v12.9.2 — Mobile estável e Concierge Telegram

## Objetivo

Esta versão corrige a experiência mobile apresentada em vídeo e transforma o bot atual do Vitória Régia em um concierge pessoal para moradores vinculados.

## Correções visuais mobile

- textos longos permanecem dentro dos cards;
- títulos, observações, botões e indicadores usam quebra segura de linha;
- os indicadores da Gestão usam duas colunas no celular e uma coluna em telas estreitas;
- abas de Reserva, Cadastro, Configurações e Gestão ficam ancoradas no topo do painel;
- somente o conteúdo abaixo da barra interna rola;
- a barra ativa não acompanha nem cobre campos do formulário;
- a aba ativa é centralizada automaticamente em menus horizontais;
- navegação inferior, emergência e botão do menu permanecem fixos;
- áreas seguras de Android e iOS são preservadas.

## Concierge do Telegram

O concierge usa o mesmo bot já vinculado ao morador. Não é necessário criar outro bot nem solicitar outro Chat ID.

### Consultas aceitas

- “Quais são minhas pendências?”
- “Tenho encomendas na portaria?”
- “Quais são minhas próximas reservas?”
- “Tenho boleto vencendo?”
- “Quais comunicados estão ativos?”
- “Como estão minhas ocorrências?”
- “Quais visitantes estão autorizados?”

### Comandos

- `/menu`
- `/pendencias`
- `/encomendas`
- `/reservas`
- `/financeiro`
- `/comunicados`
- `/ocorrencias`

O bot também apresenta botões para navegar entre as consultas.

## Privacidade

O morador é identificado pelo `telegram_chat_id` previamente vinculado. As consultas consideram somente:

- seu usuário;
- seu cadastro de morador;
- sua unidade;
- seus registros relacionados.

Respostas e tipos de consulta ficam registrados em `telegram_concierge_logs` para auditoria, sem guardar o arquivo bruto de áudio.

## Áudio

O comportamento segue o padrão solicitado:

- mensagem escrita recebe resposta escrita;
- mensagem de voz recebe resposta de voz;
- se a voz estiver temporariamente indisponível, o sistema responde em texto;
- o áudio recebido é baixado temporariamente do Telegram, transcrito e descartado;
- o áudio de resposta é gerado pelo serviço de voz configurado no sistema.

### Voz

O serviço deve oferecer endpoint compatível com:

```text
POST /v1/audio/speech
```

Configuração no Render:

```env
VR_TTS_BASE_URL=https://SEU-SERVICO-DE-VOZ
VR_TTS_API_KEY=SUA_CHAVE_PRIVADA
VR_TTS_VOICE=pt-BR-FranciscaNeural
VR_TTS_RESPONSE_FORMAT=opus
VR_TELEGRAM_CONCIERGE_AUDIO_ENABLED=true
```

O projeto `openai-edge-tts` pode ser usado como serviço separado. Informe a raiz do serviço em `VR_TTS_BASE_URL`; o Vitória Régia acrescenta `/v1/audio/speech` automaticamente.

### Transcrição

A transcrição precisa de endpoint compatível com:

```text
POST /audio/transcriptions
```

Configuração sugerida:

```env
VR_STT_BASE_URL=https://api.openai.com/v1
VR_STT_API_KEY=SUA_CHAVE_PRIVADA
VR_STT_MODEL=whisper-1
```

Também é possível configurar diretamente:

```env
VR_STT_ENDPOINT=https://SEU-SERVICO/audio/transcriptions
```

Nunca grave chaves no GitHub, frontend, APK ou mensagem do Telegram. Use apenas Secret Files ou Environment Variables protegidas no Render.

## Variáveis gerais

```env
VR_TELEGRAM_CONCIERGE_ENABLED=true
VR_TELEGRAM_CONCIERGE_AUDIO_ENABLED=true
VR_TELEGRAM_CONCIERGE_MAX_ITEMS=5
VR_CONCIERGE_POOL_MAX=2
```

## Webhook

O webhook atual já aceita `message` e `callback_query`. Após o deploy, abra Configurações do Telegram no sistema e execute novamente **Configurar webhook** para confirmar o endereço e o segredo atuais.

## Teste de aceite

1. Abrir Gestão Integrada no celular e confirmar que nenhum texto ultrapassa os cards.
2. Rolar Cadastro, Reserva e Configurações; a barra interna deve permanecer no topo do painel sem cobrir campos.
3. No Telegram, enviar `/menu`.
4. Enviar `minhas pendências` em texto e verificar resposta em texto.
5. Enviar áudio: `Quais encomendas eu tenho?` e verificar resposta em áudio.
6. Testar Reservas, Financeiro, Comunicados e Ocorrências.
7. Confirmar que uma resposta do concierge sobre encomendas não inicia chamada pelo CallMeBot.

## Logs esperados

```text
[telegram-concierge] Concierge de texto e áudio ativado.
[telegram-calls] Chamadas contextuais e UTF-8 ativadas.
[telegram-calls] Integração CallMeBot carregada.
```

## Limitações transparentes

- sem `VR_STT_BASE_URL` e `VR_STT_API_KEY`, o bot não consegue compreender áudios;
- sem `VR_TTS_BASE_URL`, a consulta por áudio retorna em texto;
- o resultado depende de o Telegram do morador já estar vinculado;
- o concierge não altera dados financeiros, reservas ou encomendas nesta versão: ele consulta e apresenta informações;
- emergências continuam usando o fluxo específico de aprovação e chamadas já existente.
