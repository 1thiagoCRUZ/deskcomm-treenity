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
