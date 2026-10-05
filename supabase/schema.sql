-- =========================================================
-- ANGIKE — banco de dados (Supabase)
-- Cole tudo no Supabase → SQL Editor → New query → Run.
-- =========================================================

-- ---------- Produtos ----------
create table if not exists public.products (
  id           text primary key,                 -- usado na URL: produto.html?id=vestido-midi-linho
  name         text not null,
  description  text not null default '',
  category     text not null default 'outros',   -- vestidos | blusas | calcas | saias | conjuntos | alfaiataria
  price_cents  integer not null check (price_cents > 0),  -- em centavos: 18990 = R$ 189,90
  images       text[] not null default '{}',     -- ex.: {img/produto-1.jpg,img/produto-1b.jpg}
  sizes        text[] not null default '{}',     -- ex.: {P,M,G}; vazio = tamanho único
  is_new       boolean not null default false,
  active       boolean not null default true,    -- false esconde o produto e bloqueia a venda
  sort         integer not null default 0,       -- ordem na vitrine
  created_at   timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists "produtos ativos são públicos" on public.products;
create policy "produtos ativos são públicos" on public.products for select using (active);

-- ---------- Perfis (dados do cliente) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  phone       text,
  cep         text,
  street      text,
  number      text,
  complement  text,
  district    text,
  city        text,
  state       text,
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "ver o próprio perfil" on public.profiles;
drop policy if exists "criar o próprio perfil" on public.profiles;
drop policy if exists "editar o próprio perfil" on public.profiles;
create policy "ver o próprio perfil"    on public.profiles for select using (auth.uid() = id);
create policy "criar o próprio perfil"  on public.profiles for insert with check (auth.uid() = id);
create policy "editar o próprio perfil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Pedidos ----------
-- status: created (aguardando pagamento) | pending | in_process | paid | rejected
--         | cancelled | refunded | review | error | shipped | delivered
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete restrict,
  status            text not null default 'created',
  subtotal_cents    integer not null,
  shipping_cents    integer not null,
  total_cents       integer not null,
  shipping_address  jsonb not null,
  customer_email    text not null,
  mp_preference_id  text,
  mp_payment_id     text,
  tracking_code     text,                       -- preencha ao enviar (código dos Correios)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
alter table public.orders enable row level security;
drop policy if exists "ver os próprios pedidos" on public.orders;
create policy "ver os próprios pedidos" on public.orders for select using (auth.uid() = user_id);
-- (pedidos só são criados/alterados pelas funções do servidor, com a chave service_role)

create table if not exists public.order_items (
  id                bigint generated always as identity primary key,
  order_id          uuid not null references public.orders on delete cascade,
  product_id        text not null references public.products,
  name              text not null,
  size              text not null default '',
  unit_price_cents  integer not null,
  quantity          integer not null check (quantity > 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);
alter table public.order_items enable row level security;
drop policy if exists "ver itens dos próprios pedidos" on public.order_items;
create policy "ver itens dos próprios pedidos" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- ---------- Newsletter ----------
create table if not exists public.newsletter (
  email       text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at  timestamptz not null default now()
);
alter table public.newsletter enable row level security;
drop policy if exists "qualquer pessoa pode se inscrever" on public.newsletter;
create policy "qualquer pessoa pode se inscrever" on public.newsletter for insert to anon, authenticated with check (true);

-- ---------- Produtos de exemplo ----------
-- ATENÇÃO: os preços abaixo são R$ 1,00 (100 centavos) só para TESTE.
-- Troque nomes, descrições e PREÇOS pelos reais em Table Editor → products.
insert into public.products (id, name, description, category, price_cents, images, sizes, is_new, sort) values
  ('vestido-midi-linho',          'Vestido Midi Linho',          '[Descrição do produto]', 'vestidos',    100, '{img/produto-1.jpg}', '{P,M,G}',        true,  1),
  ('camisa-oversized-algodao',    'Camisa Oversized Algodão',    '[Descrição do produto]', 'blusas',      100, '{img/produto-2.jpg}', '{P,M,G}',        true,  2),
  ('calca-pantalona-alfaiataria', 'Calça Pantalona Alfaiataria', '[Descrição do produto]', 'calcas',      100, '{img/produto-3.jpg}', '{36,38,40,42}',  false, 3),
  ('conjunto-trico-canelado',     'Conjunto Tricô Canelado',     '[Descrição do produto]', 'conjuntos',   100, '{img/produto-4.jpg}', '{P,M,G}',        true,  4),
  ('saia-longa-fluida',           'Saia Longa Fluida',           '[Descrição do produto]', 'saias',       100, '{img/produto-5.jpg}', '{P,M,G}',        false, 5),
  ('blazer-cropped',              'Blazer Cropped',              '[Descrição do produto]', 'alfaiataria', 100, '{img/produto-6.jpg}', '{P,M,G}',        false, 6)
on conflict (id) do nothing;
