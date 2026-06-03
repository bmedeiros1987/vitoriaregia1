# Correção mobile runtime

Esta versão troca React/React DOM para 18.2.0, usa PDF.js 2.16.105 e muda o Service Worker para network-first em assets.

Objetivo:
- reduzir erro `TypeError: Illegal constructor` em Chrome Android/iOS;
- impedir que o PWA continue executando bundles antigos em cache;
- manter PDF.js carregado somente quando o usuário escolhe PDF.

Depois do deploy, limpe os dados do site/app instalado uma vez no Android/iOS.
