# Vitória Régia — Sistema Premium App v3.7.0-mysql-premium-app

Esta versão foi criada com base no conceito premium solicitado e na foto real do prédio enviada.

## Principais mudanças

- Tela inicial com a foto real do prédio.
- Login apenas com **usuário/e-mail e senha**.
- Sem seleção pública de perfil, unidade, morador, síndico ou portaria.
- O perfil é detectado automaticamente pelo usuário cadastrado.
- Síndico pode ser morador, terceiro ou empresa terceirizada.
- Permite trocar/reatribuir o síndico por outro morador ou terceiro pelo menu Usuários.
- Mantém os módulos restaurados: financeiro, reservas, visitantes, encomendas, comunicados, portaria, automações, arquivos/nuvem, serviços, contato, escala, central premium e configurações.
- Seção **Baixar aplicativos** com Morador, Síndico e Portaria.
- Projetos Android incluídos em `android-morador`, `android-sindico` e `android-portaria`.
- CSS premium responsivo para celular e PC.

## Deploy

Envie todo o conteúdo deste ZIP para a raiz do repositório GitHub e faça Manual Deploy no Render.

Confirme estes arquivos:

```txt
index.html
app.js
styles.css
backend/src/server.js
backend/src/db.js
assets/condominio-fachada.png
android-morador/
android-sindico/
android-portaria/
VERSION.json
```

## Atualização v3.8.0

- Recuperação de senha por e-mail somente para usuários já aprovados.
- Senha temporária simples e aleatória no formato `VR-000000`.
- Workflow do GitHub Actions para gerar APKs de Morador, Síndico e Portaria.
- Pacote iOS/PWA preparado para publicação no Xcode ou instalação pelo Safari.
