# Leitura de etiquetas de encomenda

Esta versão melhora o cadastro de encomendas da portaria para identificar diferentes modelos de etiqueta.

## O que o sistema tenta identificar

- Apartamento/unidade, inclusive quando aparece dentro do endereço do Condomínio Vitória Régia.
- Destinatário/cliente.
- Transportadora, com reconhecimento específico para Jadlog, Correios e outras transportadoras comuns.
- Código principal de rastreio/identificação.
- Pedido ou Nota Fiscal, quando houver.
- CEP e outros códigos encontrados, que ficam disponíveis para conferência.

## Como o porteiro deve fotografar

1. Abrir Encomendas > Fotografar/ler etiqueta.
2. Enquadrar a etiqueta inteira.
3. Evitar reflexo do plástico e sombra sobre o código.
4. Confirmar os dados sugeridos antes de registrar.

## Observação

A foto da etiqueta não é salva no banco de dados. Ela é usada apenas no navegador para leitura OCR/código de barras. O banco guarda somente os campos textuais do cadastro da encomenda e os logs da atividade.
