-- O catálogo de produtos que o bot de vendas (CADU, no n8n) consulta no lugar da planilha do Google.
--
-- Três tabelas, cada uma com um dono só:
--   produtos              o que vem da LOJA (leitor do site hoje, API da Nuvemshop depois, ou
--                         cadastro manual). O leitor do site grava por catalogo_gravar_do_site.
--   produto_conhecimento  o que NÓS sabemos do produto (para que serve, dose, o que o dono falou).
--                         O leitor do site NUNCA escreve aqui.
--   produto_termos        o jeito do cliente falar ("rabo de burro", "cigarrinha") apontando para
--                         o produto. Guardado já normalizado (minúsculo, sem acento).
--
-- Por que não catalog_products (0204) nem nuvemshop_products (0006): o pedido é um catálogo com
-- os nomes acima, separado entre o que a loja diz e o que nós sabemos, e lido pelo bot por
-- funções que resolvem a empresa pelo número da Meta. As duas antigas ficam como estão; a
-- limpeza do banco é outra etapa.
--
-- Empresa: o n8n só conhece o phone_number_id da Meta. Ele mora em
-- channel_sessions.meta_phone_number_id (coluna, não metadata), único entre canais ativos
-- (índice channel_sessions_meta_phone_number_id_ativo_unique, 0165). Número desconhecido não
-- devolve nada, nunca o produto de outra empresa.
--
-- Escrita só pelo servidor (n8n como postgres, ou service role): nenhuma policy de escrita.
-- Leitura para membros da própria empresa, para a futura tela "Produtos".
-- As funções são SECURITY INVOKER: quem as chama é o postgres/service role, que já passa por
-- cima da RLS; se um dia alguém logado as chamar, a RLS continua valendo.

-- ---- Normalizar texto (minúsculo, sem acento, só letras/números, espaço simples) ----
-- translate() e não unaccent: a extensão unaccent não é garantida pelo baseline.
create or replace function public.catalogo_normalizar(p_texto text)
  returns text
  language sql
  immutable
  parallel safe
  set search_path to 'public', 'pg_temp'
as $$
  select btrim(regexp_replace(
           lower(translate(coalesce(p_texto, ''),
             'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
             'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucny')),
           '[^a-z0-9]+', ' ', 'g'));
$$;

-- ---- produtos: o que vem da loja ----
create table if not exists public.produtos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  origem           text not null default 'site',
  external_id      text,
  sku              text,
  nome             text not null,
  categoria        text,
  preco            numeric(12,2),
  preco_de         numeric(12,2),
  preco_pix        numeric(12,2),
  estoque          integer,
  disponivel       boolean not null default true,
  peso_kg          numeric(10,3),
  largura_cm       numeric(8,1),
  altura_cm        numeric(8,1),
  profundidade_cm  numeric(8,1),
  link             text,
  imagem_url       text,
  descricao_site   text,
  ativo            boolean not null default true,
  lido_do_site_em  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Alvo das FKs compostas das tabelas filhas: garante que o conhecimento e os termos ficam
  -- na MESMA empresa do produto.
  constraint produtos_id_org_key unique (id, organization_id),
  constraint produtos_origem_check check (origem in ('site', 'nuvemshop', 'manual')),
  constraint produtos_nome_nao_vazio check (btrim(nome) <> ''),
  constraint produtos_precos_nao_negativos check (
    coalesce(preco, 0) >= 0 and coalesce(preco_de, 0) >= 0 and coalesce(preco_pix, 0) >= 0
  ),
  constraint produtos_medidas_nao_negativas check (
    coalesce(peso_kg, 0) >= 0 and coalesce(largura_cm, 0) >= 0
    and coalesce(altura_cm, 0) >= 0 and coalesce(profundidade_cm, 0) >= 0
  )
);

create unique index if not exists produtos_org_sku_uidx
  on public.produtos (organization_id, sku) where sku is not null;
create unique index if not exists produtos_org_external_id_uidx
  on public.produtos (organization_id, external_id) where external_id is not null;
create index if not exists produtos_org_ativo_nome_idx
  on public.produtos (organization_id, ativo, nome);

drop trigger if exists trg_produtos_updated_at on public.produtos;
create trigger trg_produtos_updated_at
  before update on public.produtos
  for each row execute function public.fn_set_updated_at();

