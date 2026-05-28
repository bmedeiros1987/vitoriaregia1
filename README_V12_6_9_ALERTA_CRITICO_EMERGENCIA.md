# Vitória Régia Pro v12.6.9 — Alerta crítico de emergência

## Correções

- Corrige o local da emergência quando o frontend enviava `login`.
- Se o alerta partir de morador, usa a unidade do cadastro/login.
- Se partir da portaria ou celular da portaria, grava `Portaria`.
- Se partir de funcionário, grava a função/local informado em vez de `login`.
- Alerta crítico persistente no sistema para síndico, subsíndico, portaria, usuários e moradores.
- Notificações de emergência recebem payload `critical/emergency` para vibração e notificação persistente.
- Push do navegador para usuários internos, além de moradores.

## Observação técnica

Navegadores e Android/iOS comuns não conseguem garantir nível Defesa Civil nem furar modo Não Perturbe sem permissões nativas privilegiadas. Esta versão aplica o máximo possível no sistema web/PWA/APK comum: `requireInteraction`, vibração longa, tela persistente e alerta sonoro quando o app está aberto.
