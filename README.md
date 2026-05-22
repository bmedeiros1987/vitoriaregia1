# Sistema Vitória Régia — versão 3.1.0

Pacote completo do sistema condominial Vitória Régia.

## Melhorias desta versão

- Layout premium responsivo para celular e PC.
- Menu lateral compacto, com expansão ao passar o mouse no PC e menu deslizante no celular.
- Tela inicial limpa, exibindo apenas usuário e senha.
- Perfil reconhecido automaticamente pelo login e senha cadastrados.
- Remoção dos botões duplicados de emergência.
- Um único botão discreto de emergência com giroflex em todas as páginas.
- Botão de voltar para Dashboard nas páginas internas.
- Dashboard com imagem do prédio, saudação automática e ações rápidas clicáveis.
- Encomendas e visitantes com foto/imagem vinculada à notificação.
- Comunicados com prazo de visibilidade configurável.
- Reset de emergência por síndico, subsíndico, portaria ou administrador.
- Central de atualização em Configurações.
- Backup e restauração de backup.
- Versão atual exibida no rodapé.
- Backend tolerante a falha de banco para evitar queda total do site.

## Arquivos críticos

```txt
index.html
app.js
styles.css
render.yaml
backend/package.json
backend/src/server.js
assets/building-bg.svg
```

## Como subir pelo PC

1. Extraia este ZIP.
2. Envie todo o conteúdo extraído para a raiz do repositório `vitoriaregia1`.
3. Não deixe os arquivos dentro de uma pasta extra.
4. Confirme que `backend/src/server.js` existe no GitHub.
5. No Render, faça Manual Deploy.

## Primeiro acesso

A tela inicial mostra apenas usuário e senha. Se ainda não houver usuários cadastrados, o primeiro login cria um administrador técnico automaticamente. Depois, cadastre os usuários reais em **Usuários** e, se desejar, bloqueie o primeiro acesso automático em **Configurações**.

Para maior segurança em produção, configure no Render:

```env
ADMIN_USERNAME=seu_usuario_admin
ADMIN_PASSWORD=sua_senha_forte
ADMIN_NAME=Administrador
SESSION_SECRET=uma_chave_grande
REQUIRE_DATABASE=false
```

## Validação local

```bash
node verificar_arquivos_criticos.js
node --check app.js
cd backend && npm install && npm run check
```
