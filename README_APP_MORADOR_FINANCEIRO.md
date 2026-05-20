# Atualização — App Morador, encomendas e financeiro

Esta versão adiciona:

- Projeto Android WebView para moradores (`android-morador/`);
- Botões de download para APK da portaria e APK do morador;
- Workflow `Build Android APKs` para gerar os dois APKs no GitHub Actions;
- Encomendas visíveis para o morador da própria unidade;
- Últimos visitantes da unidade no dashboard do morador, usando o horário cadastrado no sistema;
- Bloqueio de retirada de encomenda até haver notificação registrada ao morador;
- Menu financeiro ampliado para o síndico com gastos fixos, gastos casuais, reserva financeira e OCR de nota/cupom pelo celular;
- Opção de tornar lançamentos financeiros públicos ou privados;
- Moradores visualizam apenas lançamentos marcados como públicos;
- Imagens de notas/etiquetas não são salvas no banco. O sistema usa OCR local para extrair texto e salva apenas dados/metadados.

## Render

Mantenha:

```bash
Build Command:
cd backend && npm install

Start Command:
cd backend && npm start
```
