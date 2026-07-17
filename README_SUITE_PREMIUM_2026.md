# Vitória Régia Pro — Suite Premium 2026

## Entrega

A Suite Premium foi adicionada como uma camada independente sobre o sistema atual. Ela não substitui as telas existentes nem modifica o esquema do PostgreSQL.

### Módulos implementados

- central executiva com indicadores operacionais e financeiros;
- modo demonstração guiada com dados fictícios claramente identificados;
- painel de resultados e metas para os primeiros 90 dias;
- convite de visitante com QR Code, código alternativo, impressão e compartilhamento;
- manutenção preventiva com agenda, custos, fornecedores e checklist;
- livro digital da portaria e resumo para troca de turno;
- auditoria visível, pesquisa e exportação CSV;
- governança piloto com assembleias, pautas, quórum e votação demonstrativa;
- central de mudanças, achados e perdidos, pets, prestadores, pesquisas e aceites;
- configuração preparatória para câmeras e controladores de acesso;
- painel do conselho fiscal e conciliação assistida de extratos/PIX;
- calculadora de preços, planos e proposta comercial imprimível;
- fila offline para operações compatíveis e sincronização após reconexão;
- suporte à instalação PWA no celular.

## Segurança

As ações reais reutilizam autenticação, token e permissões do backend. A Suite não amplia privilégios automaticamente. Perfis sem permissão de gestão recebem a resposta de acesso negado do servidor.

## Governança e integrações

O módulo de assembleia é uma implementação piloto para organização e demonstração. Para votação remota com efeitos jurídicos, devem ser adicionados autenticação individual reforçada, regras da convenção e trilha específica de assinatura.

A área de integração prepara URLs e parâmetros, mas câmeras, fechaduras e controladores exigem documentação e credenciais do fabricante para conexão efetiva.

## Apresentação

Depois do login, use o botão **Suite Premium** no canto inferior esquerdo. Para uma reunião, ative **Demonstração**, percorra as jornadas e finalize em **Planos e proposta**.
