---
impacto: exige_acao
secao: adicionado
titulo: Base para trocar a foto do produto e acrescentar fotos e vídeos por produto no bot
---

O banco passa a guardar, para cada produto do catálogo do bot, uma foto própria do dono (que entra
no lugar da foto lida do site) e fotos e vídeos extras, com ordem de envio e a opção de desligar
cada um sem apagar. Cada empresa só enxerga as mídias dos próprios produtos. Nenhuma tela muda
ainda: é só a base para o bot apresentar o produto com a foto certa e mandar as mídias extras.

## Requer atenção

Aplicar a migration `0248_produto_midias.sql` no Supabase de produção (SQL Editor) antes de ligar,
no n8n, a ferramenta do bot que apresenta o produto.

## Regras das mídias

- O endereço é guardado sem a chave de acesso do Azure (o bot acrescenta na hora de enviar).
- Foto só em .jpg, .jpeg ou .png (o WhatsApp não aceita .webp como foto); vídeo só em .mp4.
- Cada produto tem no máximo uma foto principal ligada.
