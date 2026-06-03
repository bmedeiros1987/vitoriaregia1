# CrewCheck v3.0.5 RC5 — Parser Server + APK File Chooser

Correções principais:

- Parser servidor obrigatório com múltiplas extrações de texto.
- Fallback `pdf-parse` no backend para PDFs que falham no PDF.js.
- Bloqueio de escala incompleta: evita exibir apenas uma folga ou programação parcial.
- ASB nunca é classificado como inativo/pernoite.
- MT usa janela real da atividade, evitando `14:00–14:00` quando existir término posterior.
- Voos com origem e destino iguais, como `BSB-BSB` e `CGH-CGH`, são descartados como leitura falsa.
- AIMS com continuação `(...)` tenta juntar prefixo do dia seguinte para identificar destino real.
- CRM/CRMB/CRMBSB = Corporate Resource Management.
- Nota de versão fixa no app e rodapé da tela inicial.
- Android WebView com `onShowFileChooser`, permitindo clicar em Escolher PDF dentro do APK.

Critério de confiança:

- O sistema só aceita leitura com quantidade mínima de dias/eventos.
- Se a leitura for baixa, o upload falha com diagnóstico em vez de mostrar escala enganosa.
