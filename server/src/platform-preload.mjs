import express from 'express';
import { ensureSchema,currentUser,managerRole,condoSigner,subscription,subscriptionView,send,privacyGuard,auditSnapshot,adminPolicyStatus,claimOwner } from './platform-core.mjs';
import { contractView,acceptContract } from './platform-contract.mjs';
import { asaasConfigView,createCheckout,webhookAuthorized,processWebhook } from './platform-asaas.mjs';

ensureSchema().catch(error=>console.error('Inicialização da plataforma:',error.message));

async function handle(req,res,next){
  if(!req.path.startsWith('/api/platform'))return privacyGuard(req,res,next);
  try{
    await ensureSchema();
    if(req.path==='/api/platform/subscription/asaas/webhook'&&req.method==='POST'){
      if(!webhookAuthorized(req))return send(res,401,{error:'Webhook não autorizado.'});
      return send(res,200,await processWebhook(req.body||{}));
    }
    const user=await currentUser(req);
    if(!managerRole(user))return send(res,403,{error:'Área disponível para gestão condominial e administração geral.'});
    if(req.path==='/api/platform/subscription/status'&&req.method==='GET')return send(res,200,{ok:true,subscription:subscriptionView(await subscription()),asaas:asaasConfigView(),privacy:{platform_owner:Boolean(user.platform_owner),system_data_access:user.system_data_access!==false}});
    if(req.path==='/api/platform/contract'&&req.method==='GET')return send(res,200,{ok:true,contract:contractView()});
    if(req.path==='/api/platform/contract/accept'&&req.method==='POST'){
      if(!condoSigner(user))return send(res,403,{error:'O contrato deve ser aceito pelo síndico ou subsíndico responsável.'});
      return send(res,201,await acceptContract(req,user));
    }
    if(req.path==='/api/platform/subscription/checkout'&&req.method==='POST'){
      if(!condoSigner(user))return send(res,403,{error:'Somente síndico ou subsíndico pode iniciar a contratação.'});
      return send(res,201,await createCheckout(req,user));
    }
    if(req.path==='/api/platform/audit/full'&&req.method==='GET')return send(res,200,{ok:true,audit:await auditSnapshot()});
    if(req.path==='/api/platform/admin-policy/status'&&req.method==='GET')return send(res,200,{ok:true,users:await adminPolicyStatus(),policy:{generic_admin_deactivated_when_manager_exists:true,platform_owner_sensitive_data_blocked:true}});
    if(req.path==='/api/platform/admin-policy/claim-owner'&&req.method==='POST'){
      if(!['master','admin'].includes(String(user.role||'').toLowerCase()))return send(res,403,{error:'Somente o administrador atual pode assumir a propriedade técnica.'});
      if(String(req.body?.confirmation||'').trim().toUpperCase()!=='ASSUMIR ADMINISTRAÇÃO GERAL')return send(res,400,{error:'Digite a frase de confirmação exatamente como apresentada.'});
      return send(res,200,await claimOwner(user));
    }
    return send(res,404,{error:'Recurso da plataforma não encontrado.'});
  }catch(error){return send(res,error.status||500,{error:error.message||'Não foi possível processar a solicitação.'});}
}

const originalUse=express.application.use;
express.application.use=function(...args){
  const result=originalUse.apply(this,args);
  this.__vrPlatformUseCount=(this.__vrPlatformUseCount||0)+1;
  if(!this.__vrPlatformInstalled&&this.__vrPlatformUseCount>=2){this.__vrPlatformInstalled=true;originalUse.call(this,handle);}
  return result;
};
