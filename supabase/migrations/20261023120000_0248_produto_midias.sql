-- Mídias por produto do catálogo do bot (CADU, no n8n): a foto própria do dono no lugar da
-- imagem lida do site, e imagens/vídeos extras enviados depois da apresentação do produto.
--
-- Por que tabela nova e não a tabela midias do bot: aquela não tem organization_id (é global,
-- chave varchar) e é ligada a praga, não a produto; reaproveitá-la vazaria mídia entre empresas.
-- Aqui segue o padrão da 0246 (produto_conhecimento / produto_termos): FK composta
-- (produto_id, organization_id) -> produtos(id, organization_id), então a mídia fica presa à
-- MESMA empresa do produto, e apagar o produto apaga as mídias.
--
-- papel 'principal' = imagem que o bot usa NO LUGAR de produtos.imagem_url na apresentação
-- (catalogo_apresentacao devolve as duas: imagem_url segue a do site, e a principal vem em
-- primeiro em "midias"; quem escolhe é o n8n). No máximo uma ativa por produto; 'extra' = enviada depois, na ordem de "ordem" (menor primeiro).
-- url é guardada SEM SAS (o n8n acrescenta o SAS do Azure na hora do envio): por isso a url não
-- pode ter '?' nem '#'. Imagem só .jpg/.jpeg/.png (o WhatsApp não aceita webp como imagem);
-- vídeo só .mp4.
--
-- Escrita só pelo servidor (service role / postgres): nenhuma policy de escrita.
-- Leitura para membros da própria empresa, para a futura tela "Produtos".
-- catalogo_apresentacao é SECURITY INVOKER, como as funções da 0246.

create table if not exists public.produto_midias (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  produto_id       uuid not null,
  papel            text not null default 'extra',
  tipo             text not null,
  url              text not null,
  legenda          text,
  descricao        text,
  ordem            integer not null default 100,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint produto_midias_produto_fk
    foreign key (produto_id, organization_id)
    references public.produtos (id, organization_id)
    on delete cascade on update cascade,
  constraint produto_midias_papel_check check (papel in ('principal', 'extra')),
  constraint produto_midias_tipo_check check (tipo in ('imagem', 'video')),
  constraint produto_midias_url_formato check (url ~ '^https://[^[:space:]?#]+$'),
  constraint produto_midias_url_extensao check (
    (tipo = 'imagem' and url ~* '\.(jpe?g|png)$')
    or (tipo = 'video' and url ~* '\.mp4$')
  ),
  constraint produto_midias_principal_e_imagem check (papel <> 'principal' or tipo = 'imagem'),
  constraint produto_midias_legenda_tamanho check (legenda is null or length(legenda) <= 1024),
  constraint produto_midias_produto_url_key unique (produto_id, url)
);

-- No máximo UMA principal ativa por produto.
create unique index if not exists produto_midias_principal_ativa_uidx
  on public.produto_midias (produto_id) where papel = 'principal' and ativo;
create index if not exists produto_midias_org_produto_ativo_ordem_idx
  on public.produto_midias (organization_id, produto_id, ativo, ordem);

drop trigger if exists trg_produto_midias_updated_at on public.produto_midias;
create trigger trg_produto_midias_updated_at
  before update on public.produto_midias
  for each row execute function public.fn_set_updated_at();

-- ---- RLS: leitura para a própria empresa; escrita só pelo servidor ----
alter table public.produto_midias enable row level security;

drop policy if exists "produto_midias_select" on public.produto_midias;
create policy "produto_midias_select" on public.produto_midias
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

revoke all on public.produto_midias from anon;
revoke insert, update, delete, truncate, references, trigger on public.produto_midias from authenticated;
grant select on public.produto_midias to authenticated;
grant all on public.produto_midias to service_role;

-- ---- Apresentação de um produto: a ficha de catalogo_detalhes + as mídias ativas ----
-- Número desconhecido / produto não achado: nulo. Nome ambíguo: {"candidatos": [...]} sem mídias.
-- Senão: a ficha || {"midias": [{papel, tipo, url, legenda, ordem}, ...]}, principal primeiro,
-- depois ordem, created_at, id; [] se não houver. Só mídias ativas da empresa do número.
create or replace function public.catalogo_apresentacao(p_phone_number_id text, p_produto text)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_org      uuid;
  v_detalhes jsonb;
  v_produto  uuid;
begin
  v_detalhes := public.catalogo_detalhes(p_phone_number_id, p_produto);
  if v_detalhes is null or v_detalhes ? 'candidatos' then
    return v_detalhes;
  end if;

  v_org := public.catalogo_org_por_numero(p_phone_number_id);
  v_produto := (v_detalhes ->> 'produto_id')::uuid;

  return v_detalhes || jsonb_build_object('midias', coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'papel', m.papel,
               'tipo', m.tipo,
               'url', m.url,
               'legenda', m.legenda,
               'ordem', m.ordem
             )
             order by (m.papel = 'principal') desc, m.ordem, m.created_at, m.id
           )
      from public.produto_midias m
     where m.produto_id = v_produto
       and m.organization_id = v_org
       and m.ativo
  ), '[]'::jsonb));
end$$;

revoke execute on function public.catalogo_apresentacao(text, text) from public, anon, authenticated;
grant execute on function public.catalogo_apresentacao(text, text) to service_role;
