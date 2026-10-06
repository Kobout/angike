-- =========================================================
-- ANGIKE — painel de administração (admin.html)
-- Cole no Supabase → SQL Editor → New query → Run (uma vez só).
-- =========================================================

-- quem é administrador (só dá para mexer aqui pelo painel do Supabase)
create table if not exists public.admins (
  user_id     uuid primary key references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.admins enable row level security;  -- sem políticas: ninguém lê/escreve pelo site

-- o usuário logado é admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- admin vê todos os pedidos e itens, e pode atualizar status / rastreio
drop policy if exists "admin vê todos os pedidos" on public.orders;
create policy "admin vê todos os pedidos" on public.orders for select using (public.is_admin());

drop policy if exists "admin atualiza pedidos" on public.orders;
create policy "admin atualiza pedidos" on public.orders for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin vê todos os itens" on public.order_items;
create policy "admin vê todos os itens" on public.order_items for select using (public.is_admin());

-- ---------------------------------------------------------
-- DEPOIS de criar a conta de admin no site (Minha conta → Criar conta)
-- e confirmar o e-mail, rode SÓ a linha abaixo trocando o e-mail:
-- ---------------------------------------------------------
-- insert into public.admins (user_id) select id from auth.users where email = 'admin@exemplo.com';
