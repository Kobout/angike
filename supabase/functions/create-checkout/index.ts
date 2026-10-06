// =========================================================
// ANGIKE — create-checkout
// Recebe a sacola + endereço, recalcula preços e frete pelo banco,
// grava o pedido e cria o pagamento (preferência) no Mercado Pago.
//
// Secrets necessários (Supabase → Edge Functions → Secrets):
//   MP_ACCESS_TOKEN          token do Mercado Pago (TEST-... para testes, APP_USR-... para produção)
//   SITE_URL                 https://angike.com.br
//   + os secrets de frete da SuperFrete (veja _shared/frete.ts)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.
// Publique com "Verify JWT" DESLIGADO — o login é conferido aqui dentro.
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadLines, quote, UserError, validateItems } from '../_shared/frete.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://angike.com.br').replace(/\/+$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ADDRESS_FIELDS = ['full_name', 'phone', 'cep', 'street', 'number', 'complement', 'district', 'city', 'state'] as const;
const REQUIRED = ['full_name', 'phone', 'cep', 'street', 'number', 'district', 'city', 'state'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!MP_TOKEN) return json({ error: 'Pagamento não configurado (MP_ACCESS_TOKEN).' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    // 1) quem está comprando
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Faça login para continuar.' }, 401);

    // 2) valida o que veio do navegador
    const body = await req.json().catch(() => ({}));
    const items = validateItems(body.items);
    if (!items) return json({ error: 'Sacola inválida. Atualize a página e tente de novo.' }, 400);

    const raw = body.address ?? {};
    const address: Record<string, string> = {};
    for (const f of ADDRESS_FIELDS) address[f] = String(raw[f] ?? '').trim().slice(0, 160);
    address.cep = address.cep.replace(/\D/g, '');
    address.state = address.state.toUpperCase();
    if (REQUIRED.some((f) => !address[f]) || address.cep.length !== 8 || !/^[A-Z]{2}$/.test(address.state)) {
      return json({ error: 'Confira o endereço de entrega.' }, 400);
    }

    // 3) preços e frete SEMPRE recalculados aqui (banco + SuperFrete)
    const { lines: rawLines, subtotal } = await loadLines(admin, items);
    const options = await quote(address.cep, rawLines, subtotal);
    const chosen = options.find((o) => o.id === String(body.shipping_service ?? ''));
    if (!chosen) return json({ error: 'Escolha a forma de entrega de novo (o frete foi recalculado).' }, 409);
    const shipping = chosen.price_cents;
    const total = subtotal + shipping;
    const lines = rawLines.map(({ dims: _dims, ...l }) => l);

    // 4) grava o pedido
    const { data: order, error: orderErr } = await admin.from('orders').insert({
      user_id: user.id,
      status: 'created',
      subtotal_cents: subtotal,
      shipping_cents: shipping,
      total_cents: total,
      shipping_address: address,
      shipping_method: chosen.company ? `${chosen.name} (${chosen.company})` : chosen.name,
      customer_email: user.email,
    }).select('id').single();
    if (orderErr) throw orderErr;

    const { error: itemsErr } = await admin.from('order_items').insert(lines.map((l) => ({ ...l, order_id: order.id })));
    if (itemsErr) throw itemsErr;

    // 5) cria o pagamento no Mercado Pago (Checkout Pro)
    const back = `${SITE_URL}/pedido.html?id=${order.id}`;
    const [firstName, ...rest] = address.full_name.split(' ');
    const preference = {
      items: [
        ...lines.map((l) => ({
          id: l.product_id,
          title: l.size ? `${l.name} (${l.size})` : l.name,
          quantity: l.quantity,
          unit_price: l.unit_price_cents / 100,
          currency_id: 'BRL',
        })),
        ...(shipping > 0 ? [{ id: 'frete', title: `Frete — ${chosen.name}`, quantity: 1, unit_price: shipping / 100, currency_id: 'BRL' }] : []),
      ],
      // e-mail do comprador NÃO é enviado: em modo de teste, um e-mail real aqui causa
      // o erro "uma das partes é de teste". O Mercado Pago pede o e-mail na própria tela.
      payer: { name: firstName, surname: rest.join(' ') },
      external_reference: order.id,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
      notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      statement_descriptor: 'ANGIKE',
    };

    const mp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': order.id,
      },
      body: JSON.stringify(preference),
    });
    const pref = await mp.json();
    if (!mp.ok) {
      console.error('Mercado Pago recusou a preferência:', pref);
      await admin.from('orders').update({ status: 'error', updated_at: new Date().toISOString() }).eq('id', order.id);
      return json({ error: 'O Mercado Pago não aceitou o pedido agora. Tente novamente em alguns minutos.' }, 502);
    }

    await admin.from('orders').update({ mp_preference_id: pref.id }).eq('id', order.id);

    const isTest = MP_TOKEN.startsWith('TEST-');
    return json({ order_id: order.id, init_point: (isTest && pref.sandbox_init_point) || pref.init_point });
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, 500);
  }
});