-- ---- produto_conhecimento: o que nós sabemos (1 linha por produto) ----
create table if not exists public.produto_conhecimento (
  produto_id               uuid primary key,
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  para_que_serve           text,
  indicacoes               text[] not null default '{}'::text[],
  beneficios               text[] not null default '{}'::text[],
  diferenciais             text[] not null default '{}'::text[],
  composicao               text,
  modo_de_aplicacao        text,
  dose_recomendada         text,
  observacoes_do_vendedor  text,
  fonte                    text,
  confirmado_em            timestamptz,
  updated_at               timestamptz not null default now(),
  constraint produto_conhecimento_produto_fk
    foreign key (produto_id, organization_id)
    references public.produtos (id, organization_id)
    on delete cascade on update cascade
);

drop trigger if exists trg_produto_conhecimento_updated_at on public.produto_conhecimento;
create trigger trg_produto_conhecimento_updated_at
  before update on public.produto_conhecimento
  for each row execute function public.fn_set_updated_at();

-- ---- produto_termos: vocabulário do cliente -> produto ----
create table if not exists public.produto_termos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  produto_id       uuid not null,
  termo            text not null,
  tipo             text not null default 'sinonimo',
  created_at       timestamptz not null default now(),
  constraint produto_termos_produto_fk
    foreign key (produto_id, organization_id)
    references public.produtos (id, organization_id)
    on delete cascade on update cascade,
  constraint produto_termos_tipo_check
    check (tipo in ('sinonimo', 'praga', 'problema', 'objetivo', 'nome_regional')),
  constraint produto_termos_termo_nao_vazio check (termo <> ''),
  constraint produto_termos_produto_termo_key unique (produto_id, termo)
);

create index if not exists produto_termos_org_termo_idx
  on public.produto_termos (organization_id, termo);

-- O termo é gravado sempre normalizado, venha de onde vier ("Rabo-de-Burro" vira "rabo de burro").
create or replace function public.fn_produto_termos_normaliza()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
begin
  new.termo := public.catalogo_normalizar(new.termo);
  return new;
end$$;

drop trigger if exists trg_produto_termos_normaliza on public.produto_termos;
create trigger trg_produto_termos_normaliza
  before insert or update of termo on public.produto_termos
  for each row execute function public.fn_produto_termos_normaliza();

-- ---- RLS: leitura para a própria empresa; escrita só pelo servidor ----
alter table public.produtos enable row level security;
alter table public.produto_conhecimento enable row level security;
alter table public.produto_termos enable row level security;

drop policy if exists "produtos_select" on public.produtos;
create policy "produtos_select" on public.produtos
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "produto_conhecimento_select" on public.produto_conhecimento;
create policy "produto_conhecimento_select" on public.produto_conhecimento
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "produto_termos_select" on public.produto_termos;
create policy "produto_termos_select" on public.produto_termos
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

revoke all on public.produtos from anon;
revoke all on public.produto_conhecimento from anon;
revoke all on public.produto_termos from anon;
revoke insert, update, delete, truncate, references, trigger on public.produtos from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.produto_conhecimento from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.produto_termos from authenticated;
grant select on public.produtos to authenticated;
grant select on public.produto_conhecimento to authenticated;
grant select on public.produto_termos to authenticated;
grant all on public.produtos to service_role;
grant all on public.produto_conhecimento to service_role;
grant all on public.produto_termos to service_role;

-- ---- Empresa pelo número da Meta ----
create or replace function public.catalogo_org_por_numero(p_phone_number_id text)
  returns uuid
  language sql
  stable
  set search_path to 'public', 'pg_temp'
as $$
  select s.organization_id
    from public.channel_sessions s
   where s.meta_phone_number_id = nullif(btrim(p_phone_number_id), '')
     and s.archived_at is null
   limit 1;
$$;

-- ---- Busca do bot ----
-- casou_por diz por onde o produto entrou: 'lista' (busca vazia), 'nome_exato', 'sku',
-- 'termo:<termo>', 'nome', 'indicacao:<indicação>', 'categoria', 'palavra:<palavras que casaram>'.
-- Casamento sempre por palavra inteira: 'oi' não casa dentro de 'coisa'.
create or replace function public.catalogo_buscar(
  p_phone_number_id text,
  p_busca text,
  p_limite int default 5
)
  returns table (
    produto_id      uuid,
    nome            text,
    categoria       text,
    para_que_serve  text,
    preco           numeric,
    preco_de        numeric,
    preco_pix       numeric,
    estoque         int,
    disponivel      boolean,
    link            text,
    casou_por       text,
    relevancia      numeric
  )
  language plpgsql
  stable
  set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_org     uuid;
  v_q       text;
  v_limite  int;
  v_palavras text[];
