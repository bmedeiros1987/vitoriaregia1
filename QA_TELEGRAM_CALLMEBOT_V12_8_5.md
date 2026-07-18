# QA — Chamadas Telegram / CallMeBot v12.8.5

## Validação técnica

- [ ] `node --check server/src/telegram-callmebot-preload.mjs`
- [ ] `node --check server/src/index.js`
- [ ] `node --check client/public/telegram-calls.js`
- [ ] `server/package.json` válido
- [ ] `client/package.json` válido
- [ ] `package.json` válido
- [ ] CSS e JavaScript carregados por `client/index.html`
- [ ] inicialização mantém `npm start`
- [ ] logs exibem `Preload ativo` e `Integração CallMeBot carregada`

## Vínculo e consentimento

1. Usuário sem Telegram vinculado:
   - tela mostra vínculo pendente;
   - teste não deve ser tratado como sucesso.
2. Usuário com `chat_id`, mas sem `@username`:
   - mensagens continuam funcionando;
   - chamada é bloqueada com orientação clara.
3. Usuário vinculado e autorizado no CallMeBot:
   - botão de teste solicita a chamada;
   - nova tentativa em menos de um minuto é bloqueada.
4. Chamadas desativadas pelo morador:
   - notificações Telegram continuam chegando;
   - nenhuma chamada automática é iniciada.

## Preferências

- [ ] emergência ligada/desligada
- [ ] visitante ligado/desligado
- [ ] interfone ligado/desligado
- [ ] encomenda urgente ligada/desligada
- [ ] encomenda comum desligada por padrão
- [ ] comunicado desligado por padrão
- [ ] horário silencioso cruzando meia-noite
- [ ] emergência ignorando horário silencioso
- [ ] preferências persistem após sair e entrar novamente

## Fluxos automáticos

### Emergência

- mensagem Telegram é enviada normalmente;
- chamada é solicitada após aproximadamente 2 segundos;
- mensagens duplicadas no intervalo de deduplicação não geram nova chamada;
- chamada aparece no histórico.

### Visitante

- mensagem informa que o visitante aguarda na portaria;
- chamada é solicitada após aproximadamente 20 segundos;
- desativar a categoria impede a chamada.

### Interfone

- aviso de tentativa de contato é enviado;
- chamada ocorre após aproximadamente 10 segundos.

### Encomenda urgente

- item marcado como medicamento, perecível ou urgente inicia chamada;
- encomenda comum não liga enquanto a opção estiver desativada.

## Chamada manual

- perfil morador não vê o formulário administrativo;
- portaria localiza o destinatário pela unidade;
- unidade inexistente retorna erro;
- usuário sem `@username` retorna orientação;
- mensagem é limitada e sanitizada;
- chamada aceita aparece no histórico;
- tentativa duplicada é bloqueada.

## Segurança

- [ ] endpoints de status, preferências, teste, chamada manual e histórico rejeitam acesso sem sessão
- [ ] morador não consegue acionar chamada manual
- [ ] navegador não escolhe diretamente um `@username`
- [ ] URL de áudio MP3 inválida ou expirada retorna 403
- [ ] credenciais privadas não aparecem nas respostas da API
- [ ] logs não registram segredos

## Compatibilidade

- [ ] computador
- [ ] Android
- [ ] iPhone/iPad com aviso de limitação de áudio
- [ ] menu lateral expandido
- [ ] menu lateral recolhido
- [ ] menu horizontal
- [ ] tela pequena

## Voz neural opcional

- modo padrão funciona sem serviço TTS separado;
- com Edge-TTS habilitado, o endpoint assinado retorna MP3;
- token expirado é recusado;
- falha do serviço TTS não expõe credenciais;
- voltar `VR_TELEGRAM_CALL_USE_EDGE_TTS=false` restaura o TTS do CallMeBot.
