---
impacto: exige_acao
secao: adicionado
titulo: Catálogo de produtos no banco para o bot de vendas consultar no lugar da planilha
---

O bot passa a ter onde consultar os produtos da loja (preço, estoque, link), o que sabemos de cada um
(para que serve, dose, indicações) e as palavras que o cliente usa para pedir ("cigarrinha", "rabo de
burro"). Cada empresa só enxerga os próprios produtos.

## Requer atenção

Aplicar a migration `0246_catalogo_de_produtos_do_bot.sql` no Supabase de produção (SQL Editor) antes
de ligar o fluxo novo do bot no n8n.

## Como o bot usa

- Quando o cliente pede um nome que serve para vários produtos ("Topfix"), o bot recebe a lista de
  até 5 nomes e pergunta qual deles, em vez de ficar sem resposta.
- O leitor do site pode avisar que a loja não controla estoque ou que a promoção acabou; aí o estoque
  ou o "preço de" ficam vazios. Sem esse aviso, um campo que veio vazio mantém o valor anterior.
- Se a leitura do site trouxer menos de 70% dos produtos que estavam no ar (site fora do ar, página
  mudou), nenhum produto é tirado do bot naquela rodada.
- Se a loja tirar de verdade mais de 30% dos produtos de uma vez, a trava acima segura a limpeza em
  todas as rodadas. Nesse caso, tirar à mão no SQL Editor (depois de conferir no site):
  `update public.produtos set ativo = false where organization_id = '<empresa>' and origem = 'site'
  and ativo and (lido_do_site_em is null or lido_do_site_em < '<início da última leitura>');`