begin
  v_org := public.catalogo_org_por_numero(p_phone_number_id);
  if v_org is null then
    return;
  end if;

  v_q := public.catalogo_normalizar(p_busca);
  v_limite := greatest(1, least(coalesce(p_limite, 5), 50));

  if v_q = '' then
    return query
      select p.id, p.nome, p.categoria, k.para_que_serve, p.preco, p.preco_de, p.preco_pix,
             p.estoque, p.disponivel, p.link, 'lista'::text, 0::numeric
        from public.produtos p
        left join public.produto_conhecimento k on k.produto_id = p.id
       where p.organization_id = v_org and p.ativo
       order by p.nome
       limit v_limite;
    return;
  end if;

  -- Palavras soltas da frase que valem para o casamento palavra a palavra (o resto é ruído).
  select coalesce(array_agg(distinct w), '{}'::text[]) into v_palavras
    from unnest(string_to_array(v_q, ' ')) as w
   where length(w) >= 3
     and w <> all (array[
       'que','para','pra','pro','com','sem','por','uma','uns','umas','dos','das','nos','nas',
       'pelo','pela','mais','muito','muita','tem','ter','tenho','temos','quero','queria',
       'preciso','gostaria','voce','voces','qual','quais','como','onde','quando','esse','essa',
       'isso','este','esta','isto','meu','minha','seu','sua','bom','boa','dia','tarde','noite',
       'ola','obrigado','obrigada','sim','nao','ainda','tambem','preco','valor','quanto','custa',
       'produto','produtos','serve','vende','vendem','tudo','aqui','ali','dele','dela','ele','ela'
     ]);

  return query
  with base as (
    select p.*,
           public.catalogo_normalizar(p.nome)      as nome_n,
           public.catalogo_normalizar(p.sku)       as sku_n,
           public.catalogo_normalizar(p.categoria) as cat_n
      from public.produtos p
     where p.organization_id = v_org and p.ativo
  ),
  candidatos as (
    -- nome exato / sku exato
    select b.id, 'nome_exato'::text as por, 100::numeric as rel from base b where b.nome_n = v_q
    union all
    select b.id, 'sku', 100 from base b where b.sku_n <> '' and b.sku_n = v_q
    -- nome inteiro do produto citado na frase: vale mais que um termo genérico
    -- ("quero o fertilizante x" acha "Fertilizante X" antes do produto do termo "fertilizante")
    union all
    select b.id, 'nome', 95 from base b
     where b.nome_n <> '' and position(' ' || b.nome_n || ' ' in ' ' || v_q || ' ') > 0
    -- termo cadastrado contido na frase do cliente; termo de mais palavras pesa mais
    union all
    select b.id, 'termo:' || t.termo,
           90 + least(array_length(string_to_array(t.termo, ' '), 1), 4)::numeric
      from base b
      join public.produto_termos t on t.produto_id = b.id and t.organization_id = v_org
     where position(' ' || t.termo || ' ' in ' ' || v_q || ' ') > 0
    -- frase contida no nome
    union all
    select b.id, 'nome', 80 from base b
     where position(' ' || v_q || ' ' in ' ' || b.nome_n || ' ') > 0
    -- indicações (pragas/problemas/objetivos), nos dois sentidos
    union all
    select b.id, 'indicacao:' || i.ind, 70
      from base b
      join public.produto_conhecimento k on k.produto_id = b.id
      cross join lateral (
        select public.catalogo_normalizar(x) as ind from unnest(k.indicacoes) as x
      ) i
     where i.ind <> ''
       and (position(' ' || i.ind || ' ' in ' ' || v_q || ' ') > 0
            or position(' ' || v_q || ' ' in ' ' || i.ind || ' ') > 0)
    -- frase contida num termo (cliente digitou só um pedaço do termo)
    union all
    select b.id, 'termo:' || t.termo, 65
      from base b
      join public.produto_termos t on t.produto_id = b.id and t.organization_id = v_org
     where position(' ' || v_q || ' ' in ' ' || t.termo || ' ') > 0
    -- categoria, nos dois sentidos
    union all
    select b.id, 'categoria', 50 from base b
     where b.cat_n <> ''
       and (position(' ' || b.cat_n || ' ' in ' ' || v_q || ' ') > 0
            or position(' ' || v_q || ' ' in ' ' || b.cat_n || ' ') > 0)
    -- palavra a palavra: quanto MAIS palavras da frase casam, maior a relevância (teto 45)
    union all
    select pa.id,
           'palavra:' || string_agg(distinct pa.w, ' '),
           least(max(pa.peso) + 3 * (count(distinct pa.w) - 1), 45)::numeric
      from (
        select b.id, w, 30 as peso from base b, unnest(v_palavras) w
         where position(' ' || w || ' ' in ' ' || b.nome_n || ' ' || b.sku_n || ' ') > 0
        union all
        select b.id, w, 25
          from base b
          join public.produto_termos t on t.produto_id = b.id and t.organization_id = v_org
          cross join unnest(v_palavras) w
         where position(' ' || w || ' ' in ' ' || t.termo || ' ') > 0
        union all
        select b.id, w, 25
          from base b
          join public.produto_conhecimento k on k.produto_id = b.id
          cross join unnest(k.indicacoes) x
          cross join unnest(v_palavras) w
         where position(' ' || w || ' ' in ' ' || public.catalogo_normalizar(x) || ' ') > 0
        union all
        select b.id, w, 15 from base b, unnest(v_palavras) w
         where position(' ' || w || ' ' in ' ' || b.cat_n || ' ') > 0
      ) pa
     group by pa.id
  ),
  melhor as (
    select distinct on (c.id) c.id, c.por, c.rel
      from candidatos c
     order by c.id, c.rel desc, c.por
  )
  select b.id, b.nome, b.categoria, k.para_que_serve, b.preco, b.preco_de, b.preco_pix,
         b.estoque, b.disponivel, b.link, m.por, m.rel
    from melhor m
    join base b on b.id = m.id
    left join public.produto_conhecimento k on k.produto_id = b.id
   order by m.rel desc, b.nome
   limit v_limite;
