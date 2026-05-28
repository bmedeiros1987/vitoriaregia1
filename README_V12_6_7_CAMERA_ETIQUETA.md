# Vitória Régia Pro v12.6.7 — Câmera do Leitor Automático

Correção cumulativa para abertura da câmera do celular na leitura automática de etiquetas de encomendas.

## Incluído

- Novo botão **Abrir câmera do celular** em Portaria > Encomendas.
- Captura ao vivo via câmera traseira usando `navigator.mediaDevices.getUserMedia`.
- Modal com guia visual para alinhar etiqueta.
- Conversão da captura em imagem e envio direto para o OCR.
- Mantido botão alternativo **Escolher foto/usar câmera padrão** para aparelhos que não liberarem câmera ao vivo.
- Aviso de permissão quando Android/APK bloquear câmera.

## Orientação

No Android/APK, confira:

Configurações > Apps > Vitória Régia Portaria > Permissões > Câmera > Permitir.

Se estiver usando navegador, abra o sistema em HTTPS e permita o uso da câmera quando solicitado.
