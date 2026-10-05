// =========================================================
// ANGIKE — mp-webhook
// O Mercado Pago chama esta função quando um pagamento muda de status.
// Por segurança, NÃO confiamos no conteúdo da notificação: buscamos o
// pagamento direto na API do Mercado Pago e só então atualizamos o pedido.
//
// Secret necessário: MP_ACCESS_TOKEN (o mesmo da create-checkout).
// Publique com "Verify JWT" DESLIGADO (o Mercado Pago não envia login).
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';

// status do Mercado Pago → status do pedido
const STATUS: Record<string, string> = {
  approved: 'paid',
  authorized: 'in_process',
  in_process: 'in_process',
  in_mediation: 'review',
  pending: 'pending',
  rejected: 'rejected',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'refunded',
};
// status que não devem "voltar atrás" por causa de uma notificação atrasada
const FINAL = ['paid', 'shipped', 'delivered', 'refunded'];

const ok = (msg = 'ok') => new Response(msg, { status: 200 });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* notificação sem corpo */ }

  const type = body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const paymentId = body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id');
  if (type !== 'payment' || !paymentId) return ok('ignorado');

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!r.ok) {
    console.error('Falha ao consultar pagamento', paymentId, r.status);
    return new Response('erro ao consultar pagamento', { status: 502 }); // o Mercado Pago tenta de novo
  }
  const payment = await r.json();
  const orderId = payment.external_reference;
  if (!orderId) return ok('sem pedido');

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: order } = await admin.from('orders').select('id, status, total_cents').eq('id', orderId).maybeSingle();
  if (!order) return ok('pedido não encontrado');

  let next = STATUS[payment.status] ?? 'review';

  // confere o valor pago
  if (next === 'paid' && Math.round(Number(payment.transaction_amount) * 100) < order.total_cents) {
    console.error('Valor pago menor que o pedido', orderId, payment.transaction_amount, order.total_cents);
    next = 'review';
  }

  if (FINAL.includes(order.status) && !['refunded'].includes(next)) return ok('já finalizado');

  const { error } = await admin.from('orders').update({
    status: next,
    mp_payment_id: String(payment.id),
    updated_at: new Date().toISOString(),
  }).eq('id', orderId);
  if (error) {
    console.error(error);
    return new Response('erro ao salvar', { status: 500 });
  }
  return ok();
});
