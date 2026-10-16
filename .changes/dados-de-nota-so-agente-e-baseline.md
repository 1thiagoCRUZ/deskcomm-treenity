---
impacto: exige_acao
secao: corrigido
titulo: CPF e endereço dos dados de nota só para quem atende, apagados ao anonimizar; instalação do zero volta a funcionar
---

A tabela `contato_dados_de_nota` (CPF cifrado, endereço, CEP, propriedade) deixava qualquer membro da
organização, inclusive `viewer`, ler e gravar direto pela API do banco. Agora a política exige `agent`
ou mais (o mesmo gate da rota) e um gatilho apaga a linha quando o contato é anonimizado, por qualquer
caminho. Também corrige a ordem do `baseline.sql`: o apêndice da migration 0236 vinha depois dos que
dependem dele, e a instalação do zero (e o job `invariants` do CI) falhava.

## Requer atenção

Aplicar a migration `0239_dados_de_nota_so_agente_e_lgpd.sql` no Supabase de produção (SQL Editor).
Até lá o código novo funciona, mas a proteção no banco não está ativa.
