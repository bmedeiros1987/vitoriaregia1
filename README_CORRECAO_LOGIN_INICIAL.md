# Correção — página inicial somente com login

Correção aplicada para impedir que o dashboard seja exibido automaticamente sem autenticação explícita.

## Arquivos alterados

- `index.html`
  - Adicionada a classe inicial `auth-locked` no elemento `<html>`.

- `styles.css`
  - Adicionadas regras que mantêm o aplicativo oculto enquanto o sistema está bloqueado para autenticação.

- `app.js`
  - Removida a dependência de sessão salva em `localStorage` para reabrir o sistema.
  - Adicionado controle por `sessionStorage` apenas para a aba autenticada.
  - A inicialização agora começa sempre com o app oculto e a tela de login visível.
  - A restauração de sessão pelo backend só ocorre quando a própria aba já foi autenticada.
  - O logout limpa a autenticação da aba e volta para o login.

## Resultado esperado

Ao abrir a página inicial em uma nova aba/sessão, o usuário verá somente a área de login. O dashboard só será exibido após login válido com e-mail e senha.

## Testes realizados

- `node --check app.js`
- `node --check backend/src/server.js`
- Verificação estática de bloqueio inicial (`auth-locked`), ocultação do app e ausência de reabertura por `localStorage`.