end$$;

-- ---- Ficha completa de um produto ----
-- p_produto pode ser o id (uuid), o sku ou o nome (sem acento/maiúscula). Só produtos ativos.
-- Ordem: id, sku, nome exato, e por último "nome que contém a frase".
-- Se "nome que contém a frase" casa MAIS DE UM produto ativo da empresa ("Topfix" casa TF01,
-- TF02 e TF03), devolve {"candidatos": [até 5 nomes distintos, do mais curto ao mais longo]} para o bot
-- perguntar qual; nunca nome de produto de outra empresa. Nada encontrado: nulo.
create or replace function public.catalogo_detalhes(p_phone_number_id text, p_produto text)
  returns jsonb
  language plpgsql
  stable
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_org  uuid;
  v_q    text;
  v_cru  text;
  v_id   uuid;
  v_n    int;
begin
  v_org := public.catalogo_org_por_numero(p_phone_number_id);
  if v_org is null then
    return null;
  end if;

  v_cru := lower(btrim(coalesce(p_produto, '')));
  v_q := public.catalogo_normalizar(p_produto);
  if v_cru = '' then
    return null;
  end if;

  if v_cru ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into v_id from public.produtos p
     where p.id = v_cru::uuid and p.organization_id = v_org and p.ativo;
  end if;

  if v_id is null and v_q <> '' then
    select p.id into v_id from public.produtos p
     where p.organization_id = v_org and p.ativo
       and public.catalogo_normalizar(p.sku) = v_q
     order by p.created_at, p.id
     limit 1;
  end if;

  if v_id is null and v_q <> '' then
    select p.id into v_id from public.produtos p
     where p.organization_id = v_org and p.ativo
       and public.catalogo_normalizar(p.nome) = v_q
     order by p.created_at, p.id
     limit 1;
  end if;

  if v_id is null and v_q <> '' then
    select count(*), min(p.id::text)::uuid into v_n, v_id from public.produtos p
     where p.organization_id = v_org and p.ativo
       and position(' ' || v_q || ' ' in ' ' || public.catalogo_normalizar(p.nome) || ' ') > 0;
    if v_n > 1 then
      return jsonb_build_object('candidatos', (
        select jsonb_agg(c.nome order by length(c.nome), c.nome)
          from (
            select p.nome from public.produtos p
             where p.organization_id = v_org and p.ativo
               and position(' ' || v_q || ' ' in ' ' || public.catalogo_normalizar(p.nome) || ' ') > 0
             group by p.nome
             order by length(p.nome), p.nome
             limit 5
          ) c
      ));
    end if;
    if v_n <> 1 then
      v_id := null;
    end if;
  end if;

  if v_id is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
             'produto_id', p.id,
             'origem', p.origem,
             'external_id', p.external_id,
             'sku', p.sku,
             'nome', p.nome,
             'categoria', p.categoria,
             'preco', p.preco,
             'preco_de', p.preco_de,
             'preco_pix', p.preco_pix,
             'estoque', p.estoque,
             'disponivel', p.disponivel,
             'peso_kg', p.peso_kg,
             'largura_cm', p.largura_cm,
             'altura_cm', p.altura_cm,
             'profundidade_cm', p.profundidade_cm,
             'link', p.link,
             'imagem_url', p.imagem_url,
             'descricao_site', p.descricao_site,
             'lido_do_site_em', p.lido_do_site_em,
             'para_que_serve', k.para_que_serve,
             'indicacoes', coalesce(to_jsonb(k.indicacoes), '[]'::jsonb),
             'beneficios', coalesce(to_jsonb(k.beneficios), '[]'::jsonb),
             'diferenciais', coalesce(to_jsonb(k.diferenciais), '[]'::jsonb),
             'composicao', k.composicao,
             'modo_de_aplicacao', k.modo_de_aplicacao,
             'dose_recomendada', k.dose_recomendada,
             'observacoes_do_vendedor', k.observacoes_do_vendedor,
             'fonte', k.fonte,
             'confirmado_em', k.confirmado_em,
             'termos', coalesce((
               select jsonb_agg(jsonb_build_object('termo', t.termo, 'tipo', t.tipo) order by t.termo)
                 from public.produto_termos t
                where t.produto_id = p.id and t.organization_id = v_org
             ), '[]'::jsonb)
           )
      from public.produtos p
      left join public.produto_conhecimento k on k.produto_id = p.id
     where p.id = v_id and p.organization_id = v_org
  );
