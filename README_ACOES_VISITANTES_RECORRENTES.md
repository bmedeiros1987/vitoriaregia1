# Atualização — ações pendentes, visitantes recorrentes e login sem Google

Esta versão adiciona:

- painel de **ações pendentes** no dashboard para síndico e portaria;
- alerta de encomendas não retiradas;
- alerta de reservas pré-agendadas/não concluídas;
- alerta de cadastros e solicitações pendentes para o síndico;
- cadastro de **visitantes recorrentes/prestadores de serviço** pelo morador, síndico ou portaria;
- tipos de serviço: faxineira, diarista, eletricista, pedreiro, encanador, pintor, técnico de internet/TV, cuidador, babá e outros;
- opção de **entrada pré-autorizada sem interfone**;
- validade por data e dias da semana;
- busca rápida da portaria por nome, documento, apartamento ou serviço;
- captura de foto para conferência visual, sem salvar a imagem em base64 no banco;
- registro da entrada recorrente no histórico de visitantes;
- logs das ações relevantes;
- remoção do botão e das rotas de **login com Google**.

## Observação sobre reconhecimento facial

Por segurança e privacidade, o sistema **não faz identificação facial automática**. A opção por foto serve para a portaria capturar uma imagem e fazer conferência visual com o cadastro do visitante recorrente. Para reconhecimento facial biométrico real, seria necessário consentimento formal, política de privacidade específica, armazenamento seguro de biometria e avaliação jurídica/LGPD.

## Render

Mantenha:

```bash
Build Command:
cd backend && npm install

Start Command:
cd backend && npm start
```

Variáveis importantes:

```env
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
ALLOW_LEGACY_DEMO_LOGIN=false
GOOGLE_AUTH_ENABLED=false
```
