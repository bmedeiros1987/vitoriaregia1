# CrewCheck 10.8.2 — Scroll Mobile/iOS

Hotfix para restaurar rolagem vertical nas telas premium sem permitir corte horizontal.

- Libera scroll em `html`, `body`, `#root` e wrappers premium.
- Mantém `overflow-x: hidden` para evitar tela cortada lateralmente.
- Ajusta padding inferior para menu fixo e safe-area do iOS/Android.
- Remove comportamento de tela travada causado por `overflow-hidden`.