end$$;

-- ---- Número vindo do leitor do site (aceita 12.5, "12,50", "R$ 1.234,56", "R$ 1.234") ----
-- Vazio vira null; texto que não é número levanta erro (melhor parar do que gravar lixo).
-- "1.234" sem vírgula: em PREÇO o ponto é separador de milhar (1234); em medida/peso é decimal.
create or replace function public.catalogo_ler_numero(p_valor jsonb, p_campo text)
  returns numeric
  language plpgsql
  immutable
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_txt text;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_valor) = 'number' then
    return (p_valor #>> '{}')::numeric;
  end if;
  v_txt := regexp_replace(coalesce(p_valor #>> '{}', ''), '(r\$|[[:space:]]|' || chr(160) || ')', '', 'gi');
  if v_txt = '' then
    return null;
  end if;
  if position(',' in v_txt) > 0 then
    v_txt := replace(replace(v_txt, '.', ''), ',', '.');
  elsif p_campo like 'preco%' and v_txt ~ '^-?[0-9]{1,3}([.][0-9]{3})+$' then
    v_txt := replace(v_txt, '.', '');
  end if;
  begin
    return v_txt::numeric;
  exception when others then
    raise exception 'catalogo: o campo % não é um número: %', p_campo, p_valor #>> '{}'
      using errcode = '22023';
  end;
end$$;

-- ---- Gravar o que o leitor do site leu ----
-- Acha o produto por external_id, depois por sku, e por último pelo nome: nome vale contra
-- qualquer produto quando o leitor não mandou sku nem external_id, e só contra produtos SEM
-- sku e SEM external_id quando mandou (assim o produto gravado antes sem sku ganha o sku em vez
-- de duplicar). Nome que casa com mais de um produto recusa ("nome ambíguo"), nunca duplica.
-- Atualiza SÓ colunas da loja; nunca toca conhecimento/termos.
-- Campo que vier nulo ou ausente mantém o valor anterior (uma leitura falha não zera preço/estoque).
-- Para LIMPAR de propósito há dois sinais opcionais (ausentes = regra acima):
--   "estoque_controlado": false  grava estoque = NULL (a loja não controla estoque); vale mais que
--                                 um "estoque" mandado junto.
--   "sem_preco_de": true          grava preco_de = NULL (a promoção acabou); vale mais que um
--                                 "preco_de" mandado junto.
-- Aceitam booleano json ou o texto "true"/"false"; outra coisa é recusada.
-- ativo=true em toda gravação: "ativo" aqui quer dizer "está no site". Esconder um produto do bot
-- por decisão do dono, quando existir a tela, pede uma coluna própria.
create or replace function public.catalogo_gravar_do_site(p_organization_id uuid, p_dados jsonb)
  returns uuid
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_id         uuid;
  v_n          int;
  v_nome       text := nullif(btrim(p_dados ->> 'nome'), '');
  v_sku        text := nullif(btrim(p_dados ->> 'sku'), '');
  v_ext        text := nullif(btrim(p_dados ->> 'external_id'), '');
  v_categoria  text := nullif(btrim(p_dados ->> 'categoria'), '');
  v_link       text := nullif(btrim(p_dados ->> 'link'), '');
  v_imagem     text := nullif(btrim(p_dados ->> 'imagem_url'), '');
  v_descricao  text := nullif(btrim(p_dados ->> 'descricao_site'), '');
  v_origem     text := coalesce(nullif(btrim(p_dados ->> 'origem'), ''), 'site');
  v_disp_txt   text;
  v_disponivel boolean;
  v_preco      numeric;
  v_preco_de   numeric;
  v_preco_pix  numeric;
  v_estoque    numeric;
  v_peso       numeric;
  v_largura    numeric;
  v_altura     numeric;
  v_profund    numeric;
  v_tentativa  int := 0;
  v_limpa_estoque  boolean := false;
  v_limpa_preco_de boolean := false;
  v_sinal      text;
begin
  if p_organization_id is null
     or not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'catalogo: empresa não encontrada' using errcode = '22023';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'catalogo: dados do produto precisam ser um objeto json' using errcode = '22023';
  end if;
  if v_nome is null then
    raise exception 'catalogo: nome do produto é obrigatório' using errcode = '22023';
  end if;
  if v_origem not in ('site', 'nuvemshop', 'manual') then
    raise exception 'catalogo: origem inválida: %', v_origem using errcode = '22023';
  end if;

  v_preco     := public.catalogo_ler_numero(p_dados -> 'preco', 'preco');
  v_preco_de  := public.catalogo_ler_numero(p_dados -> 'preco_de', 'preco_de');
  v_preco_pix := public.catalogo_ler_numero(p_dados -> 'preco_pix', 'preco_pix');
  v_estoque   := public.catalogo_ler_numero(p_dados -> 'estoque', 'estoque');
  v_peso      := public.catalogo_ler_numero(p_dados -> 'peso_kg', 'peso_kg');
  v_largura   := public.catalogo_ler_numero(p_dados -> 'largura_cm', 'largura_cm');
  v_altura    := public.catalogo_ler_numero(p_dados -> 'altura_cm', 'altura_cm');
  v_profund   := public.catalogo_ler_numero(p_dados -> 'profundidade_cm', 'profundidade_cm');

  if coalesce(v_preco, 0) < 0 or coalesce(v_preco_de, 0) < 0 or coalesce(v_preco_pix, 0) < 0 then
    raise exception 'catalogo: preço negativo rejeitado (%)', v_nome using errcode = '22023';
  end if;
  if coalesce(v_estoque, 0) < 0 then
    raise exception 'catalogo: estoque negativo rejeitado (%)', v_nome using errcode = '22023';
  end if;
  if coalesce(v_peso, 0) < 0 or coalesce(v_largura, 0) < 0
     or coalesce(v_altura, 0) < 0 or coalesce(v_profund, 0) < 0 then
    raise exception 'catalogo: peso ou medida negativa rejeitada (%)', v_nome using errcode = '22023';
  end if;

  if p_dados ? 'estoque_controlado' and jsonb_typeof(p_dados -> 'estoque_controlado') <> 'null' then
    v_sinal := lower(btrim(p_dados ->> 'estoque_controlado'));
    if v_sinal not in ('true', 'false') then
      raise exception 'catalogo: o campo estoque_controlado não é true/false: %', p_dados ->> 'estoque_controlado'
        using errcode = '22023';
    end if;
    v_limpa_estoque := (v_sinal = 'false');
  end if;
  if p_dados ? 'sem_preco_de' and jsonb_typeof(p_dados -> 'sem_preco_de') <> 'null' then
    v_sinal := lower(btrim(p_dados ->> 'sem_preco_de'));
    if v_sinal not in ('true', 'false') then
      raise exception 'catalogo: o campo sem_preco_de não é true/false: %', p_dados ->> 'sem_preco_de'
        using errcode = '22023';
    end if;
    v_limpa_preco_de := (v_sinal = 'true');
  end if;
  if v_limpa_estoque then
    v_estoque := null;
  end if;
  if v_limpa_preco_de then
    v_preco_de := null;
  end if;

  if p_dados ? 'disponivel' and jsonb_typeof(p_dados -> 'disponivel') <> 'null' then
    v_disp_txt := public.catalogo_normalizar(p_dados ->> 'disponivel');
    if v_disp_txt in ('true', 't', '1', 'sim', 's', 'disponivel', 'em estoque') then
      v_disponivel := true;
    elsif v_disp_txt in ('false', 'f', '0', 'nao', 'n', 'indisponivel', 'esgotado', 'sem estoque') then
      v_disponivel := false;
    elsif v_disp_txt <> '' then
      raise exception 'catalogo: o campo disponivel não é sim/não: %', p_dados ->> 'disponivel'
        using errcode = '22023';
    end if;
  end if;

  -- Uma gravação por vez para o mesmo nome na mesma empresa: duas leituras simultâneas do
  -- mesmo produto não inserem duas linhas.
  perform pg_advisory_xact_lock(
    hashtextextended('catalogo:' || p_organization_id::text || ':' || public.catalogo_normalizar(v_nome), 0)
  );

  loop
    v_tentativa := v_tentativa + 1;
    v_id := null;

    if v_ext is not null then
      select p.id into v_id from public.produtos p
       where p.organization_id = p_organization_id and p.external_id = v_ext;
    end if;
    if v_id is null and v_sku is not null then
      select p.id into v_id from public.produtos p
       where p.organization_id = p_organization_id and p.sku = v_sku;
    end if;
    if v_id is null then
      select count(*), min(p.id::text)::uuid into v_n, v_id from public.produtos p
       where p.organization_id = p_organization_id
         and public.catalogo_normalizar(p.nome) = public.catalogo_normalizar(v_nome)
         and ((v_ext is null and v_sku is null) or (p.sku is null and p.external_id is null));
      if v_n > 1 then
        raise exception 'catalogo: nome ambíguo, % produtos se chamam "%"; mande sku ou external_id',
          v_n, v_nome using errcode = '22023';
      end if;
    end if;

    begin
      if v_id is not null then
        update public.produtos p set
          nome            = v_nome,
          sku             = coalesce(v_sku, p.sku),
          external_id     = coalesce(v_ext, p.external_id),
          categoria       = coalesce(v_categoria, p.categoria),
          preco           = coalesce(v_preco, p.preco),
          preco_de        = case when v_limpa_preco_de then null else coalesce(v_preco_de, p.preco_de) end,
          preco_pix       = coalesce(v_preco_pix, p.preco_pix),
          estoque         = case when v_limpa_estoque then null
                                 else coalesce(round(v_estoque)::integer, p.estoque) end,
          disponivel      = coalesce(v_disponivel, p.disponivel),
          peso_kg         = coalesce(v_peso, p.peso_kg),
          largura_cm      = coalesce(v_largura, p.largura_cm),
          altura_cm       = coalesce(v_altura, p.altura_cm),
          profundidade_cm = coalesce(v_profund, p.profundidade_cm),
          link            = coalesce(v_link, p.link),
          imagem_url      = coalesce(v_imagem, p.imagem_url),
          descricao_site  = coalesce(v_descricao, p.descricao_site),
          lido_do_site_em = now(),
          ativo           = true
         where p.id = v_id;
      else
        insert into public.produtos (
          organization_id, origem, external_id, sku, nome, categoria, preco, preco_de, preco_pix,
          estoque, disponivel, peso_kg, largura_cm, altura_cm, profundidade_cm, link, imagem_url,
          descricao_site, lido_do_site_em, ativo
        ) values (
          p_organization_id, v_origem, v_ext, v_sku, v_nome, v_categoria, v_preco, v_preco_de,
          v_preco_pix, round(v_estoque)::integer, coalesce(v_disponivel, true), v_peso, v_largura,
          v_altura, v_profund, v_link, v_imagem, v_descricao, now(), true
        )
        returning id into v_id;
      end if;
      return v_id;
    exception when unique_violation then
      -- Primeira vez: outra leitura gravou o mesmo sku/external_id ao mesmo tempo; procura de
      -- novo e atualiza. Segunda vez: o sku e o external_id apontam para produtos diferentes.
      if v_tentativa >= 2 then
        raise exception 'catalogo: sku % ou external_id % já pertence a outro produto da empresa (%)',
          coalesce(v_sku, '-'), coalesce(v_ext, '-'), v_nome using errcode = '23505';
      end if;
    end;
  end loop;
end$$;

-- ---- Desligar o que sumiu do site ----
-- Depois de uma leitura completa, o n8n chama com a hora em que a leitura COMEÇOU: produtos de
-- origem 'site' que não foram lidos desde então saem do bot (ativo=false). Conhecimento e termos
-- ficam guardados. Se nenhum produto foi lido desde p_desde (leitura que falhou inteira), não
-- desliga nada: devolve 0. Devolve quantos foram desligados.
-- Trava contra desligar em massa: se os produtos de origem 'site' lidos desde p_desde forem
-- MENOS de 70% dos produtos de origem 'site' ativos da empresa (contados antes de desligar), a
-- leitura é tratada como parcial (site fora do ar, página que mudou): não desliga nada, devolve 0
-- e avisa por RAISE NOTICE.
create or replace function public.catalogo_desativar_nao_lidos(p_organization_id uuid, p_desde timestamptz)
  returns integer
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_n      int;
  v_lidos  int;
  v_ativos int;
begin
  if p_organization_id is null or p_desde is null then
    raise exception 'catalogo: empresa e hora de início da leitura são obrigatórias' using errcode = '22023';
  end if;
  select count(*) filter (where p.lido_do_site_em >= p_desde),
         count(*) filter (where p.ativo)
    into v_lidos, v_ativos
    from public.produtos p
   where p.organization_id = p_organization_id and p.origem = 'site';
  if v_lidos = 0 then
    return 0;
  end if;
  if v_lidos * 10 < v_ativos * 7 then
    raise notice 'catalogo: leitura parcial na empresa %: % produtos do site lidos de % ativos (menos de 70%%); nada foi desligado',
      p_organization_id, v_lidos, v_ativos;
    return 0;
  end if;
  update public.produtos p set ativo = false
   where p.organization_id = p_organization_id
     and p.origem = 'site'
     and p.ativo
     and (p.lido_do_site_em is null or p.lido_do_site_em < p_desde);
  get diagnostics v_n = row_count;
  return v_n;
end$$;

-- ---- Execução: só o servidor (postgres / service role) ----
revoke execute on function public.catalogo_normalizar(text) from public, anon, authenticated;
revoke execute on function public.fn_produto_termos_normaliza() from public, anon, authenticated;
revoke execute on function public.catalogo_org_por_numero(text) from public, anon, authenticated;
revoke execute on function public.catalogo_buscar(text, text, int) from public, anon, authenticated;
revoke execute on function public.catalogo_detalhes(text, text) from public, anon, authenticated;
revoke execute on function public.catalogo_ler_numero(jsonb, text) from public, anon, authenticated;
revoke execute on function public.catalogo_gravar_do_site(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.catalogo_desativar_nao_lidos(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.catalogo_normalizar(text) to service_role;
grant execute on function public.fn_produto_termos_normaliza() to service_role;
grant execute on function public.catalogo_org_por_numero(text) to service_role;
grant execute on function public.catalogo_buscar(text, text, int) to service_role;
grant execute on function public.catalogo_detalhes(text, text) to service_role;
grant execute on function public.catalogo_ler_numero(jsonb, text) to service_role;
grant execute on function public.catalogo_gravar_do_site(uuid, jsonb) to service_role;
grant execute on function public.catalogo_desativar_nao_lidos(uuid, timestamptz) to service_role;
