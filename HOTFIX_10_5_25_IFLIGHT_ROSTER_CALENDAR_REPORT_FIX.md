# HOTFIX 10.6.0 — iFlight via Roster Calendar antes de Roster Report

Esta revisão corrige o caso em que o CrewCheck ainda podia permanecer na **tela cinza** ou na tela inicial do iFlight após o login, sem avançar até o relatório da escala. O ajuste principal foi mudar a estratégia de navegação automática: em vez de tentar abrir diretamente **Roster Report** a partir do menu, a automação agora prioriza o caminho **Menu → Roster → Roster Calendar → Roster Report**.

## Causa provável

Pelas imagens do fluxo e pela análise passiva limitada do comportamento esperado, o layout móvel do iFlight pode exigir que o usuário entre primeiro em **Roster Calendar** para então acionar o botão ou item **Roster Report** dentro da tela do calendário. A versão 10.5.24 já diferenciava menu e formulário, mas ainda tentava alcançar o relatório principalmente pelo item direto de menu, o que podia deixar o app parado quando o portal apresentava a rota intermediária pelo calendário.

## Correções aplicadas

A automação Android foi reescrita como uma máquina de estados mais explícita, com fases de **login**, **home**, **menu**, **calendar**, **form** e **pdf**. Ela continua aguardando login e MFA manual no portal oficial, mas depois passa a monitorar a tela e a executar cliques progressivos, sem solicitar ou armazenar senha do iFlight.

| Área | Comportamento na 10.6.0 |
|---|---|
| Tela cinza ou inicial | Reabre o menu hambúrguer com seletores, coordenadas seguras e fallback nativo. |
| Menu iFlight | Prioriza o clique em **Roster Calendar** e expande **Roster** quando necessário. |
| Roster Calendar | Reconhece a tela do calendário e procura o botão **Roster Report** dentro dela. |
| Roster Report | Preenche datas, seleciona **PDF**, confirma **LT**, aplica legenda quando configurada e aciona **Run**. |
| Diagnóstico | Mostra fase, última ação, URL parcial e trecho de texto detectado para facilitar novos ajustes se o layout do iFlight variar. |

## Validação local

A compilação Java do wrapper Android foi executada com sucesso após a alteração em `MainActivity.java`, confirmando que o bloco JavaScript injetado na WebView e os escapes de regex estão válidos para build Android.

## Versão

A entrega foi atualizada para **CrewCheck 10.6.7**, com `versionCode 10607` e `versionName 10.6.7`. A versão mantém os recursos premium anteriores, incluindo importação de PDF da escala, Google Calendar reforçado, tema claro/escuro e idioma automático pt/en/es.
