---
impacto: exige_acao
secao: corrigido
titulo: Só o servidor grava o número do WhatsApp de um canal
---

Um Dono conseguia, falando direto com o banco pelo navegador, gravar no próprio canal o número de
WhatsApp de outra empresa (se o canal dela estivesse excluído ou ainda não cadastrado). O bot e o
catálogo de produtos acham a empresa por esse número, então isso poderia misturar dados de duas lojas.
Agora o número e os outros dados que identificam o canal só mudam pelo servidor (tela de Conexões,
que valida o número na Meta) ou pela Gestão Treenity. Nome do canal e o resto continuam como antes.

## Requer atenção

Aplicar a migration `0247_identidade_do_canal_so_pelo_servidor.sql` no Supabase de produção (SQL Editor)
antes do deploy.
