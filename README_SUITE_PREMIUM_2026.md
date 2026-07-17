# Vitória Régia Pro — Gestão Integrada 2026

## Entrega

Os recursos anteriormente agrupados sob o nome “Suite Premium” agora aparecem diretamente dentro do Vitória Régia, no menu principal **Gestão** e em atalhos definidos conforme o perfil do usuário.

A implementação continua preservando as telas existentes e não modifica o esquema do PostgreSQL.

### Módulos implementados

- visão executiva com indicadores operacionais e financeiros;
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

## Integração visual

- o botão flutuante “Suite Premium” não é mais exibido;
- a entrada principal aparece no menu lateral como **Gestão**;
- atalhos como Convites, Manutenção, Governança, Serviços e Conselho aparecem de acordo com o perfil;
- a central ocupa a área normal do conteúdo, mantendo o menu principal visível;
- no celular, os módulos são apresentados como abas horizontais;
- perfis sem acesso administrativo não visualizam Demonstração ou Planos e proposta.

## Segurança

As ações reais reutilizam autenticação, token e permissões do backend. A Gestão Integrada não amplia privilégios automaticamente. Perfis sem permissão recebem a resposta de acesso negado do servidor.

## Governança e integrações

O módulo de assembleia é uma implementação piloto para organização e demonstração. Para votação remota com efeitos jurídicos, devem ser adicionados autenticação individual reforçada, regras da convenção e trilha específica de assinatura.

A área de integração prepara URLs e parâmetros, mas câmeras, fechaduras e controladores exigem documentação e credenciais do fabricante para conexão efetiva.

## Apresentação

Depois do login, abra **Gestão** no menu lateral. Para uma reunião, administradores e síndicos podem acessar **Demonstração**, percorrer as jornadas e finalizar em **Planos e proposta**.
