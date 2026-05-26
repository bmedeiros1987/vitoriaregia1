# Vitória Régia Pro v12.2 — Leitura automática de encomendas e notas

Correções principais:

- Corrige endpoint `/api/ocr/parse-package`, que faltava em algumas versões e causava erro ao carregar etiqueta.
- Melhora a leitura automática de etiquetas de encomenda.
- Suporta padrões comuns como J&T Express, Correios, Jadlog, Loggi, Total Express, Mercado Livre, Amazon, Shopee, Magalu, DHL, FedEx e UPS.
- Preenche somente campos detectados com confiança, preservando os demais campos para conferência manual.
- Detecta unidade/apartamento em variações como apto, apartamento, unidade, AP, APT, CS e trechos com Edifício/Condomínio Vitória Régia.
- Detecta nome do destinatário, transportadora, rastreio, pedido, NF-e, código de barras e remetente quando disponíveis.
- Melhora a leitura automática de notas fiscais do síndico.
- Ajusta espaçamento e alinhamento da tela de encomendas no celular.

Exemplo validado: etiqueta J&T Express enviada pelo usuário com destinatário Bruno Saraiva de Medeiros e unidade 602.
