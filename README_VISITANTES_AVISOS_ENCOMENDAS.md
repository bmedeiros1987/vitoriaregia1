# Atualização — visitantes recorrentes, avisos segmentados e encomendas

Esta versão adiciona:

- aba de visitantes recorrentes com navegação por unidade;
- busca rápida por nome, documento, unidade e tipo de serviço;
- cartões de visitantes recorrentes com categoria, dias da semana, pré-autorização e metadados de foto;
- cadastro de morador com grau de parentesco/relação e indicação de pet;
- comunicados segmentados para todos, moradores com pet, unidade específica, unidades alugadas, proprietários/responsáveis ou inquilinos;
- aviso de encomenda por e-mail para todos os moradores da unidade;
- se a unidade estiver marcada como alugada, o aviso de encomenda é enviado preferencialmente apenas aos inquilinos.

Observação: fotos e arquivos não são gravados no banco em base64. Para exibir fotos reais de forma persistente em produção, use storage externo como Cloudflare R2, S3 ou Supabase Storage e salve no banco apenas a chave/URL do arquivo.
