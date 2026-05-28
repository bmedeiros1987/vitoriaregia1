# Vitória Régia Pro v12.7.4 — Leitor Híbrido Premium de Etiquetas

Esta versão adiciona leitura completa de encomendas por câmera com QR Code, código de barras e OCR.

## Inclui

- Aba Portaria > Leitor Premium.
- Detecção de QR Code e códigos de barras quando o navegador/WebView suportar BarcodeDetector.
- OCR da etiqueta com Tesseract.
- Extração de rastreio, unidade, destinatário, transportadora, pedido e NF-e.
- Validação de confiança.
- Anti-duplicidade por rastreio + unidade.
- Cadastro automático seguro quando os dados mínimos têm confiança alta.
- Campos adicionais em packages: carrier, barcode, barcode_format, order_number, invoice_number, validation_status, ocr_confidence e source_type.

## Observação

Em alguns aparelhos o suporte nativo a código de barras depende do navegador/WebView. Quando não houver BarcodeDetector, o sistema usa OCR e captura por foto como fallback.
