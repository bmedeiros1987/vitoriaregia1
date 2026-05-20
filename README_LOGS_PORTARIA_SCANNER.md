# Logs da portaria e leitura de etiqueta de encomenda

Esta versão adiciona dois recursos operacionais:

## 1. Logs de atividades da portaria

O sistema registra ações realizadas por usuários do perfil **Portaria**, como:

- cadastro de visitante;
- remoção de visitante;
- cadastro de encomenda;
- marcação de encomenda como retirada;
- envio de aviso automático de visitante ou encomenda.

Os logs ficam gravados no PostgreSQL, na tabela `activity_logs`.

A tela **Logs da portaria** aparece somente para perfil de **Síndico/Administração**. O subsíndico também acessa como perfil administrativo, conforme regra já existente no sistema.

## 2. Leitura móvel de etiqueta de encomenda

Na tela **Encomendas**, o formulário ganhou uma área de leitura por celular:

- botão **Ler etiqueta com câmera**;
- leitura de QR Code ou código de barras quando o navegador suportar `BarcodeDetector`;
- campo para colar texto da etiqueta;
- botão **Preencher pelo texto**;
- preenchimento automático de apartamento, destinatário, transportadora e código quando esses dados forem identificados.

Observação: se a etiqueta tiver apenas texto impresso comum, sem QR Code/código de barras, o navegador pode não conseguir fazer OCR sozinho. Nesses casos, cole o texto da etiqueta no campo indicado.

## Deploy

No Render, mantenha:

```bash
Build Command:
cd backend && npm install

Start Command:
cd backend && npm start
```

O banco precisa estar ativo com:

```env
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
```

Na primeira inicialização, a tabela `activity_logs` será criada automaticamente.
