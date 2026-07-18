# Vitória Régia One v14 — assinatura, contrato e ASAAS

## Objetivo

A assinatura da plataforma é independente do financeiro interno do condomínio. Receitas, despesas, boletos e balancetes condominiais continuam em seus módulos próprios. A mensalidade do Vitória Régia One é processada diretamente pela conta ASAAS configurada pela administradora da plataforma.

## Variáveis protegidas no Render

Cadastre manualmente no serviço de produção:

```text
APP_VERSION=Vitória Régia One v14.0.0
VITE_APP_VERSION=Vitória Régia One v14.0.0
VR_BUILD_REVISION=20260718k
PLATFORM_TRIAL_DAYS=60
PLATFORM_CONTRACT_VERSION=VR-ONE-2026.07-v1
PLATFORM_OWNER_EMAIL=<e-mail do administrador geral>
PLATFORM_OWNER_DATA_ACCESS=false
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_KEY=<chave da conta ASAAS que receberá os pagamentos>
ASAAS_WEBHOOK_TOKEN=<token forte e exclusivo>
ASAAS_MONTHLY_VALUE=<valor mensal com ponto decimal>
ASAAS_PLAN_NAME=Vitória Régia One
ASAAS_PLAN_DESCRIPTION=Licença mensal do sistema de gestão condominial Vitória Régia One
PUBLIC_APP_URL=<endereço público HTTPS do sistema>
```

Não grave chaves, tokens, CPF, CNPJ ou credenciais no GitHub.

## Implantação recomendada

1. Comece com `ASAAS_ENVIRONMENT=sandbox`.
2. Faça o deploy da v14.
3. Entre com o síndico ou subsíndico.
4. Abra **Painel do síndico → Assinatura**.
5. Leia e aceite o contrato eletrônico.
6. Crie o checkout e conclua um pagamento no Sandbox.
7. Confirme que o webhook alterou o status apenas depois da confirmação financeira.
8. Teste vencimento, cancelamento, estorno e evento duplicado.
9. Depois da homologação, troque para `ASAAS_ENVIRONMENT=production` e use a chave de produção.

## Webhook

Cadastre no ASAAS o endpoint:

```text
https://SEU-DOMINIO/api/platform/subscription/asaas/webhook
```

Configure no ASAAS o mesmo token usado em `ASAAS_WEBHOOK_TOKEN`. O sistema rejeita webhooks sem esse token e registra cada evento de forma idempotente.

A assinatura só passa para ativa após evento de pagamento confirmado ou recebido. Criação de checkout ou de assinatura não é tratada como pagamento.

## Teste gratuito

O teste dura 60 dias a partir da criação do registro da plataforma. A data de primeira cobrança enviada ao ASAAS é posterior ao término do teste. O sistema mostra os dias restantes no Painel do síndico.

## Contrato eletrônico

O aceite registra:

- nome e documento do signatário;
- perfil e usuário autenticado;
- versão do contrato;
- resumo criptográfico do texto;
- data e hora;
- endereço IP;
- identificação do navegador ou aplicativo;
- confirmações expressas de leitura, representação e privacidade;
- protocolo eletrônico.

O modelo incluído oferece rastreabilidade técnica, mas a versão comercial definitiva deve conter os dados completos da empresa, preço, regras de cancelamento, foro e política de tratamento de dados, com revisão de advogado antes da comercialização em escala.

## Política administrativa

Ao existir síndico ou subsíndico ativo:

- administradores genéricos locais são desativados;
- o administrador geral da plataforma permanece como `master`;
- o administrador geral recebe escopo técnico;
- o acesso do administrador geral a dados sensíveis do condomínio permanece bloqueado por padrão;
- a política é aplicada no banco por gatilho e não depende apenas da interface.

Defina `PLATFORM_OWNER_EMAIL` antes do primeiro deploy da v14 para identificar corretamente o administrador geral.

## Auditoria

O painel verifica:

- conexão e estrutura do banco;
- usuários duplicados;
- vínculos órfãos;
- política de administradores;
- quantidade de proprietários técnicos;
- manutenções vencidas;
- encomendas antigas;
- configuração de Telegram, e-mail e ASAAS;
- estouro horizontal;
- IDs duplicados no HTML;
- itens simultaneamente ativos no menu;
- botões sem identificação acessível.

A auditoria é diagnóstica. Itens com atenção devem ser revisados antes de uma apresentação, implantação ou venda.
