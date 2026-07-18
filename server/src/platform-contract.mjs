import { CONTRACT_VERSION,TRIAL_DAYS,TENANT_KEY,clean,onlyDigits,sha256,q,ipOf,evidenceNonce,subscription } from './platform-core.mjs';

export const CONTRACT_TEXT=`CONTRATO ELETRÔNICO DE LICENÇA DE USO DO VITÓRIA RÉGIA ONE

1. PARTES E ACEITE. O contratante é o condomínio, representado pelo síndico ou subsíndico identificado no aceite eletrônico. A contratada é a responsável pela disponibilização da plataforma Vitória Régia One. O aceite exige identificação, manifestação expressa e registro técnico de data, hora, endereço IP, agente do dispositivo, versão e resumo criptográfico deste documento.

2. OBJETO. Licença temporária, pessoal, não exclusiva e intransferível de uso do sistema para gestão condominial, comunicação, portaria, visitantes, encomendas, reservas, ocorrências, documentos e recursos contratados.

3. TESTE GRATUITO. O condomínio recebe ${TRIAL_DAYS} dias de teste gratuito. O período não se renova automaticamente. A primeira cobrança recorrente somente poderá vencer após o encerramento do teste, conforme contratação confirmada no ambiente de pagamento.

4. PREÇO E COBRANÇA. O valor, a periodicidade e a forma de pagamento são apresentados antes da contratação. O processamento financeiro é realizado pela conta ASAAS configurada pela administradora da plataforma. O financeiro da assinatura é separado do financeiro interno do condomínio.

5. DADOS E PRIVACIDADE. Cada perfil deve acessar somente informações necessárias à sua função. O administrador geral da plataforma possui escopo técnico e não deve consultar dados pessoais, financeiros ou operacionais sensíveis do condomínio, salvo autorização formal, necessidade de suporte documentada ou obrigação legal.

6. RESPONSABILIDADES DO CONDOMÍNIO. Manter cadastros corretos, proteger credenciais, definir permissões, orientar funcionários e moradores, cumprir a legislação aplicável e comunicar imediatamente suspeitas de acesso indevido.

7. DISPONIBILIDADE E SEGURANÇA. A plataforma aplica controles de autenticação, autorização, auditoria e rastreabilidade. Serviços externos, internet, dispositivos, Telegram, e-mail, ASAAS e infraestrutura de nuvem podem sofrer indisponibilidades fora do controle direto da aplicação.

8. CANCELAMENTO. A assinatura poderá ser cancelada conforme o plano contratado. Obrigações vencidas permanecem exigíveis. A exportação e conservação dos dados observarão os prazos operacionais, legais e de segurança informados no sistema.

9. PROVA ELETRÔNICA. O aceite registrado, seu resumo criptográfico, a versão contratual, a identificação do signatário e os registros de auditoria formam evidência eletrônica da manifestação de vontade. O signatário declara possuir poderes para representar o condomínio.

10. DISPOSIÇÕES GERAIS. A eventual invalidade de uma cláusula não invalida as demais. Alterações relevantes exigem nova versão e novo aceite. O foro e os dados completos da contratada devem constar da versão comercial definitiva.

Declaro que li, compreendi e aceito integralmente este contrato eletrônico.`;

export const contractHash=()=>sha256(`${CONTRACT_VERSION}\n${CONTRACT_TEXT}`);
export function contractView(){return{version:CONTRACT_VERSION,hash:contractHash(),text:CONTRACT_TEXT,trial_days:TRIAL_DAYS,requires_role:['sindico','subsindico'],notice:'O registro eletrônico reforça a prova do aceite. A versão comercial definitiva deve ser revisada por advogado antes da venda em escala.'};}

export async function acceptContract(req,user){
  const body=req.body||{},name=clean(body.full_name||user.name),document=onlyDigits(body.document);
  const accepted=body.accepted===true&&body.authority_confirmed===true&&body.privacy_confirmed===true;
  if(!accepted)throw Object.assign(new Error('Confirme leitura, poderes de representação e tratamento de dados.'),{status:400});
  if(name.length<5||document.length<11)throw Object.assign(new Error('Informe nome completo e CPF/CNPJ válido para registrar o aceite.'),{status:400});
  const hash=contractHash(),evidence={ip:ipOf(req),user_agent:clean(req.headers['user-agent']),accepted_flags:{contract:true,authority:true,privacy:true},nonce:evidenceNonce()};
  const acceptance=(await q('INSERT INTO platform_contract_acceptances(tenant_key,user_id,user_role,full_name,document,contract_version,contract_hash,accepted_ip,user_agent,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,accepted_at',[TENANT_KEY,user.id,user.role,name,document,CONTRACT_VERSION,hash,evidence.ip,evidence.user_agent,JSON.stringify(evidence)])).rows[0];
  await q('UPDATE platform_subscriptions SET contract_version=$1,contract_hash=$2,contract_accepted_by_user_id=$3,contract_accepted_name=$4,contract_accepted_document=$5,contract_accepted_at=$6,updated_at=now() WHERE tenant_key=$7',[CONTRACT_VERSION,hash,user.id,name,document,acceptance.accepted_at,TENANT_KEY]);
  await subscription();
  return{ok:true,protocol:`VR-CONTRATO-${acceptance.id}-${hash.slice(0,10).toUpperCase()}`,accepted_at:acceptance.accepted_at,contract_hash:hash};
}
