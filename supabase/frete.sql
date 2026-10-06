-- =========================================================
-- ANGIKE — frete com SuperFrete
-- Cole no Supabase → SQL Editor → New query → Run (uma vez só).
-- =========================================================

-- medidas de cada produto (para a SuperFrete calcular o frete)
alter table public.products add column if not exists weight_kg numeric not null default 0.3;  -- peso em kg
alter table public.products add column if not exists height_cm numeric not null default 4;    -- altura (peça dobrada)
alter table public.products add column if not exists width_cm  numeric not null default 25;   -- largura
alter table public.products add column if not exists length_cm numeric not null default 30;   -- comprimento

-- forma de entrega escolhida no pedido (ex.: "PAC (Correios)")
alter table public.orders add column if not exists shipping_method text;
