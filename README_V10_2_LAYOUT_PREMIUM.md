# Vitória Régia Pro v10.2 — Layout Premium Mobile/Desktop

Esta versão redesenha a experiência visual com base no layout premium aprovado:

- tela de login com a foto real do prédio;
- logo residencial baseada na arquitetura do edifício;
- menu lateral expansível/recolhível;
- dashboard com cards premium e módulos clicáveis;
- adaptação automática para desktop, tablet e celular;
- barra inferior no celular;
- botão flutuante de emergência preservado;
- todas as funcionalidades das versões anteriores mantidas.

Depois de publicar no GitHub, use no Render: Manual Deploy → Clear build cache & deploy.

## Publicação

Para subir pelo Mac:

```bash
cd ~/Downloads
unzip -o vitoriaregia_pro_v10_2_layout_premium_mobile_mac.zip
cd vitoriaregia_pro_v10_2_layout_premium_mobile
chmod +x publicar_github_mac_linux.sh
bash publicar_github_mac_linux.sh
```

Depois, no Render:

```text
Manual Deploy → Clear build cache & deploy
```

## Atualizações pelo painel

A versão mantém validação por código/token, hash SHA-256 e bloqueio de arquivos perigosos. Para os pacotes gerados aqui, configure:

```text
UPDATE_REQUIRE_SIGNATURE=false
```
