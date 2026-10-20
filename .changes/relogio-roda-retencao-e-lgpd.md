---
impacto: capacidade_nova
secao: corrigido
titulo: A limpeza diária e a remoção de mídia da LGPD passam a rodar sozinhas na Treenity
---

Na Vercel Hobby nada agendava a poda de históricos antigos nem a remoção de arquivos de contatos
anonimizados, e as anonimizações LGPD que ficavam pela metade nunca eram completadas. O relógio
(GitHub Actions) agora roda `data-retention` e `storage-redaction` uma vez por dia, na janela das
03h (horário de São Paulo).
