-- =========================================================
-- ANGIKE — admin cadastra/edita produtos direto no site
-- Precisa do supabase/admin.sql já rodado (função is_admin).
-- Cole no Supabase → SQL Editor → New query → Run (uma vez só).
-- =========================================================

-- admin vê todos os produtos (inclusive ocultos), cria e edita
drop policy if exists "admin vê todos os produtos" on public.products;
create policy "admin vê todos os produtos" on public.products for select using (public.is_admin());

drop policy if exists "admin cria produtos" on public.products;
create policy "admin cria produtos" on public.products for insert with check (public.is_admin());

drop policy if exists "admin edita produtos" on public.products;
create policy "admin edita produtos" on public.products for update using (public.is_admin()) with check (public.is_admin());

-- pasta pública de fotos dos produtos
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

drop policy if exists "admin envia fotos" on storage.objects;
create policy "admin envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.is_admin());

drop policy if exists "admin troca fotos" on storage.objects;
create policy "admin troca fotos" on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.is_admin());

drop policy if exists "admin apaga fotos" on storage.objects;
create policy "admin apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.is_admin());

-- deixar só 1 produto na loja (os outros ficam ocultos, não são apagados,
-- porque podem estar em pedidos antigos). Você reativa pelo site, em EDITAR.
update public.products
set active = false
where id <> (select id from public.products where active order by sort, created_at limit 1);
