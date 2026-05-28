# Configuração do Telegram da Portaria

Usuário criado:

```txt
@portariavr1
```

## Passo 1 — iniciar o bot

No celular da portaria:

1. Abra o Telegram.
2. Entre com a conta `@portariavr1`.
3. Abra `@vitoriaregia_bot`.
4. Envie `/start`.

## Passo 2 — descobrir o Chat ID

Acesse no navegador:

```txt
https://api.telegram.org/botSEU_TOKEN/getUpdates
```

Procure por:

```json
"username":"portariavr1",
"chat":{"id":123456789}
```

O número do campo `id` é o Chat ID da portaria.

## Passo 3 — cadastrar no Vitória Régia

No sistema:

```txt
Configurações > Notificações > Telegram Portaria Premium
```

Preencha:

```txt
Chat ID da Portaria: ID numérico do @portariavr1
Chat ID padrão/global: 8188648317
```

## Fluxos recomendados

A portaria recebe:

- emergências;
- encomendas aguardando ação;
- autorização do morador para enviar pelo elevador;
- morador informou que vai retirar mais tarde;
- interfone sem contato;
- alertas de revisão de OCR;
- mensagens operacionais do sistema.

O morador recebe:

- mensagem privada quando houver encomenda;
- botões de decisão;
- mensagem quando interfone não atender;
- aviso de emergência quando aplicável.

