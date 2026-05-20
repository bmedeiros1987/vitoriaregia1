# Leitura reforçada de etiquetas de encomenda

Esta versão melhora o cadastro de encomendas para a portaria.

## O que foi corrigido

- Leitura da imagem em várias regiões da etiqueta, não apenas a foto inteira.
- OCR reforçado para etiquetas com plástico, reflexo e impressão fraca.
- Melhor identificação de etiquetas Jadlog/Vulcabras.
- Melhor extração de apartamento em textos como `ED VITORIA REGIA EDIFICIO VITORIA REGIA 602`.
- Melhor extração de destinatário, transportadora, pedido/nota fiscal e códigos longos.
- Histórico inteligente: quando o porteiro registra uma encomenda com destinatário e apartamento, o sistema passa a lembrar essa associação para próximas etiquetas parecidas.
- A foto da etiqueta continua não sendo salva no banco; é usada apenas no navegador para OCR.

## Como orientar a portaria

1. Fotografar a etiqueta inteira.
2. Evitar reflexo do plástico.
3. Tirar a foto de frente, sem inclinar muito.
4. Conferir os campos antes de registrar.
5. Se a etiqueta não tiver apartamento impresso, o sistema poderá sugerir pelo cadastro do morador ou pelo histórico de etiquetas anteriores.

## Observação

A leitura automática depende da qualidade da imagem e do suporte do navegador/celular ao OCR e à leitura de código de barras. Mesmo com a melhoria, etiquetas amassadas, com reflexo ou impressão apagada podem exigir conferência manual.
