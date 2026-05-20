# Leitura automática de etiqueta de encomendas

Esta versão melhora o cadastro de encomendas para facilitar o trabalho da portaria.

## O que foi incluído

- Botão **Fotografar/ler etiqueta** no cadastro de encomendas.
- Leitura de QR Code e código de barras pelo navegador quando houver suporte nativo.
- OCR local no navegador pela câmera/foto quando a etiqueta não tiver QR/código legível.
- Preenchimento automático de:
  - apartamento/unidade;
  - destinatário;
  - transportadora;
  - código de rastreio;
  - texto bruto da etiqueta.
- Sugestão de apartamento pelo nome do morador cadastrado quando a etiqueta não trouxer a unidade.
- Exibição de confiança da leitura e avisos para conferência antes de registrar.
- Campo **Local na portaria** para facilitar a retirada: armário, prateleira, escaninho etc.
- Campo **Tipo de volume**: encomenda, envelope, caixa pequena, caixa grande, mercado/delivery ou documento.

## Privacidade e banco de dados

A foto da etiqueta é processada no navegador do porteiro. O sistema não salva a foto no banco de dados.

O banco salva apenas os dados textuais necessários ao controle da encomenda, como unidade, destinatário, transportadora, código, local de armazenamento e observações.

## Dicas para melhor leitura

- Fotografar a etiqueta com boa iluminação.
- Evitar sombra sobre o código de barras.
- Enquadrar o nome do destinatário e o código de rastreio.
- Quando o OCR não identificar a etiqueta, o porteiro pode colar o texto manualmente e clicar em **Preencher pelo texto**.

## Deploy

Após subir no GitHub, mantenha no Render:

```bash
Build Command:
cd backend && npm install
```

```bash
Start Command:
cd backend && npm start
```
